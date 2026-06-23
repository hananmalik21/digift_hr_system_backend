import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  numberInBind,
  outGuidHexBind,
  outNumberBind,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { resolveFlexfieldSegmentValueUserMessage } from '../utils/payFlexfieldSegmentValuesOracleErrors.js';

const PKG = 'PAY.PAY_FLEXFIELD_VALUES_PKG';
const LOG_TAG = 'payFlexfieldSegmentValuesModel';
const GENERIC_ERROR_MESSAGE = 'Unable to process flexfield segment value. Please try again.';

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_VALUE(
    P_SEGMENT_ID         => :segment_id,
    P_ENTERPRISE_ID      => :enterprise_id,
    P_VALUE_CODE         => :value_code,
    P_VALUE_NAME         => :value_name,
    P_DESCRIPTION        => :description,
    P_ENABLED_FLAG       => :enabled_flag,
    P_CREATED_BY         => :created_by,
    P_SEGMENT_VALUE_ID   => :segment_value_id,
    P_SEGMENT_VALUE_GUID => :segment_value_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_VALUE(
    P_SEGMENT_VALUE_GUID => :segment_value_guid,
    P_SEGMENT_ID         => :segment_id,
    P_ENTERPRISE_ID      => :enterprise_id,
    P_VALUE_CODE         => :value_code,
    P_VALUE_NAME         => :value_name,
    P_DESCRIPTION        => :description,
    P_ENABLED_FLAG       => :enabled_flag,
    P_LAST_UPDATED_BY    => :last_updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_VALUE(
    P_SEGMENT_VALUE_GUID => :segment_value_guid
  );
END;`;

function logOracleError(err) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${code}`, err?.message || err);
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {(outBinds: Record<string, unknown>|undefined) => Record<string, unknown>} [parseOut]
 */
async function executePackageMutation(plsql, binds, parseOut) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    await connection.commit();
    return parseOut ? parseOut(result?.outBinds) : {};
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    logOracleError(err);
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolveFlexfieldSegmentValueUserMessage(null, err));
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * @param {number} segmentId
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createSegmentValueViaPackage(segmentId, payload, createdBy) {
  const binds = {
    segment_id: numberInBind(segmentId),
    enterprise_id: numberInBind(payload.enterprise_id),
    value_code: codeInBind(payload.value_code, 100),
    value_name: varcharInBind(payload.value_name, 200),
    description: varcharInBind(payload.description, 4000),
    enabled_flag: ynInBind(payload.enabled_flag, 'Y'),
    created_by: auditInBind(createdBy),
    segment_value_id: outNumberBind(),
    segment_value_guid: outGuidHexBind()
  };

  return executePackageMutation(CREATE_PLSQL, binds, (outBinds) => ({
    segment_value_id: normalizeOutNumber(outBinds?.segment_value_id),
    segment_value_guid: normalizeOutGuidHex(outBinds?.segment_value_guid)
  }));
}

/**
 * @param {string} segmentValueGuidHex
 * @param {number} segmentId
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateSegmentValueViaPackage(segmentValueGuidHex, segmentId, payload, updatedBy) {
  const binds = {
    segment_value_guid: guidHexInBind(segmentValueGuidHex),
    segment_id: numberInBind(segmentId),
    enterprise_id: numberInBind(payload.enterprise_id),
    value_code: codeInBind(payload.value_code, 100),
    value_name: varcharInBind(payload.value_name, 200),
    description: varcharInBind(payload.description, 4000),
    enabled_flag: ynInBind(payload.enabled_flag, null),
    last_updated_by: auditInBind(updatedBy)
  };

  await executePackageMutation(UPDATE_PLSQL, binds);
}

/**
 * @param {string} segmentValueGuidHex
 */
export async function deleteSegmentValueViaPackage(segmentValueGuidHex) {
  await executePackageMutation(DELETE_PLSQL, {
    segment_value_guid: guidHexInBind(segmentValueGuidHex)
  });
}
