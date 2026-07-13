import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  guidHexInBind,
  numberInBind
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import {
  GENERIC_TECHNICAL_ERROR,
  ORACLE_PKG
} from '../constants/payEligibility.constants.js';
import { parseResultJsonClob } from '../utils/payEligibilityClobUtils.js';

const EVALUATE_PLSQL = `
BEGIN
  ${ORACLE_PKG}.EVALUATE_EMPLOYEE_ELIGIBILITY(
    P_ENTERPRISE_ID => :enterprise_id,
    P_EMPLOYEE_GUID => :employee_guid,
    P_ELEMENT_ID    => :element_id,
    P_RESULT_JSON   => :result_json
  );
END;`;

function resultJsonOutBind() {
  return {
    result_json: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
  };
}

function buildEvaluateBinds(payload) {
  return {
    enterprise_id: numberInBind(payload.enterprise_id),
    employee_guid: guidHexInBind(payload.employee_guid),
    element_id: numberInBind(payload.element_id),
    ...resultJsonOutBind()
  };
}

async function releaseReadOnlyConnection(connection) {
  if (!connection) return;
  try {
    await connection.rollback();
  } catch (_) {}
  try {
    await connection.close();
  } catch (_) {}
}

/**
 * @param {{ enterprise_id: number, employee_guid: string, element_id: number }} payload
 * @returns {Promise<Record<string, unknown>>}
 */
export async function evaluateEmployeeEligibilityViaPackage(payload) {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(EVALUATE_PLSQL, buildEvaluateBinds(payload));
    const parsed = await parseResultJsonClob(result?.outBinds?.result_json);

    if (parsed == null) {
      throw new DatabaseError(GENERIC_TECHNICAL_ERROR, null, GENERIC_TECHNICAL_ERROR);
    }

    return parsed;
  } catch (err) {
    if (err instanceof DatabaseError) throw err;
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err, GENERIC_TECHNICAL_ERROR);
  } finally {
    await releaseReadOnlyConnection(connection);
  }
}
