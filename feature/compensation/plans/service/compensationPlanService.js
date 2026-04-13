import oracledb from 'oracledb';
import db, { executeQuery } from '../../../../config/db.js';
import { normalizeComponentForGetResponse } from '../../components/normalizeComponentGetResponse.js';
import {
  normalizePlanGuidHex,
  PLAN_GUID_VALIDATION_MESSAGE
} from '../planGuid.js';

/* After CREATE_PLAN, sync plan ↔ employees (all five criteria incl. BU / BUSINESS_UNIT
   node in org_structure_list per PKG_PLAN_EMPLOYEES). Avoid AFTER INSERT alone. */
const CREATE_PLAN_SQL = `
DECLARE
  l_plan_id NUMBER;
BEGIN
  COMP.CREATE_COMPENSATION_PLAN_PKG.CREATE_PLAN(
    P_PLAN_JSON => :p_plan_json,
    P_PLAN_ID   => l_plan_id
  );
  IF l_plan_id IS NOT NULL THEN
    COMP.PKG_PLAN_EMPLOYEES.SYNC_FOR_PLAN(l_plan_id);
  END IF;
  :p_plan_id := l_plan_id;
END;
`;

/* Re-sync after criteria change (e.g. business_units) so COMP_PLAN_EMP_ASSIGNMENT
   reflects job family, grade, position, employment type, and BU rules. */
const UPDATE_PLAN_SQL = `
DECLARE
  l_plan_id NUMBER;
BEGIN
  COMP.UPDATE_COMPENSATION_PLAN_PKG.UPDATE_PLAN(
    P_PLAN_JSON => :p_plan_json
  );
  BEGIN
    SELECT p.plan_id
      INTO l_plan_id
      FROM comp.comp_plans p
     WHERE p.plan_guid = HEXTORAW(:plan_guid_hex);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      l_plan_id := NULL;
  END;
  IF l_plan_id IS NOT NULL THEN
    COMP.PKG_PLAN_EMPLOYEES.SYNC_FOR_PLAN(l_plan_id);
  END IF;
END;
`;

const DELETE_PLAN_SQL = `
BEGIN
  COMP.DELETE_COMPENSATION_PLAN_PKG.DELETE_PLAN(
    P_PLAN_GUID  => HEXTORAW(:p_plan_guid),
    P_DELETED_BY => :p_deleted_by
  );
END;
`;

/**
 * UPDATE_COMPENSATION_PLAN_PKG.UPDATE_PLAN does not reliably persist `components`
 * into COMP.COMP_PLAN_COMPONENTS. When the client sends `components`, mirror the
 * intended list with MERGE + DELETE (same transaction as UPDATE_PLAN).
 * Set COMP_PLAN_SKIP_COMPONENTS_NODE_SYNC=true to skip (e.g. if the DB package is fixed later).
 */
const SKIP_PLAN_COMPONENTS_NODE_SYNC =
  String(process.env.COMP_PLAN_SKIP_COMPONENTS_NODE_SYNC || '')
    .trim()
    .toLowerCase() === 'true' ||
  String(process.env.COMP_PLAN_SKIP_COMPONENTS_NODE_SYNC || '').trim() === '1';

