/**
 * PAY.PAY_GL_ACCOUNTS — master data table, no Oracle package. All access is
 * direct SQL via the shared payrollTableDml / payrollViewQuery helpers.
 */

import oracledb from 'oracledb';
import { queryPayList, queryPayOne, executePayDml, outIdGuidBinds } from '../../shared/index.js';

const FROM = 'PAY.PAY_GL_ACCOUNTS v';

const SORT = {
  account_code: 'v.ACCOUNT_CODE',
  account_name: 'v.ACCOUNT_NAME',
  status_code: 'v.STATUS_CODE',
  creation_date: 'v.CREATION_DATE'
};

export function listGlAccounts({ enterpriseId, page, pageSize, statusCode, accountTypeCode, sortBy, sortOrder, search }) {
  return queryPayList({
    fromSql: FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: statusCode },
      { sql: 'v.ACCOUNT_TYPE_CODE = :account_type_code', bind: 'account_type_code', value: accountTypeCode }
    ],
    search: { columns: ['v.ACCOUNT_CODE', 'v.ACCOUNT_NAME'], value: search },
    allowedSort: SORT,
    defaultSort: 'v.ACCOUNT_CODE ASC',
    sortBy,
    sortOrder,
    page,
    pageSize,
    logTag: 'payGlAccounts'
  });
}

export function getGlAccountById(enterpriseId, glAccountId) {
  return queryPayOne({
    fromSql: FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.GL_ACCOUNT_ID = :gl_account_id', bind: 'gl_account_id', value: glAccountId }
    ],
    logTag: 'payGlAccounts'
  });
}

export async function createGlAccount(payload) {
  const sql = `
    INSERT INTO PAY.PAY_GL_ACCOUNTS (
      GL_ACCOUNT_GUID, ENTERPRISE_ID, ACCOUNT_CODE, ACCOUNT_NAME, ACCOUNT_TYPE_CODE,
      NORMAL_BALANCE_CODE, CURRENCY_CODE, EFFECTIVE_START_DATE, EFFECTIVE_END_DATE,
      STATUS_CODE, CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
    ) VALUES (
      SYS_GUID(), :enterprise_id, :account_code, :account_name, :account_type_code,
      :normal_balance_code, :currency_code, :effective_start_date, :effective_end_date,
      :status_code, :actor, SYSDATE, :actor, SYSDATE
    )
    RETURNING GL_ACCOUNT_ID, RAWTOHEX(GL_ACCOUNT_GUID) INTO :id, :guid
  `;
  const binds = {
    enterprise_id: { val: payload.enterprise_id, type: oracledb.NUMBER },
    account_code: { val: payload.account_code, type: oracledb.STRING, maxSize: 100 },
    account_name: { val: payload.account_name, type: oracledb.STRING, maxSize: 200 },
    account_type_code: { val: payload.account_type_code, type: oracledb.STRING, maxSize: 30 },
    normal_balance_code: { val: payload.normal_balance_code, type: oracledb.STRING, maxSize: 1 },
    currency_code: { val: payload.currency_code ?? null, type: oracledb.STRING, maxSize: 10 },
    effective_start_date: { val: payload.effective_start_date, type: oracledb.DATE },
    effective_end_date: { val: payload.effective_end_date ?? null, type: oracledb.DATE },
    status_code: { val: payload.status_code ?? 'ACTIVE', type: oracledb.STRING, maxSize: 30 },
    actor: { val: payload.actor, type: oracledb.STRING, maxSize: 100 },
    ...outIdGuidBinds()
  };
  return executePayDml(sql, binds, { genericError: 'Unable to create GL account.' });
}

export async function updateGlAccount(glAccountId, payload) {
  const sql = `
    UPDATE PAY.PAY_GL_ACCOUNTS SET
      ACCOUNT_CODE = :account_code,
      ACCOUNT_NAME = :account_name,
      ACCOUNT_TYPE_CODE = :account_type_code,
      NORMAL_BALANCE_CODE = :normal_balance_code,
      CURRENCY_CODE = :currency_code,
      EFFECTIVE_START_DATE = :effective_start_date,
      EFFECTIVE_END_DATE = :effective_end_date,
      STATUS_CODE = :status_code,
      LAST_UPDATED_BY = :actor,
      LAST_UPDATE_DATE = SYSDATE
    WHERE GL_ACCOUNT_ID = :gl_account_id
    RETURNING GL_ACCOUNT_ID, RAWTOHEX(GL_ACCOUNT_GUID) INTO :id, :guid
  `;
  const binds = {
    gl_account_id: { val: glAccountId, type: oracledb.NUMBER },
    account_code: { val: payload.account_code, type: oracledb.STRING, maxSize: 100 },
    account_name: { val: payload.account_name, type: oracledb.STRING, maxSize: 200 },
    account_type_code: { val: payload.account_type_code, type: oracledb.STRING, maxSize: 30 },
    normal_balance_code: { val: payload.normal_balance_code, type: oracledb.STRING, maxSize: 1 },
    currency_code: { val: payload.currency_code ?? null, type: oracledb.STRING, maxSize: 10 },
    effective_start_date: { val: payload.effective_start_date, type: oracledb.DATE },
    effective_end_date: { val: payload.effective_end_date ?? null, type: oracledb.DATE },
    status_code: { val: payload.status_code, type: oracledb.STRING, maxSize: 30 },
    actor: { val: payload.actor, type: oracledb.STRING, maxSize: 100 },
    ...outIdGuidBinds()
  };
  return executePayDml(sql, binds, { genericError: 'Unable to update GL account.' });
}

export async function deleteGlAccount(glAccountId) {
  const sql = `DELETE FROM PAY.PAY_GL_ACCOUNTS WHERE GL_ACCOUNT_ID = :gl_account_id`;
  return executePayDml(
    sql,
    { gl_account_id: { val: glAccountId, type: oracledb.NUMBER } },
    { genericError: 'Unable to delete GL account.', mapOut: () => ({ gl_account_id: glAccountId }) }
  );
}
