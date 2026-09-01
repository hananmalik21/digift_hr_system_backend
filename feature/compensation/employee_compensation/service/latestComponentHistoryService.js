import { executeQuery } from '../../../../config/db.js';
import { convertKeysToSnakeCase } from '@digifyhr/common';

/**
 * @typedef {object} LatestHistorySnapshot
 * @property {number|null} history_id
 * @property {string|null} event_type
 * @property {string|null} event_title
 * @property {string|null} event_description
 * @property {number|null} old_amount
 * @property {number|null} new_amount
 * @property {string|null} currency_code
 * @property {string|null} effective_date
 * @property {string|null} approved_by
 * @property {string|null} approver_name
 * @property {string|null} approver_role
 * @property {string|null} change_reason
 */

/**
 * @typedef {object} LatestComponentHistoryItem
 * @property {number|null} component_id
 * @property {string|null} component_guid
 * @property {string|null} component_code
 * @property {string|null} component_name
 * @property {string|null} component_type_code
 * @property {string|null} description
 * @property {string|null} active_flag
 * @property {string|null} effective_start_date
 * @property {string|null} effective_end_date
 * @property {LatestHistorySnapshot} latest_history
 */

const LATEST_COMPONENT_HISTORY_CTE = `
WITH ranked_history AS (
  SELECT h.*,
         ROW_NUMBER() OVER (
           PARTITION BY h.enterprise_id, h.employee_id, h.component_id
           ORDER BY h.effective_date DESC,
                    h.creation_date DESC,
                    h.history_id DESC
         ) rn
  FROM COMP.COMP_EMP_COMP_HISTORY h
  WHERE h.enterprise_id = :enterprise_id
    AND h.employee_id = :employee_id
    AND (:plan_id IS NULL OR h.plan_id = :plan_id)
),
latest_joined AS (
  SELECT
    rh.history_id,
    rh.event_type,
    rh.event_title,
    rh.event_description,
    rh.old_amount,
    rh.new_amount,
    rh.currency_code,
    rh.effective_date,
    rh.approved_by,
    rh.approver_name,
    rh.approver_role,
    rh.change_reason,
    rh.component_id,
    UPPER(RAWTOHEX(cc.component_guid)) AS component_guid,
    cc.component_code,
    cc.component_name,
    cc.component_type_code,
    cc.description,
    cc.active_flag,
    cc.effective_start_date,
    cc.effective_end_date
  FROM ranked_history rh
  LEFT JOIN COMP.COMP_COMPONENTS cc
    ON cc.component_id = rh.component_id
   AND cc.tenant_id = rh.enterprise_id
  WHERE rh.rn = 1
)
`;

const LATEST_COMPONENT_HISTORY_COUNT_SQL = `${LATEST_COMPONENT_HISTORY_CTE}
SELECT COUNT(*) AS total_count
  FROM latest_joined
`;

const LATEST_COMPONENT_HISTORY_PAGE_SQL = `${LATEST_COMPONENT_HISTORY_CTE}
SELECT lj.*
  FROM latest_joined lj
 ORDER BY lj.component_id
 OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
`;

/**
 * @param {unknown} value — Oracle DATE or string
 * @returns {string | null} YYYY-MM-DD in UTC when value is a Date
 */
function toIsoDateOnly(value) {
  if (value == null) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/**
 * @param {Record<string, unknown>} r — row with snake_case keys
 * @param {string} key
 * @returns {string | null}
 */
function nonEmptyStr(r, key) {
  const v = r[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * @param {Record<string, unknown>} r
 * @param {string} key
 * @returns {number | null}
 */
function finiteNum(r, key) {
  const v = r[key];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} rawRow — Oracle OUT_FORMAT_OBJECT row
 * @returns {LatestComponentHistoryItem}
 */
function mapRow(rawRow) {
  const r = /** @type {Record<string, unknown>} */ (convertKeysToSnakeCase(rawRow));
  return {
    component_id: finiteNum(r, 'component_id'),
    component_guid: nonEmptyStr(r, 'component_guid'),
    component_code: nonEmptyStr(r, 'component_code'),
    component_name: nonEmptyStr(r, 'component_name'),
    component_type_code: nonEmptyStr(r, 'component_type_code'),
    description: nonEmptyStr(r, 'description'),
    active_flag: nonEmptyStr(r, 'active_flag'),
    effective_start_date: toIsoDateOnly(r.effective_start_date),
    effective_end_date: toIsoDateOnly(r.effective_end_date),
    latest_history: {
      history_id: finiteNum(r, 'history_id'),
      event_type: nonEmptyStr(r, 'event_type'),
      event_title: nonEmptyStr(r, 'event_title'),
      event_description: nonEmptyStr(r, 'event_description'),
      old_amount: finiteNum(r, 'old_amount'),
      new_amount: finiteNum(r, 'new_amount'),
      currency_code: nonEmptyStr(r, 'currency_code'),
      effective_date: toIsoDateOnly(r.effective_date),
      approved_by: nonEmptyStr(r, 'approved_by'),
      approver_name: nonEmptyStr(r, 'approver_name'),
      approver_role: nonEmptyStr(r, 'approver_role'),
      change_reason: nonEmptyStr(r, 'change_reason')
    }
  };
}

/**
 * @param {{ enterprise_id: number, employee_id: number, plan_id?: number }} params
 */
function buildFilterBinds(params) {
  const { enterprise_id, employee_id, plan_id } = params;
  return {
    enterprise_id,
    employee_id,
    plan_id: plan_id == null ? null : Number(plan_id)
  };
}

/**
 * @param {{ page: number, limit: number }} params
 */
function computePagination(params) {
  const safeLimit = Math.max(1, Math.min(200, Number(params.limit) || 25));
  const safePage = Math.max(1, Number(params.page) || 1);
  const offset = (safePage - 1) * safeLimit;
  return { safeLimit, offset };
}

/**
 * Latest history row per component for an employee (optional plan filter), paginated.
 * Uses a count query plus a paged query so `total` is correct when the requested page is empty.
 * @param {{ enterprise_id: number, employee_id: number, plan_id?: number, page: number, limit: number }} params
 * @returns {Promise<{ rows: LatestComponentHistoryItem[], total: number }>}
 */
export async function fetchLatestComponentHistory(params) {
  const filterBinds = buildFilterBinds(params);
  const { safeLimit, offset } = computePagination(params);
  const pageBinds = { ...filterBinds, offset, limit: safeLimit };

  const [countResult, pageResult] = await Promise.all([
    executeQuery(LATEST_COMPONENT_HISTORY_COUNT_SQL, filterBinds),
    executeQuery(LATEST_COMPONENT_HISTORY_PAGE_SQL, pageBinds)
  ]);

  const countRow = countResult.rows?.[0];
  const total = Number(countRow?.TOTAL_COUNT ?? countRow?.total_count ?? 0);
  const rawRows = pageResult.rows ?? [];
  const rows = rawRows.map((row) => mapRow(row));

  return { rows, total };
}
