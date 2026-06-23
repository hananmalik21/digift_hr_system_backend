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
import { resolveFlexfieldSegmentUserMessage } from '../utils/payFlexfieldSegmentsOracleErrors.js';

const PKG = 'PAY.PAY_FLEXFIELD_SEGMENTS_PKG';
const CREATE_PROC = `${PKG}.CREATE_SEGMENT`;
const UPDATE_PROC = `${PKG}.UPDATE_SEGMENT`;
const DELETE_PROC = `${PKG}.DELETE_SEGMENT`;

const LOG_TAG = 'payFlexfieldSegmentsModel';
const GENERIC_ERROR_MESSAGE = 'Unable to process flexfield segment. Please try again.';

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    P_ENTERPRISE_ID     => :enterprise_id,
    P_SEGMENT_NAME      => :segment_name,
    P_SEGMENT_CODE      => :segment_code,
    P_DESCRIPTION       => :description,
    P_DATA_TYPE         => :data_type,
    P_MAX_LENGTH        => :max_length,
    P_DISPLAY_SEQUENCE  => :display_sequence,
    P_REQUIRED_FLAG     => :required_flag,
    P_ENABLED_FLAG      => :enabled_flag,
    P_CREATED_BY        => :created_by,
    P_SEGMENT_ID        => :segment_id,
    P_SEGMENT_GUID      => :segment_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    P_SEGMENT_GUID      => :segment_guid,
    P_ENTERPRISE_ID     => :enterprise_id,
    P_SEGMENT_NAME      => :segment_name,
    P_SEGMENT_CODE      => :segment_code,
    P_DESCRIPTION       => :description,
    P_DATA_TYPE         => :data_type,
    P_MAX_LENGTH        => :max_length,
    P_DISPLAY_SEQUENCE  => :display_sequence,
    P_REQUIRED_FLAG     => :required_flag,
    P_ENABLED_FLAG      => :enabled_flag,
    P_LAST_UPDATED_BY   => :last_updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    P_SEGMENT_GUID      => :segment_guid
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
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolveFlexfieldSegmentUserMessage(null, err));
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createSegmentViaPackage(payload, createdBy) {
  const binds = {
    enterprise_id: numberInBind(payload.enterprise_id),
    segment_name: varcharInBind(payload.segment_name, 200),
    segment_code: codeInBind(payload.segment_code, 100),
    description: varcharInBind(payload.description, 4000),
    data_type: codeInBind(payload.data_type, 30),
    max_length: numberInBind(payload.max_length),
    display_sequence: numberInBind(payload.display_sequence),
    required_flag: ynInBind(payload.required_flag, 'N'),
    enabled_flag: ynInBind(payload.enabled_flag, 'Y'),
    created_by: auditInBind(createdBy),
    segment_id: outNumberBind(),
    segment_guid: outGuidHexBind()
  };

  return executePackageMutation(CREATE_PLSQL, binds, (outBinds) => ({
    segment_id: normalizeOutNumber(outBinds?.segment_id),
    segment_guid: normalizeOutGuidHex(outBinds?.segment_guid)
  }));
}

/**
 * @param {string} segmentGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateSegmentViaPackage(segmentGuidHex, payload, updatedBy) {
  const binds = {
    segment_guid: guidHexInBind(segmentGuidHex),
    enterprise_id: numberInBind(payload.enterprise_id),
    segment_name: varcharInBind(payload.segment_name, 200),
    segment_code: codeInBind(payload.segment_code, 100),
    description: varcharInBind(payload.description, 4000),
    data_type: codeInBind(payload.data_type, 30),
    max_length: numberInBind(payload.max_length),
    display_sequence: numberInBind(payload.display_sequence),
    required_flag: ynInBind(payload.required_flag, null),
    enabled_flag: ynInBind(payload.enabled_flag, null),
    last_updated_by: auditInBind(updatedBy)
  };

  await executePackageMutation(UPDATE_PLSQL, binds);
}

/**
 * @param {string} segmentGuidHex
 */
export async function deleteSegmentViaPackage(segmentGuidHex) {
  await executePackageMutation(DELETE_PLSQL, {
    segment_guid: guidHexInBind(segmentGuidHex)
  });
}
