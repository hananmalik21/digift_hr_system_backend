/**
 * PAY.PAY_GL_ELEMENT_MAPPINGS — master data table, no Oracle package.
 */

import oracledb from 'oracledb';
import { queryPayList, queryPayOne, executePayDml, outIdGuidBinds } from '../../shared/index.js';

const FROM = 'PAY.PAY_GL_ELEMENT_MAPPINGS v';

const SORT = {
  accounting_class_code: 'v.ACCOUNTING_CLASS_CODE',
  status_code: 'v.STATUS_CODE',
  creation_date: 'v.CREATION_DATE'
};

export function listGlElementMappings({ enterpriseId, page, pageSize, statusCode, elementId, glAccountId, sortBy, sortOrder, search }) {
  return queryPayList({
    fromSql: FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: statusCode },
      { sql: 'v.ELEMENT_ID = :element_id', bind: 'element_id', value: elementId },
      { sql: 'v.GL_ACCOUNT_ID = :gl_account_id', bind: 'gl_account_id', value: glAccountId }
    ],
    search: { columns: ['v.ACCOUNTING_CLASS_CODE', 'v.LINE_DESCRIPTION'], value: search },
    allowedSort: SORT,
    defaultSort: 'v.CREATION_DATE DESC',
    sortBy,
    sortOrder,
    page,
    pageSize,
    logTag: 'payGlElementMappings'
  });
}

export function getGlElementMappingById(enterpriseId, glMappingId) {
  return queryPayOne({
    fromSql: FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.GL_MAPPING_ID = :gl_mapping_id', bind: 'gl_mapping_id', value: glMappingId }
    ],
    logTag: 'payGlElementMappings'
  });
}

export async function createGlElementMapping(payload) {
  const sql = `
    INSERT INTO PAY.PAY_GL_ELEMENT_MAPPINGS (
      GL_MAPPING_GUID, ENTERPRISE_ID, ELEMENT_ID, GL_ACCOUNT_ID, DEBIT_CREDIT_CODE,
      ACCOUNTING_CLASS_CODE, LINE_DESCRIPTION, EFFECTIVE_START_DATE, EFFECTIVE_END_DATE,
      STATUS_CODE, CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
    ) VALUES (
      SYS_GUID(), :enterprise_id, :element_id, :gl_account_id, :debit_credit_code,
      :accounting_class_code, :line_description, :effective_start_date, :effective_end_date,
      :status_code, :actor, SYSDATE, :actor, SYSDATE
    )
    RETURNING GL_MAPPING_ID, RAWTOHEX(GL_MAPPING_GUID) INTO :id, :guid
  `;
  const binds = {
    enterprise_id: { val: payload.enterprise_id, type: oracledb.NUMBER },
    element_id: { val: payload.element_id, type: oracledb.NUMBER },
    gl_account_id: { val: payload.gl_account_id, type: oracledb.NUMBER },
    debit_credit_code: { val: payload.debit_credit_code, type: oracledb.STRING, maxSize: 1 },
    accounting_class_code: { val: payload.accounting_class_code, type: oracledb.STRING, maxSize: 50 },
    line_description: { val: payload.line_description ?? null, type: oracledb.STRING, maxSize: 500 },
    effective_start_date: { val: payload.effective_start_date, type: oracledb.DATE },
    effective_end_date: { val: payload.effective_end_date ?? null, type: oracledb.DATE },
    status_code: { val: payload.status_code ?? 'ACTIVE', type: oracledb.STRING, maxSize: 30 },
    actor: { val: payload.actor, type: oracledb.STRING, maxSize: 100 },
    ...outIdGuidBinds()
  };
  return executePayDml(sql, binds, { genericError: 'Unable to create GL element mapping.' });
}

export async function updateGlElementMapping(glMappingId, payload) {
  const sql = `
    UPDATE PAY.PAY_GL_ELEMENT_MAPPINGS SET
      ELEMENT_ID = :element_id,
      GL_ACCOUNT_ID = :gl_account_id,
      DEBIT_CREDIT_CODE = :debit_credit_code,
      ACCOUNTING_CLASS_CODE = :accounting_class_code,
      LINE_DESCRIPTION = :line_description,
      EFFECTIVE_START_DATE = :effective_start_date,
      EFFECTIVE_END_DATE = :effective_end_date,
      STATUS_CODE = :status_code,
      LAST_UPDATED_BY = :actor,
      LAST_UPDATE_DATE = SYSDATE
    WHERE GL_MAPPING_ID = :gl_mapping_id
    RETURNING GL_MAPPING_ID, RAWTOHEX(GL_MAPPING_GUID) INTO :id, :guid
  `;
  const binds = {
    gl_mapping_id: { val: glMappingId, type: oracledb.NUMBER },
    element_id: { val: payload.element_id, type: oracledb.NUMBER },
    gl_account_id: { val: payload.gl_account_id, type: oracledb.NUMBER },
    debit_credit_code: { val: payload.debit_credit_code, type: oracledb.STRING, maxSize: 1 },
    accounting_class_code: { val: payload.accounting_class_code, type: oracledb.STRING, maxSize: 50 },
    line_description: { val: payload.line_description ?? null, type: oracledb.STRING, maxSize: 500 },
    effective_start_date: { val: payload.effective_start_date, type: oracledb.DATE },
    effective_end_date: { val: payload.effective_end_date ?? null, type: oracledb.DATE },
    status_code: { val: payload.status_code, type: oracledb.STRING, maxSize: 30 },
    actor: { val: payload.actor, type: oracledb.STRING, maxSize: 100 },
    ...outIdGuidBinds()
  };
  return executePayDml(sql, binds, { genericError: 'Unable to update GL element mapping.' });
}

export async function deleteGlElementMapping(glMappingId) {
  const sql = `DELETE FROM PAY.PAY_GL_ELEMENT_MAPPINGS WHERE GL_MAPPING_ID = :gl_mapping_id`;
  return executePayDml(
    sql,
    { gl_mapping_id: { val: glMappingId, type: oracledb.NUMBER } },
    { genericError: 'Unable to delete GL element mapping.', mapOut: () => ({ gl_mapping_id: glMappingId }) }
  );
}
