import oracledb from 'oracledb';
import db from '../../../../config/db.js';

const CREATE_PLAN_SQL = `
BEGIN
  COMP.CREATE_COMPENSATION_PLAN_PKG.CREATE_PLAN(
    P_PLAN_JSON => :p_plan_json,
    P_PLAN_ID   => :p_plan_id
  );
END;
`;

const UPDATE_PLAN_SQL = `
BEGIN
  COMP.UPDATE_COMPENSATION_PLAN_PKG.UPDATE_PLAN(
    P_PLAN_JSON => :p_plan_json
  );
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

function getOracleErrorMessage(error) {
  if (!error) return 'Unknown Oracle error';
  return error.message || String(error);
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
    throw new Error(getOracleErrorMessage(error));
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

export async function createCompensationPlan(payload) {
  return withPlanConnection(async (connection) => {
    const pPlanJson = JSON.stringify(payload);
    const result = await connection.execute(
      CREATE_PLAN_SQL,
      {
        p_plan_json: { val: pPlanJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
        p_plan_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      EXEC_OPTS
    );

    const planId = result?.outBinds?.p_plan_id ?? null;
    return planId != null ? Number(planId) : null;
  });
}

export async function updateCompensationPlan(payload) {
  const body = { ...payload };
  if (body.plan_guid != null) {
    body.plan_guid = String(body.plan_guid).trim().toUpperCase();
  }
  const pPlanJson = JSON.stringify(body);

  return withPlanConnection(async (connection) => {
    await connection.execute(
      UPDATE_PLAN_SQL,
      {
        p_plan_json: { val: pPlanJson, dir: oracledb.BIND_IN, type: oracledb.CLOB }
      },
      EXEC_OPTS
    );
  });
}

export async function deleteCompensationPlan(planGuid, deletedBy) {
  return withPlanConnection(async (connection) => {
    await connection.execute(
      DELETE_PLAN_SQL,
      {
        p_plan_guid: { val: String(planGuid), dir: oracledb.BIND_IN, type: oracledb.STRING },
        p_deleted_by: { val: String(deletedBy), dir: oracledb.BIND_IN, type: oracledb.STRING }
      },
      EXEC_OPTS
    );
  });
}
