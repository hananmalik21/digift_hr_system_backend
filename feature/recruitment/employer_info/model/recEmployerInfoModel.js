/**
 * REC.REC_EMPLOYER_INFO_PKG.INVOKE mutations.
 */

import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { parseJsonClobOut, textClobBind } from '../../../compensation/utils/oracleClobBinds.js';
import { oraclePlsqlErrorMessage } from '../../../../utils/oraclePackageUtils.js';
import { ACTIONS, PKG } from '../utils/recEmployerInfoConstants.js';
import { MESSAGES, packageStatusIsSuccess } from '../utils/recEmployerInfoDb.js';
import { mapPackageResultData } from '../utils/recEmployerInfoMapper.js';

const INVOKE_PLSQL = `
BEGIN
  ${PKG}.INVOKE(
    p_action         => :p_action,
    p_payload_json   => :p_payload_json,
    p_logo           => :p_logo,
    p_logo_file_name => :p_logo_file_name,
    p_logo_mime_type => :p_logo_mime_type,
    p_result_json    => :p_result_json,
    p_status         => :p_status,
    p_message        => :p_message
  );
END;`;

function logoBlobBind(logoBuffer) {
  return {
    val: logoBuffer == null ? null : logoBuffer,
    dir: oracledb.BIND_IN,
    type: oracledb.BLOB
  };
}

function nullableStringBind(value, maxSize) {
  if (value == null || String(value).trim() === '') {
    return { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize };
  }
  return { val: String(value), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize };
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} payload
 * @param {{ buffer?: Buffer, file_name?: string, mime_type?: string }|null} [logo]
 */
export async function invokeEmployerInfoPackage(action, payload, logo = null) {
  let connection;
  try {
    connection = await db.getConnection();

    const binds = {
      p_action: {
        val: String(action).trim().toUpperCase(),
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 64
      },
      p_payload_json: textClobBind(JSON.stringify(payload ?? {})),
      p_logo: logoBlobBind(logo?.buffer),
      p_logo_file_name: nullableStringBind(logo?.file_name, 500),
      p_logo_mime_type: nullableStringBind(logo?.mime_type, 200),
      p_result_json: { dir: oracledb.BIND_OUT, type: oracledb.CLOB },
      p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 80 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    };

    const result = await connection.execute(INVOKE_PLSQL, binds, { autoCommit: false });
    const out = result.outBinds ?? {};
    const status = out.p_status != null ? String(out.p_status).trim() : '';
    const message = out.p_message != null ? String(out.p_message).trim() : '';
    const rawData = await parseJsonClobOut(out.p_result_json);
    const data = mapPackageResultData(rawData);

    if (packageStatusIsSuccess(status)) {
      await connection.commit();
    } else {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    return { status, message, data, rawData };
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }
    console.error(
      '[recEmployerInfoModel]',
      err?.errorNum != null ? `ORA-${err.errorNum}` : '',
      '[redacted]'
    );
    return {
      status: 'E',
      message: oraclePlsqlErrorMessage(err, MESSAGES.FALLBACK),
      data: null,
      rawData: null
    };
  } finally {
    if (connection?.close) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

export function createEmployerInfo(payload, logo) {
  return invokeEmployerInfoPackage(ACTIONS.CREATE, payload, logo);
}

export function updateEmployerInfo(payload, logo) {
  return invokeEmployerInfoPackage(ACTIONS.UPDATE, payload, logo);
}

export function deleteEmployerInfo(employerInfoGuid) {
  return invokeEmployerInfoPackage(ACTIONS.DELETE, { employer_info_guid: employerInfoGuid });
}

export function setEmployerInfoStatus(employerInfoGuid, activeFlag) {
  return invokeEmployerInfoPackage(ACTIONS.SET_STATUS, {
    employer_info_guid: employerInfoGuid,
    active_flag: activeFlag
  });
}

export function clearEmployerInfoLogo(employerInfoGuid) {
  return invokeEmployerInfoPackage(ACTIONS.CLEAR_LOGO, {
    employer_info_guid: employerInfoGuid
  });
}
