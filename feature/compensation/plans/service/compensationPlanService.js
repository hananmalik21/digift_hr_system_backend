import oracledb from 'oracledb';
import db, { executeQuery } from '../../../../config/db.js';
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

  return withPlanConnection(async (connection) => {
    await connection.execute(
      UPDATE_PLAN_SQL,
      {
        p_plan_json: payloadToPlanJsonBind(body),
        plan_guid_hex: { val: planGuidHex, dir: oracledb.BIND_IN, type: oracledb.STRING }
      },
      EXEC_OPTS
    );
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
    components: parsePlanComponentsJson(r.COMPONENTS_JSON ?? r.components_json)
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