const SYNC_PLAN_COMPONENTS_SQL = `
DECLARE
  l_plan_id NUMBER;
  l_actor   VARCHAR2(200);
BEGIN
  SELECT p.plan_id
    INTO l_plan_id
    FROM comp.comp_plans p
   WHERE p.plan_guid = HEXTORAW(:plan_guid_hex);

  l_actor := NVL(SUBSTR(:actor, 1, 200), 'SYSTEM');

  MERGE INTO comp.comp_plan_components t
  USING (
    SELECT l_plan_id AS plan_id,
           j.component_id,
           NVL(j.display_sequence, 1) AS display_sequence,
           CASE
             WHEN UPPER(TRIM(j.mandatory_flag)) LIKE 'Y%' THEN 'Y'
             ELSE 'N'
           END AS mandatory_flag,
           CASE
             WHEN UPPER(TRIM(j.active_flag)) LIKE 'N%' THEN 'N'
             ELSE 'Y'
           END AS active_flag,
           NVL(SUBSTR(TRIM(j.created_by), 1, 200), l_actor) AS row_created_by
      FROM JSON_TABLE(
             :components_json,
             '$[*]'
             COLUMNS (
               component_id       NUMBER         PATH '$.component_id',
               display_sequence   NUMBER         PATH '$.display_sequence',
               mandatory_flag     VARCHAR2(10) PATH '$.mandatory_flag',
               active_flag        VARCHAR2(10) PATH '$.active_flag',
               created_by         VARCHAR2(200) PATH '$.created_by'
             )
           ) j
     WHERE j.component_id IS NOT NULL
  ) s
  ON (t.plan_id = s.plan_id AND t.component_id = s.component_id)
  WHEN MATCHED THEN
    UPDATE SET
      t.display_sequence   = s.display_sequence,
      t.mandatory_flag     = s.mandatory_flag,
      t.active_flag        = s.active_flag,
      t.last_updated_by    = l_actor,
      t.last_update_date   = SYSDATE
  WHEN NOT MATCHED THEN
    INSERT (
      plan_component_id,
      plan_id,
      component_id,
      display_sequence,
      mandatory_flag,
      active_flag,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    VALUES (
      comp.comp_plan_components_seq.NEXTVAL,
      s.plan_id,
      s.component_id,
      s.display_sequence,
      s.mandatory_flag,
      s.active_flag,
      s.row_created_by,
      SYSDATE,
      l_actor,
      SYSDATE
    );

  DELETE FROM comp.comp_plan_components t
   WHERE t.plan_id = l_plan_id
     AND NOT EXISTS (
           SELECT 1
             FROM JSON_TABLE(
                    :components_json,
                    '$[*]'
                    COLUMNS (component_id NUMBER PATH '$.component_id')
                  ) j
            WHERE j.component_id IS NOT NULL
              AND j.component_id = t.component_id
         );
END;
`;

const EXEC_OPTS = { autoCommit: false };

/**
 * Below this size (chars), bind plan JSON as STRING (faster than a CLOB).
 * Set env `DB_PLAN_JSON_STRING_MAX=0` to always use CLOB (e.g. if Oracle rejects large VARCHAR2 binds).
 */
const PLAN_JSON_STRING_MAX = (() => {
  const raw = process.env.DB_PLAN_JSON_STRING_MAX;
  if (raw === undefined || raw === '') return 30000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 30000;
  return n;
})();

function getOracleErrorMessage(error) {
  if (!error) return 'Unknown Oracle error';
  return error.message || String(error);
}

/**
 * One stringify; use VARCHAR2-style bind for typical payloads to cut LOB round-trips.
 * @param {object} payload
 */
function payloadToPlanJsonBind(payload) {
  const json = JSON.stringify(payload);
  if (PLAN_JSON_STRING_MAX > 0 && json.length <= PLAN_JSON_STRING_MAX) {
    return { val: json, dir: oracledb.BIND_IN, type: oracledb.STRING };
  }
  return { val: json, dir: oracledb.BIND_IN, type: oracledb.CLOB };
}

/**
 * Runs work in a transaction: commit on success, rollback on failure, always closes the connection.
 * @param {(connection: import('oracledb').Connection) => Promise<unknown>} fn
 */
