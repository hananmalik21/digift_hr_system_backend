import path from 'path';
import oracledb from 'oracledb';
import { getOracleErrorMessage } from '../utils/oracleErrorMessage.js';
import { withCompConnection } from '../utils/withCompConnection.js';
import { shouldLogEmployeeCompEditComponents } from '../utils/envFlags.js';
import { buildEditComponentsPlsql } from './editComponentsPlsql.js';

/**
 * Employee compensation: create (JSON) + edit (multipart + PL/SQL).
 *
 * Layout: `editComponentsPlsql.js` (anonymous edit block), `../utils/` (connection + env),
 * this file (create SQL, binds, Oracle error classification, document helpers).
 *
 * Oracle: COMP.EMPLOYEE_COMPENSATION.t_component_rec must include currency_code (VARCHAR2)
 * and create/edit package bodies must persist it on COMP_EMP_COMP_ASSIGNMENT_DTL (or equivalent).
 * Edit: t_component_rec must include adjustment_method (VARCHAR2), set from each components JSON object.
 * Create: API requires plan_id on each JSON row; :plan_id bind is NULL (Oracle uses row plan_id only).
 */
const CREATE_COMPONENTS_VIA_JSON = `
DECLARE
  l_tab COMP.EMPLOYEE_COMPENSATION.t_component_tab := COMP.EMPLOYEE_COMPENSATION.t_component_tab();
  j JSON_ARRAY_T := JSON_ARRAY_T(:components_json);
BEGIN
  FOR i IN 0 .. j.get_size() - 1 LOOP
    DECLARE
      o JSON_OBJECT_T := TREAT(j.get(i) AS JSON_OBJECT_T);
      rec COMP.EMPLOYEE_COMPENSATION.t_component_rec;
      v_start VARCHAR2(40);
      v_end VARCHAR2(40);
    BEGIN
      rec.component_id := o.get_number('component_id');
      IF o.has('plan_id') AND o.get_type('plan_id') <> 'NULL' THEN
        rec.plan_id := o.get_number('plan_id');
      ELSE
        rec.plan_id := NULL;
      END IF;
      rec.amount := o.get_number('amount');
      rec.currency_code := TRIM(UPPER(o.get_string('currency_code')));
      v_start := TRIM(o.get_string('effective_start_date'));
      rec.effective_start_date := TO_DATE(SUBSTR(v_start, 1, 10), 'YYYY-MM-DD');
      IF NOT o.has('effective_end_date')
         OR o.get_type('effective_end_date') = 'NULL' THEN
        rec.effective_end_date := NULL;
      ELSE
        v_end := TRIM(o.get_string('effective_end_date'));
        IF v_end IS NULL OR LENGTH(v_end) < 10 THEN
          rec.effective_end_date := NULL;
        ELSE
          rec.effective_end_date := TO_DATE(SUBSTR(v_end, 1, 10), 'YYYY-MM-DD');
        END IF;
      END IF;
      IF NOT o.has('active_flag') OR o.get_type('active_flag') = 'NULL' THEN
        rec.active_flag := 'Y';
      ELSE
        rec.active_flag := SUBSTR(TRIM(UPPER(o.get_string('active_flag'))), 1, 1);
      END IF;
      l_tab.EXTEND;
      l_tab(l_tab.COUNT) := rec;
    END;
  END LOOP;
  COMP.EMPLOYEE_COMPENSATION.create_components(
    p_enterprise_id => :enterprise_id,
    p_employee_id   => :employee_id,
    p_plan_id       => :plan_id,
    p_components    => l_tab,
    p_created_by    => :created_by
  );
END;
`;

const JSON_STRING_MAX = (() => {
  const raw = process.env.DB_COMP_COMPONENTS_JSON_MAX;
  if (raw === undefined || raw === '') return 30000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 30000;
  return n;
})();

const TEXT_CLOB_THRESHOLD = (() => {
  const raw = process.env.DB_TEXT_CLOB_THRESHOLD;
  if (raw === undefined || raw === '') return 32000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 32000;
  return n;
})();

export const EMP_COMP_MAX_EDIT_DOCUMENTS = (() => {
  const raw = process.env.EMP_COMP_MAX_EDIT_DOCUMENTS;
  if (raw === undefined || raw === '') return 25;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 25;
  return Math.min(n, 100);
})();

function componentsJsonBind(jsonString) {
  if (JSON_STRING_MAX > 0 && jsonString.length <= JSON_STRING_MAX) {
    return { val: jsonString, dir: oracledb.BIND_IN, type: oracledb.STRING };
  }
  return { val: jsonString, dir: oracledb.BIND_IN, type: oracledb.CLOB };
}

