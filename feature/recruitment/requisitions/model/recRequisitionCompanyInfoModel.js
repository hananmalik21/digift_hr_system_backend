/**
 * Read requisition company info from REC.V_REQUISITION_COMPANY_INFO.
 * Organization hierarchy is resolved by the view — Node does not traverse ORG_UNITS.
 */

import oracledb from 'oracledb';
import { NotFoundError } from '../../../../utils/errors/index.js';
import { hexToRawBuffer } from '@digifyhr/common';
import {
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { LOG_TAG, MESSAGES } from '../utils/recRequisitionCompanyInfoConstants.js';
import { mapRequisitionCompanyInfoRow } from '../utils/recRequisitionCompanyInfoMapper.js';
import { SELECT_BY_GUID_AND_ENTERPRISE } from '../utils/recRequisitionCompanyInfoSql.js';

/**
 * Typed binds — never SQL-concatenate GUID or enterprise.
 * @param {string} requisitionGuidHex — validated 32-char hex
 * @param {number} enterpriseId
 */
export function buildCompanyInfoBinds(requisitionGuidHex, enterpriseId) {
  return {
    p_requisition_guid: {
      val: hexToRawBuffer(requisitionGuidHex),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };
}

/**
 * @param {string} requisitionGuidHex — validated 32-char hex
 * @param {number} enterpriseId
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getRequisitionCompanyInfo(requisitionGuidHex, enterpriseId) {
  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        SELECT_BY_GUID_AND_ENTERPRISE,
        buildCompanyInfoBinds(requisitionGuidHex, enterpriseId),
        ROW_OPTS
      );
      const row = result.rows?.[0];
      if (!row) throw new NotFoundError(MESSAGES.NOT_FOUND);
      return mapRequisitionCompanyInfoRow(row);
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} getRequisitionCompanyInfo`, MESSAGES.READ_ERROR);
  }
}
