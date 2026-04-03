import oracledb from 'oracledb';
import db from '../../../../config/db.js';
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