function textClobBind(value) {
  const s = String(value);
  if (s.length <= TEXT_CLOB_THRESHOLD) {
    return { val: s, dir: oracledb.BIND_IN, type: oracledb.STRING };
  }
  return { val: s, dir: oracledb.BIND_IN, type: oracledb.CLOB };
}

function nullableTextClobBind(value) {
  if (value == null || String(value).trim() === '') {
    return { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING };
  }
  return textClobBind(String(value));
}

function parseIsoDateOnly(iso) {
  const [y, m, d] = String(iso)
    .trim()
    .slice(0, 10)
    .split('-')
    .map((x) => Number.parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Resolves :plan_id bind for create_components / edit_components: NULL when every row has plan_id (Oracle NVL per row).
 * @param {object[]} components
 * @param {number | null | undefined} topLevelPlanId
 * @returns {number | null}
 */
function resolveComponentsPlanBind(components, topLevelPlanId) {
  const rows = Array.isArray(components) ? components : [];
  if (rows.length === 0) {
    throw new Error('At least one component row is required');
  }
  const allRowsHavePlanId = rows.every((c) => {
    const pid = Number(c?.plan_id);
    return Number.isFinite(pid) && pid > 0;
  });
  if (allRowsHavePlanId) return null;
  const fb = Number(topLevelPlanId);
  if (!Number.isFinite(fb) || fb <= 0) {
    throw new Error(
      'Each component must include plan_id, or provide a valid top-level plan_id for rows that omit it'
    );
  }
  return fb;
}

function summarizeComponentRowsForLog(components) {
  if (!Array.isArray(components)) return [];
  return components.map((c, idx) => ({
    idx,
    plan_id: c?.plan_id ?? null,
    component_id: c?.component_id ?? null,
    amount: c?.amount ?? null,
    adjustment_method: c?.adjustment_method ?? null,
    replace_flag: c?.replace_flag ?? null,
    replace: Object.prototype.hasOwnProperty.call(c || {}, 'replace') ? c.replace : undefined,
    delete_flag: c?.delete_flag ?? null,
    delete: Object.prototype.hasOwnProperty.call(c || {}, 'delete') ? c.delete : undefined
  }));
}

export function classifyEmployeeCompOracleError(error) {
  const raw = getOracleErrorMessage(error);
  const line = raw.split(/\n/)[0].replace(/\s*Help:\s*https?:\/\/[^\s]*/gi, '').trim();
  const norm = line.replace(/\s+/g, ' ').toLowerCase();

  if (
    norm.includes('ora-20121') ||
    (norm.includes('active component does not exist') && norm.includes('component_id'))
  ) {
    const m = line.match(/component_id\s+(\d+)/i);
    const componentId = m ? Number(m[1]) : null;
    const suffix =
      ' For a first-time line for that component on this plan, include "replace_flag":"TRUE" (or "replace":true) on that row. ' +
      'To change an existing active line only, omit replace_flag or use FALSE. ' +
      'To add a new component and keep or adjust others in one adjustment, send one JSON object per component_id in the components array.';
    return {
      kind: 'missing_active_component',
      message: componentId
        ? `No active assignment row for COMPONENT_ID ${componentId}.${suffix}`
        : `No active assignment row for the given COMPONENT_ID.${suffix}`,
      component_id: componentId
    };
  }

  if (
    norm.includes('plan is already attached with employee') ||
    (norm.includes('already') && norm.includes('attached') && norm.includes('employee'))
  ) {
    return { kind: 'already_attached', message: 'Plan is already attached with employee' };
  }
  if (
    norm.includes('plan is not attached with employee') ||
    (norm.includes('not attached') && norm.includes('employee') && norm.includes('plan'))
  ) {
    return { kind: 'not_attached', message: 'Plan is not attached with employee' };
  }

  return { kind: 'other', message: line || 'Something went wrong' };
}

function truncateStr(s, max) {
  if (s == null) return '';
  const t = String(s);
  return t.length <= max ? t : t.slice(0, max);
}

/** Extension without dot, lowercase (FILE_EXTENSION). */
function fileExtensionFromOriginalName(originalname) {
  const ext = path.extname(originalname || '');
  if (!ext || ext === '.') return '';
  return ext.slice(1).toLowerCase();
}

/**
 * @param {import('express').Request['file'][]} files
 * @param {string[]} descriptions parallel to files (optional)
 */
function appendDocumentBinds(binds, files, descriptions) {
  const n = Math.min(files.length, EMP_COMP_MAX_EDIT_DOCUMENTS);
  for (let i = 0; i < n; i++) {
    const f = files[i];
    const buf = Buffer.isBuffer(f.buffer) ? f.buffer : Buffer.from(f.buffer || []);
    const baseName = truncateStr(path.basename(f.originalname || `file_${i}`), 255);
    const ext = truncateStr(fileExtensionFromOriginalName(f.originalname), 50);
    const mime = truncateStr(f.mimetype || 'application/octet-stream', 150);
    const desc =
      descriptions[i] != null && String(descriptions[i]).trim() !== ''
        ? truncateStr(String(descriptions[i]).trim(), 500)
        : null;

    binds[`doc_fn_${i}`] = baseName;
    binds[`doc_fe_${i}`] = ext || null;
    binds[`doc_mt_${i}`] = mime;
    binds[`doc_fs_${i}`] = f.size != null ? Number(f.size) : buf.length;
    binds[`doc_fb_${i}`] = {
      val: buf,
      dir: oracledb.BIND_IN,
      type: oracledb.BLOB
    };
    binds[`doc_fd_${i}`] =
      desc != null
        ? desc
        : { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING };
    binds[`doc_af_${i}`] = 'Y';
  }
  return n;
}

/**
 * @param {{ enterprise_id: number, employee_id: number, plan_id: number | null, created_by: string, components: object[] }} payload
 */
export async function createEmployeeCompensationComponents(payload) {
  const planIdBind = resolveComponentsPlanBind(payload.components, payload.plan_id);
  await withCompConnection(async (connection) => {
    await connection.execute(
      CREATE_COMPONENTS_VIA_JSON,
      {
        enterprise_id: payload.enterprise_id,
        employee_id: payload.employee_id,
        plan_id: planIdBind,
        created_by: String(payload.created_by),
        components_json: componentsJsonBind(JSON.stringify(payload.components))
      },
      { autoCommit: false }
    );
  });
}

/**
 * @param {{
 *   enterprise_id: number,
 *   employee_id: number,
 *   plan_id: number | null,
 *   adjustment_type: string,
 *   effective_date: string,
 *   reason_code: string,
 *   budget_code: string,
 *   justification_text: string,
 *   performance_rating: string | null,
 *   internal_notes: string | null,
 *   updated_by: string,
 *   components: (object & { plan_id: number, adjustment_method: string })[]
 * }} payload
 * @param {import('multer').File[]} files
 * @param {string[]} [documentDescriptions]
 */
export async function editEmployeeCompensationComponents(
  payload,
  files = [],
  documentDescriptions = []
) {
  const perf =
    payload.performance_rating == null || String(payload.performance_rating).trim() === ''
      ? null
      : String(payload.performance_rating).trim();

  const fileSlice = files.slice(0, EMP_COMP_MAX_EDIT_DOCUMENTS);
  const maxDocCount = Math.min(files.length, EMP_COMP_MAX_EDIT_DOCUMENTS);
  const planIdBind = resolveComponentsPlanBind(payload.components, payload.plan_id);

  if (shouldLogEmployeeCompEditComponents()) {
    // eslint-disable-next-line no-console
    console.info(
      '[employee-compensation/edit] components snapshot (COMP_LOG_COMPONENT_FLAGS)',
      JSON.stringify({
        enterprise_id: payload.enterprise_id,
        employee_id: payload.employee_id,
        plan_id_bind: planIdBind,
        plan_ids: [...new Set(payload.components.map((c) => c?.plan_id).filter(Boolean))],
        docCount: maxDocCount,
        components: summarizeComponentRowsForLog(payload.components)
      })
    );
  }

  await withCompConnection(async (connection) => {
    const plsql = buildEditComponentsPlsql(maxDocCount);
    const binds = {
      enterprise_id: payload.enterprise_id,
      employee_id: payload.employee_id,
      plan_id: planIdBind,
      adjustment_type: String(payload.adjustment_type).trim(),
      effective_date: {
        val: parseIsoDateOnly(payload.effective_date),
        dir: oracledb.BIND_IN,
        type: oracledb.DATE
      },
      reason_code: String(payload.reason_code).trim(),
      budget_code: String(payload.budget_code).trim(),
      justification_text: textClobBind(payload.justification_text),
      performance_rating: perf,
      internal_notes: nullableTextClobBind(payload.internal_notes),
      updated_by: String(payload.updated_by).trim(),
      components_json: componentsJsonBind(JSON.stringify(payload.components))
    };
    if (maxDocCount > 0) {
      appendDocumentBinds(binds, fileSlice, documentDescriptions);
    }
    await connection.execute(plsql, binds, { autoCommit: false });
  });
}
