/**
 * Payment methods & bank accounts — table DML only (no Oracle package).
 *
 * Tables: PAY_EMPLOYEE_PAYMENT_METHODS, PAY_EMPLOYEE_BANK_ACCOUNTS
 *
 * SECURITY: Bank accounts never store or return full account numbers or IBANs. Only
 * MASKED_ACCOUNT_NUMBER, IBAN_MASKED, and ACCOUNT_TOKEN columns exist on the table; any
 * unmasked value fields sent by a client (account_number, iban, etc.) are ignored.
 */

import oracledb from 'oracledb';
import { executePayDml, numberBind, queryPayList, queryPayOne, stringBind } from '../shared/index.js';

const PAYMENT_METHODS_TABLE = 'PAY.PAY_EMPLOYEE_PAYMENT_METHODS';
const BANK_ACCOUNTS_TABLE = 'PAY.PAY_EMPLOYEE_BANK_ACCOUNTS';

// --- Payment methods ------------------------------------------------------------------------

export async function listPaymentMethods(filters) {
  return queryPayList({
    fromSql: `${PAYMENT_METHODS_TABLE} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employeeId },
      { sql: 'v.PAYMENT_METHOD_TYPE_CODE = :payment_method_type_code', bind: 'payment_method_type_code', value: filters.paymentMethodTypeCode },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    search: { columns: ['v.METHOD_CODE', 'v.METHOD_NAME'], value: filters.search },
    defaultSort: 'v.PRIORITY_NUMBER ASC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollPaymentMethods'
  });
}

export async function getPaymentMethodByGuid(guid) {
  return queryPayOne({
    fromSql: `${PAYMENT_METHODS_TABLE} v`,
    alias: 'v',
    filters: [{ sql: 'UPPER(RAWTOHEX(v.PAYMENT_METHOD_GUID)) = UPPER(:guid)', bind: 'guid', value: guid }],
    logTag: 'payrollPaymentMethods'
  });
}

export async function getPaymentMethodById(paymentMethodId) {
  return queryPayOne({
    fromSql: `${PAYMENT_METHODS_TABLE} v`,
    alias: 'v',
    filters: [{ sql: 'v.PAYMENT_METHOD_ID = :id', bind: 'id', value: paymentMethodId }],
    logTag: 'payrollPaymentMethods'
  });
}

export async function createPaymentMethod(body, createdBy) {
  return executePayDml(
    `INSERT INTO ${PAYMENT_METHODS_TABLE} (
       ENTERPRISE_ID, EMPLOYEE_ID, METHOD_CODE, METHOD_NAME, PAYMENT_METHOD_TYPE_CODE,
       PRIORITY_NUMBER, CURRENCY_CODE, EFFECTIVE_START_DATE, EFFECTIVE_END_DATE, STATUS_CODE,
       CREATED_BY, LAST_UPDATED_BY
     ) VALUES (
       :enterprise_id, :employee_id, :method_code, :method_name, :payment_method_type_code,
       NVL(:priority_number, 1), :currency_code, NVL(:effective_start_date, TRUNC(SYSDATE)),
       :effective_end_date, NVL(:status_code, 'ACTIVE'), :created_by, :created_by
     )
     RETURNING PAYMENT_METHOD_ID, RAWTOHEX(PAYMENT_METHOD_GUID) INTO :id, :guid`,
    {
      enterprise_id: numberBind(body.enterprise_id),
      employee_id: numberBind(body.employee_id),
      method_code: stringBind(body.method_code, 100),
      method_name: stringBind(body.method_name, 200),
      payment_method_type_code: stringBind(body.payment_method_type_code, 30),
      priority_number: numberBind(body.priority_number),
      currency_code: stringBind(body.currency_code, 10),
      effective_start_date: body.effective_start_date ? new Date(body.effective_start_date) : null,
      effective_end_date: body.effective_end_date ? new Date(body.effective_end_date) : null,
      status_code: stringBind(body.status_code, 30),
      created_by: stringBind(createdBy, 100),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
    },
    {
      genericError: 'Unable to create payment method. Please try again.',
      mapOut: (out) => ({
        payment_method_id: out.id?.[0] ?? null,
        payment_method_guid: (out.guid?.[0] ?? '').toLowerCase() || null
      })
    }
  );
}

export async function updatePaymentMethod(guid, body, updatedBy) {
  return executePayDml(
    `UPDATE ${PAYMENT_METHODS_TABLE}
        SET METHOD_NAME        = NVL(:method_name, METHOD_NAME),
            PRIORITY_NUMBER    = NVL(:priority_number, PRIORITY_NUMBER),
            CURRENCY_CODE      = NVL(:currency_code, CURRENCY_CODE),
            EFFECTIVE_END_DATE = NVL(:effective_end_date, EFFECTIVE_END_DATE),
            STATUS_CODE        = NVL(:status_code, STATUS_CODE),
            LAST_UPDATED_BY    = :updated_by,
            LAST_UPDATE_DATE   = SYSDATE
      WHERE RAWTOHEX(PAYMENT_METHOD_GUID) = UPPER(:guid)
     RETURNING PAYMENT_METHOD_ID INTO :id`,
    {
      method_name: stringBind(body.method_name, 200),
      priority_number: numberBind(body.priority_number),
      currency_code: stringBind(body.currency_code, 10),
      effective_end_date: body.effective_end_date ? new Date(body.effective_end_date) : null,
      status_code: stringBind(body.status_code, 30),
      updated_by: stringBind(updatedBy, 100),
      guid: stringBind(guid, 32),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to update payment method. Please try again.',
      mapOut: (out) => ({ updated: (out.id || []).length > 0 })
    }
  );
}

export async function setPrimaryPaymentMethod(guid, updatedBy) {
  const method = await getPaymentMethodByGuid(guid);
  if (!method) return { updated: false };

  return executePayDml(
    `BEGIN
       UPDATE ${PAYMENT_METHODS_TABLE}
          SET PRIORITY_NUMBER = CASE
                WHEN RAWTOHEX(PAYMENT_METHOD_GUID) = UPPER(:guid) THEN 1
                ELSE PRIORITY_NUMBER + CASE WHEN PRIORITY_NUMBER < 9999 THEN 1 ELSE 0 END
              END,
              LAST_UPDATED_BY = :updated_by,
              LAST_UPDATE_DATE = SYSDATE
        WHERE EMPLOYEE_ID = :employee_id
          AND ENTERPRISE_ID = :enterprise_id;
     END;`,
    {
      guid: stringBind(guid, 32),
      employee_id: numberBind(method.employee_id),
      enterprise_id: numberBind(method.enterprise_id),
      updated_by: stringBind(updatedBy, 100)
    },
    {
      genericError: 'Unable to set primary payment method. Please try again.',
      mapOut: () => ({ updated: true, payment_method_guid: guid })
    }
  );
}

export async function deletePaymentMethod(guid) {
  return executePayDml(
    `DELETE FROM ${PAYMENT_METHODS_TABLE}
      WHERE RAWTOHEX(PAYMENT_METHOD_GUID) = UPPER(:guid)
     RETURNING PAYMENT_METHOD_ID INTO :id`,
    {
      guid: stringBind(guid, 32),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to delete payment method. It may be referenced by existing bank accounts.',
      mapOut: (out) => ({ deleted: (out.id || []).length > 0 })
    }
  );
}

// --- Bank accounts (masked-only; never accepts or returns full account numbers) -------------

const BANK_ACCOUNT_SAFE_COLUMNS = `
  v.BANK_ACCOUNT_ID, v.BANK_ACCOUNT_GUID, v.PAYMENT_METHOD_ID, v.ACCOUNT_TOKEN,
  v.MASKED_ACCOUNT_NUMBER, v.ACCOUNT_HOLDER_NAME, v.BANK_NAME, v.BANK_CODE, v.SWIFT_CODE,
  v.IBAN_MASKED, v.CURRENCY_CODE, v.VERIFICATION_STATUS_CODE, v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE, v.STATUS_CODE, v.CREATED_BY, v.CREATION_DATE, v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`;

export async function listBankAccounts(filters) {
  const fromSql = filters.employeeId
    ? `${BANK_ACCOUNTS_TABLE} v
       INNER JOIN ${PAYMENT_METHODS_TABLE} pm ON pm.PAYMENT_METHOD_ID = v.PAYMENT_METHOD_ID`
    : `${BANK_ACCOUNTS_TABLE} v`;

  return queryPayList({
    fromSql,
    alias: 'v',
    selectSql: BANK_ACCOUNT_SAFE_COLUMNS,
    filters: [
      { sql: 'v.PAYMENT_METHOD_ID = :payment_method_id', bind: 'payment_method_id', value: filters.paymentMethodId },
      { sql: 'pm.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employeeId },
      { sql: 'pm.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode },
      { sql: 'v.VERIFICATION_STATUS_CODE = :verification_status_code', bind: 'verification_status_code', value: filters.verificationStatusCode }
    ],
    search: { columns: ['v.ACCOUNT_HOLDER_NAME', 'v.BANK_NAME', 'v.MASKED_ACCOUNT_NUMBER'], value: filters.search },
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollBankAccounts'
  });
}

export async function getBankAccountByGuid(guid) {
  return queryPayOne({
    fromSql: `${BANK_ACCOUNTS_TABLE} v`,
    alias: 'v',
    selectSql: BANK_ACCOUNT_SAFE_COLUMNS,
    filters: [{ sql: 'UPPER(RAWTOHEX(v.BANK_ACCOUNT_GUID)) = UPPER(:guid)', bind: 'guid', value: guid }],
    logTag: 'payrollBankAccounts'
  });
}

export async function createBankAccount(body, createdBy) {
  return executePayDml(
    `INSERT INTO ${BANK_ACCOUNTS_TABLE} (
       PAYMENT_METHOD_ID, ACCOUNT_TOKEN, MASKED_ACCOUNT_NUMBER, ACCOUNT_HOLDER_NAME, BANK_NAME,
       BANK_CODE, SWIFT_CODE, IBAN_MASKED, CURRENCY_CODE, VERIFICATION_STATUS_CODE,
       EFFECTIVE_START_DATE, EFFECTIVE_END_DATE, STATUS_CODE, CREATED_BY, LAST_UPDATED_BY
     ) VALUES (
       :payment_method_id, :account_token, :masked_account_number, :account_holder_name, :bank_name,
       :bank_code, :swift_code, :iban_masked, :currency_code, NVL(:verification_status_code, 'PENDING'),
       NVL(:effective_start_date, TRUNC(SYSDATE)), :effective_end_date, NVL(:status_code, 'ACTIVE'),
       :created_by, :created_by
     )
     RETURNING BANK_ACCOUNT_ID, RAWTOHEX(BANK_ACCOUNT_GUID) INTO :id, :guid`,
    {
      payment_method_id: numberBind(body.payment_method_id),
      account_token: stringBind(body.account_token, 200),
      masked_account_number: stringBind(body.masked_account_number, 100),
      account_holder_name: stringBind(body.account_holder_name, 200),
      bank_name: stringBind(body.bank_name, 200),
      bank_code: stringBind(body.bank_code, 100),
      swift_code: stringBind(body.swift_code, 50),
      iban_masked: stringBind(body.iban_masked, 100),
      currency_code: stringBind(body.currency_code, 10),
      verification_status_code: stringBind(body.verification_status_code, 30),
      effective_start_date: body.effective_start_date ? new Date(body.effective_start_date) : null,
      effective_end_date: body.effective_end_date ? new Date(body.effective_end_date) : null,
      status_code: stringBind(body.status_code, 30),
      created_by: stringBind(createdBy, 100),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
    },
    {
      genericError: 'Unable to create bank account. Please try again.',
      mapOut: (out) => ({
        bank_account_id: out.id?.[0] ?? null,
        bank_account_guid: (out.guid?.[0] ?? '').toLowerCase() || null
      })
    }
  );
}

export async function updateBankAccount(guid, body, updatedBy) {
  return executePayDml(
    `UPDATE ${BANK_ACCOUNTS_TABLE}
        SET ACCOUNT_HOLDER_NAME = NVL(:account_holder_name, ACCOUNT_HOLDER_NAME),
            BANK_NAME           = NVL(:bank_name, BANK_NAME),
            BANK_CODE           = NVL(:bank_code, BANK_CODE),
            SWIFT_CODE          = NVL(:swift_code, SWIFT_CODE),
            MASKED_ACCOUNT_NUMBER = NVL(:masked_account_number, MASKED_ACCOUNT_NUMBER),
            IBAN_MASKED         = NVL(:iban_masked, IBAN_MASKED),
            ACCOUNT_TOKEN       = NVL(:account_token, ACCOUNT_TOKEN),
            CURRENCY_CODE       = NVL(:currency_code, CURRENCY_CODE),
            EFFECTIVE_END_DATE  = NVL(:effective_end_date, EFFECTIVE_END_DATE),
            STATUS_CODE         = NVL(:status_code, STATUS_CODE),
            LAST_UPDATED_BY     = :updated_by,
            LAST_UPDATE_DATE    = SYSDATE
      WHERE RAWTOHEX(BANK_ACCOUNT_GUID) = UPPER(:guid)
     RETURNING BANK_ACCOUNT_ID INTO :id`,
    {
      account_holder_name: stringBind(body.account_holder_name, 200),
      bank_name: stringBind(body.bank_name, 200),
      bank_code: stringBind(body.bank_code, 100),
      swift_code: stringBind(body.swift_code, 50),
      masked_account_number: stringBind(body.masked_account_number, 100),
      iban_masked: stringBind(body.iban_masked, 100),
      account_token: stringBind(body.account_token, 200),
      currency_code: stringBind(body.currency_code, 10),
      effective_end_date: body.effective_end_date ? new Date(body.effective_end_date) : null,
      status_code: stringBind(body.status_code, 30),
      updated_by: stringBind(updatedBy, 100),
      guid: stringBind(guid, 32),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to update bank account. Please try again.',
      mapOut: (out) => ({ updated: (out.id || []).length > 0 })
    }
  );
}

export async function setBankAccountVerificationStatus(guid, verificationStatusCode, updatedBy) {
  return executePayDml(
    `UPDATE ${BANK_ACCOUNTS_TABLE}
        SET VERIFICATION_STATUS_CODE = :verification_status_code,
            LAST_UPDATED_BY          = :updated_by,
            LAST_UPDATE_DATE         = SYSDATE
      WHERE RAWTOHEX(BANK_ACCOUNT_GUID) = UPPER(:guid)
     RETURNING BANK_ACCOUNT_ID INTO :id`,
    {
      verification_status_code: stringBind(verificationStatusCode, 30),
      updated_by: stringBind(updatedBy, 100),
      guid: stringBind(guid, 32),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to update bank account verification status. Please try again.',
      mapOut: (out) => ({ updated: (out.id || []).length > 0 })
    }
  );
}

export async function deleteBankAccount(guid) {
  return executePayDml(
    `DELETE FROM ${BANK_ACCOUNTS_TABLE}
      WHERE RAWTOHEX(BANK_ACCOUNT_GUID) = UPPER(:guid)
     RETURNING BANK_ACCOUNT_ID INTO :id`,
    {
      guid: stringBind(guid, 32),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to delete bank account. Please try again.',
      mapOut: (out) => ({ deleted: (out.id || []).length > 0 })
    }
  );
}
