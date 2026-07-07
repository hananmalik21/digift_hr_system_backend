import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numberInBind,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import { parseJsonClobOut } from '../../../compensation/utils/oracleClobBinds.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { mapPackageBusinessMessage } from '../utils/payBalancesOracleErrors.js';

const PKG = 'PAY.PAY_BALANCES_PKG';

export const GENERIC_TECHNICAL_ERROR =
  'Unable to process request. Please try again or contact support.';

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_BALANCE(
    P_ENTERPRISE_ID           => :enterprise_id,
    P_BALANCE_CODE            => :balance_code,
    P_BALANCE_NAME_EN         => :balance_name_en,
    P_BALANCE_NAME_AR         => :balance_name_ar,
    P_BALANCE_CATEGORY_CODE   => :balance_category_code,
    P_BALANCE_UOM_CODE        => :balance_uom_code,
    P_DESCRIPTION             => :description,
    P_STATUS                  => :status,
    P_CREATED_BY              => :created_by,
    P_BALANCE_ID              => :balance_id,
    P_BALANCE_GUID            => :balance_guid,
    P_SUCCESS                 => :success,
    P_MESSAGE                 => :message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_BALANCE(
    P_BALANCE_GUID            => :balance_guid,
    P_BALANCE_CODE            => :balance_code,
    P_BALANCE_NAME_EN         => :balance_name_en,
    P_BALANCE_NAME_AR         => :balance_name_ar,
    P_BALANCE_CATEGORY_CODE   => :balance_category_code,
    P_BALANCE_UOM_CODE        => :balance_uom_code,
    P_DESCRIPTION             => :description,
    P_STATUS                  => :status,
    P_UPDATED_BY              => :updated_by,
    P_BALANCE_ID              => :balance_id,
    P_SUCCESS                 => :success,
    P_MESSAGE                 => :message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_BALANCE(
    P_BALANCE_GUID            => :balance_guid,
    P_HARD_DELETE             => :hard_delete,
    P_UPDATED_BY              => :updated_by,
    P_SUCCESS                 => :success,
    P_MESSAGE                 => :message
  );
END;`;

const GET_PLSQL = `
BEGIN
  ${PKG}.GET_BALANCE(
    P_BALANCE_GUID            => :balance_guid,
    P_RESULT                  => :result,
    P_SUCCESS                 => :success,
    P_MESSAGE                 => :message
  );
END;`;

const LIST_PLSQL = `
BEGIN
  ${PKG}.LIST_BALANCES(
    P_ENTERPRISE_ID           => :enterprise_id,
    P_BALANCE_CATEGORY_CODE   => :balance_category_code,
    P_BALANCE_UOM_CODE        => :balance_uom_code,
    P_STATUS                  => :status,
    P_SEARCH_TEXT             => :search_text,
    P_MAX_ROWS                => :max_rows,
    P_RESULT                  => :result,
    P_SUCCESS                 => :success,
    P_MESSAGE                 => :message
  );
END;`;

function successOutBinds() {
  return {
    success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
    message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

function resultOutBind() {
  return {
    result: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
  };
}

function packageSuccessIsTrue(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase() === 'Y';
}

function parseMutationOut(outBinds, { includeCreateFields = false, includeUpdateFields = false } = {}) {
  const ob = outBinds || {};
  const success = packageSuccessIsTrue(ob.success);
  const rawMessage = normalizeOutString(ob.message) ?? '';
  const message = success ? rawMessage : mapPackageBusinessMessage(rawMessage);
  const result = { success, message };

  if (includeCreateFields && success) {
    const guid = normalizeOutString(ob.balance_guid);
    result.data = {
      balance_id: normalizeOutNumber(ob.balance_id),
      balance_guid: guid ? normalizeOutGuidHex(guid) : null
    };
  }

  if (includeUpdateFields && success) {
    result.data = {
      balance_id: normalizeOutNumber(ob.balance_id)
    };
  }

  return result;
}

async function parseReadOut(outBinds) {
  const ob = outBinds || {};
  const success = packageSuccessIsTrue(ob.success);
  const rawMessage = normalizeOutString(ob.message) ?? '';
  const message = success ? rawMessage : mapPackageBusinessMessage(rawMessage);

  let data = null;
  if (success) {
    const parsed = await parseJsonClobOut(ob.result);
    data = parsed ?? null;
  }

  return { success, message, data };
}

async function executePackageMutation(plsql, binds, options = {}) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    const parsed = parseMutationOut(result?.outBinds, options);

    if (parsed.success) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    return parsed;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err, GENERIC_TECHNICAL_ERROR);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

async function executePackageRead(plsql, binds) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    const parsed = await parseReadOut(result?.outBinds);

    if (parsed.success) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    return parsed;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err, GENERIC_TECHNICAL_ERROR);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function buildCreateBinds(payload, actor) {
  return {
    enterprise_id: numberInBind(payload.enterprise_id),
    balance_code: codeInBind(payload.balance_code, 100),
    balance_name_en: varcharInBind(payload.balance_name_en, 200),
    balance_name_ar: varcharInBind(payload.balance_name_ar, 200),
    balance_category_code: codeInBind(payload.balance_category_code, 50),
    balance_uom_code: codeInBind(payload.balance_uom_code, 50),
    description: varcharInBind(payload.description, 4000),
    status: codeInBind(payload.status, 20),
    created_by: auditInBind(actor)
  };
}

function buildUpdateBinds(payload, balanceGuidHex, actor) {
  return {
    balance_guid: guidHexInBind(balanceGuidHex),
    balance_code: codeInBind(payload.balance_code, 100),
    balance_name_en: varcharInBind(payload.balance_name_en, 200),
    balance_name_ar: varcharInBind(payload.balance_name_ar, 200),
    balance_category_code: codeInBind(payload.balance_category_code, 50),
    balance_uom_code: codeInBind(payload.balance_uom_code, 50),
    description: varcharInBind(payload.description, 4000),
    status: codeInBind(payload.status, 20),
    updated_by: auditInBind(actor)
  };
}

export async function createBalanceViaPackage(payload, actor) {
  return executePackageMutation(
    CREATE_PLSQL,
    {
      ...buildCreateBinds(payload, actor),
      ...successOutBinds(),
      balance_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      balance_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
    },
    { includeCreateFields: true }
  );
}

export async function updateBalanceViaPackage(balanceGuidHex, payload, actor) {
  return executePackageMutation(
    UPDATE_PLSQL,
    {
      ...buildUpdateBinds(payload, balanceGuidHex, actor),
      ...successOutBinds(),
      balance_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    { includeUpdateFields: true }
  );
}

export async function deleteBalanceViaPackage(balanceGuidHex, hardDelete, actor) {
  return executePackageMutation(DELETE_PLSQL, {
    balance_guid: guidHexInBind(balanceGuidHex),
    hard_delete: ynInBind(hardDelete, 'N'),
    updated_by: auditInBind(actor),
    ...successOutBinds()
  });
}

export async function getBalanceViaPackage(balanceGuidHex) {
  return executePackageRead(GET_PLSQL, {
    balance_guid: guidHexInBind(balanceGuidHex),
    ...resultOutBind(),
    ...successOutBinds()
  });
}

export async function listBalancesViaPackage(filters) {
  return executePackageRead(LIST_PLSQL, {
    enterprise_id: numberInBind(filters.enterprise_id),
    balance_category_code: codeInBind(filters.balance_category_code, 50),
    balance_uom_code: codeInBind(filters.balance_uom_code, 50),
    status: codeInBind(filters.status, 20),
    search_text: varcharInBind(filters.search_text, 200),
    max_rows: numberInBind(filters.max_rows),
    ...resultOutBind(),
    ...successOutBinds()
  });
}