async function withPlanConnection(fn) {
  const connection = await db.getConnection();
  try {
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}
    throw new Error(getOracleErrorMessage(error), { cause: error });
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * @param {object} payload
 * @returns {Promise<number | null>} new plan_id or null
 */
export async function createCompensationPlan(payload) {
  return withPlanConnection(async (connection) => {
    const result = await connection.execute(
      CREATE_PLAN_SQL,
      {
        p_plan_json: payloadToPlanJsonBind(payload),
        p_plan_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      EXEC_OPTS
    );

    const planId = result?.outBinds?.p_plan_id ?? null;
    return planId != null ? Number(planId) : null;
  });
}

/**
 * @param {object} payload
 */
export async function updateCompensationPlan(payload) {
  const body = { ...payload };
  if (body.plan_guid != null) {
    body.plan_guid = String(body.plan_guid).trim().toUpperCase();
  }
  const planGuidHex = normalizePlanGuidHex(body.plan_guid);
  if (!planGuidHex) {
    throw new Error(PLAN_GUID_VALIDATION_MESSAGE);
  }

  const syncComponentsRequested =
    !SKIP_PLAN_COMPONENTS_NODE_SYNC &&
    Object.prototype.hasOwnProperty.call(payload, 'components');
  if (syncComponentsRequested && payload.components != null && !Array.isArray(payload.components)) {
    throw new Error('components must be an array when provided');
  }

  return withPlanConnection(async (connection) => {
    await connection.execute(
      UPDATE_PLAN_SQL,
      {
        p_plan_json: payloadToPlanJsonBind(body),
        plan_guid_hex: { val: planGuidHex, dir: oracledb.BIND_IN, type: oracledb.STRING }
      },
      EXEC_OPTS
    );

    if (syncComponentsRequested && Array.isArray(payload.components)) {
      const actor = String(
        body.last_updated_by ?? body.updated_by ?? body.created_by ?? 'SYSTEM'
      ).trim();
      await connection.execute(
        SYNC_PLAN_COMPONENTS_SQL,
        {
          plan_guid_hex: { val: planGuidHex, dir: oracledb.BIND_IN, type: oracledb.STRING },
          components_json: payloadToPlanJsonBind(payload.components),
          actor: { val: actor || 'SYSTEM', dir: oracledb.BIND_IN, type: oracledb.STRING }
        },
        EXEC_OPTS
      );
    }
  });
}

/**
 * @param {string} planGuid
 * @param {string} deletedBy
 */
const ELIGIBLE_PLANS_FOR_EMPLOYEE_SQL = `
SELECT v.enterprise_id,
       v.plan_id,
       UPPER(RAWTOHEX(v.plan_guid)) AS plan_guid,
       v.plan_code,
       v.plan_name,
       (
         SELECT NVL(
           JSON_ARRAYAGG(
             JSON_OBJECT(
               'component_id' VALUE c.component_id,
               'component_guid' VALUE UPPER(RAWTOHEX(c.component_guid)),
               'component_code' VALUE c.component_code,
               'component_name' VALUE c.component_name,
               'description' VALUE c.description,
               'component_type_code' VALUE c.component_type_code,
               'display_sequence' VALUE pc.display_sequence,
               'mandatory_flag' VALUE pc.mandatory_flag,
               'active_flag' VALUE pc.active_flag
             )
             ORDER BY NVL(pc.display_sequence, 999999), pc.plan_component_id
             RETURNING CLOB
           ),
           '[]'
         )
           FROM comp.comp_plan_components pc
           JOIN comp.comp_components c
             ON c.component_id = pc.component_id
            AND c.tenant_id = v.enterprise_id
          WHERE pc.plan_id = v.plan_id
       ) AS components_json
  FROM comp.v_employee_eligible_plans v
 WHERE v.employee_guid = HEXTORAW(:employee_guid_hex)
 ORDER BY v.plan_id
`;

function parsePlanComponentsJson(raw) {
  if (raw == null || raw === '') return [];
  if (typeof raw !== 'string') {
    return Array.isArray(raw) ? raw : [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Rows from COMP.V_EMPLOYEE_ELIGIBLE_PLANS (deploy sql/create_view_v_employee_eligible_plans.sql).
 * Plan lines from COMP.COMP_PLAN_COMPONENTS + COMP.COMP_COMPONENTS (tenant_id = enterprise_id).
 * @param {string} employeeGuidHex 32-char uppercase hex (no 0x), for HEXTORAW
 * @returns {Promise<object[]>}
 */
export async function getEligiblePlansForEmployee(employeeGuidHex) {
  const result = await executeQuery(ELIGIBLE_PLANS_FOR_EMPLOYEE_SQL, {
    employee_guid_hex: employeeGuidHex
  });
  const rows = result.rows ?? [];
  return rows.map((r) => ({
    enterprise_id: r.ENTERPRISE_ID ?? r.enterprise_id,
    plan_id: r.PLAN_ID ?? r.plan_id,
    plan_guid: r.PLAN_GUID ?? r.plan_guid,
    plan_code: r.PLAN_CODE ?? r.plan_code,
    plan_name: r.PLAN_NAME ?? r.plan_name,
    components: parsePlanComponentsJson(r.COMPONENTS_JSON ?? r.components_json).map(
      normalizeComponentForGetResponse
    )
  }));
}

export async function deleteCompensationPlan(planGuid, deletedBy) {
  const hex = normalizePlanGuidHex(planGuid);
  if (!hex) {
    throw new Error(PLAN_GUID_VALIDATION_MESSAGE);
  }

  return withPlanConnection(async (connection) => {
    await connection.execute(
      DELETE_PLAN_SQL,
      {
        p_plan_guid: { val: hex, dir: oracledb.BIND_IN, type: oracledb.STRING },
        p_deleted_by: { val: String(deletedBy ?? 'SYSTEM'), dir: oracledb.BIND_IN, type: oracledb.STRING }
      },
      EXEC_OPTS
    );
  });
}
