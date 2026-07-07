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
import { nullableTextClobBind, parseJsonClobOut } from '../../../compensation/utils/oracleClobBinds.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { mapPackageBusinessMessage } from '../utils/payFormulasOracleErrors.js';

const PKG = 'PAY.PAY_FORMULAS_PKG';

export const GENERIC_TECHNICAL_ERROR =
  'Unable to process request. Please try again or contact support.';

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_FORMULA(
    P_ENTERPRISE_ID          => :enterprise_id,
    P_FORMULA_CODE           => :formula_code,
    P_FORMULA_NAME_EN        => :formula_name_en,
    P_FORMULA_NAME_AR        => :formula_name_ar,
    P_FORMULA_TYPE_CODE      => :formula_type_code,
    P_FORMULA_ENGINE_CODE    => :formula_engine_code,
    P_RETURN_TYPE_CODE       => :return_type_code,
    P_RETURN_VALUE_CODE      => :return_value_code,
    P_FORMULA_DESCRIPTION    => :formula_description,
    P_FORMULA_BODY           => :formula_body,
    P_EFFECTIVE_START_DATE   => TO_DATE(:effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE     => TO_DATE(:effective_end_date, 'YYYY-MM-DD'),
    P_STATUS                 => :status,
    P_CREATED_BY             => :created_by,
    P_FORMULA_ID             => :formula_id,
    P_FORMULA_GUID           => :formula_guid,
    P_SUCCESS                => :success,
    P_MESSAGE                => :message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_FORMULA(
    P_FORMULA_GUID           => :formula_guid,
    P_FORMULA_CODE           => :formula_code,
    P_FORMULA_NAME_EN        => :formula_name_en,
    P_FORMULA_NAME_AR        => :formula_name_ar,
    P_FORMULA_TYPE_CODE      => :formula_type_code,
    P_FORMULA_ENGINE_CODE    => :formula_engine_code,
    P_RETURN_TYPE_CODE       => :return_type_code,
    P_RETURN_VALUE_CODE      => :return_value_code,
    P_FORMULA_DESCRIPTION    => :formula_description,
    P_FORMULA_BODY           => :formula_body,
    P_EFFECTIVE_START_DATE   => TO_DATE(:effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE     => TO_DATE(:effective_end_date, 'YYYY-MM-DD'),
    P_STATUS                 => :status,
    P_UPDATED_BY             => :updated_by,
    P_FORMULA_ID             => :formula_id,
    P_SUCCESS                => :success,
    P_MESSAGE                => :message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_FORMULA(
    P_FORMULA_GUID           => :formula_guid,
    P_HARD_DELETE            => :hard_delete,
    P_UPDATED_BY             => :updated_by,
    P_SUCCESS                => :success,
    P_MESSAGE                => :message
  );
END;`;

const GET_PLSQL = `
BEGIN
  ${PKG}.GET_FORMULA(
    P_FORMULA_GUID           => :formula_guid,
    P_RESULT                 => :result,
    P_SUCCESS                => :success,
    P_MESSAGE                => :message
  );
END;`;

const LIST_PLSQL = `
BEGIN
  ${PKG}.LIST_FORMULAS(
    P_ENTERPRISE_ID          => :enterprise_id,
    P_FORMULA_TYPE_CODE      => :formula_type_code,
    P_STATUS                 => :status,
    P_AS_OF_DATE             => TO_DATE(:as_of_date, 'YYYY-MM-DD'),
    P_SEARCH_TEXT            => :search_text,
    P_MAX_ROWS               => :max_rows,
    P_RESULT                 => :result,
    P_SUCCESS                => :success,
    P_MESSAGE                => :message
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
    const guid = normalizeOutString(ob.formula_guid);
    result.data = {
      formula_id: normalizeOutNumber(ob.formula_id),
      formula_guid: guid ? normalizeOutGuidHex(guid) : null
    };
  }

  if (includeUpdateFields && success) {
    result.data = {
      formula_id: normalizeOutNumber(ob.formula_id)
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
    formula_code: codeInBind(payload.formula_code, 100),
    formula_name_en: varcharInBind(payload.formula_name_en, 200),
    formula_name_ar: varcharInBind(payload.formula_name_ar, 200),
    formula_type_code: codeInBind(payload.formula_type_code, 50),
    formula_engine_code: codeInBind(payload.formula_engine_code, 50),
    return_type_code: codeInBind(payload.return_type_code, 50),
    return_value_code: codeInBind(payload.return_value_code, 100),
    formula_description: varcharInBind(payload.formula_description, 4000),
    formula_body: nullableTextClobBind(payload.formula_body),
    effective_start_date: varcharInBind(payload.effective_start_date, 10),
    effective_end_date: varcharInBind(payload.effective_end_date, 10),
    status: codeInBind(payload.status, 20),
    created_by: auditInBind(actor)
  };
}

function buildUpdateBinds(payload, formulaGuidHex, actor) {
  return {
    formula_guid: guidHexInBind(formulaGuidHex),
    formula_code: codeInBind(payload.formula_code, 100),
    formula_name_en: varcharInBind(payload.formula_name_en, 200),
    formula_name_ar: varcharInBind(payload.formula_name_ar, 200),
    formula_type_code: codeInBind(payload.formula_type_code, 50),
    formula_engine_code: codeInBind(payload.formula_engine_code, 50),
    return_type_code: codeInBind(payload.return_type_code, 50),
    return_value_code: codeInBind(payload.return_value_code, 100),
    formula_description: varcharInBind(payload.formula_description, 4000),
    formula_body: nullableTextClobBind(payload.formula_body),
    effective_start_date: varcharInBind(payload.effective_start_date, 10),
    effective_end_date: varcharInBind(payload.effective_end_date, 10),
    status: codeInBind(payload.status, 20),
    updated_by: auditInBind(actor)
  };
}

export async function createFormulaViaPackage(payload, actor) {
  return executePackageMutation(
    CREATE_PLSQL,
    {
      ...buildCreateBinds(payload, actor),
      ...successOutBinds(),
      formula_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      formula_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
    },
    { includeCreateFields: true }
  );
}

export async function updateFormulaViaPackage(formulaGuidHex, payload, actor) {
  return executePackageMutation(
    UPDATE_PLSQL,
    {
      ...buildUpdateBinds(payload, formulaGuidHex, actor),
      ...successOutBinds(),
      formula_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    { includeUpdateFields: true }
  );
}

export async function deleteFormulaViaPackage(formulaGuidHex, hardDelete, actor) {
  return executePackageMutation(DELETE_PLSQL, {
    formula_guid: guidHexInBind(formulaGuidHex),
    hard_delete: ynInBind(hardDelete, 'N'),
    updated_by: auditInBind(actor),
    ...successOutBinds()
  });
}

export async function getFormulaViaPackage(formulaGuidHex) {
  return executePackageRead(GET_PLSQL, {
    formula_guid: guidHexInBind(formulaGuidHex),
    ...resultOutBind(),
    ...successOutBinds()
  });
}

export async function listFormulasViaPackage(filters) {
  return executePackageRead(LIST_PLSQL, {
    enterprise_id: numberInBind(filters.enterprise_id),
    formula_type_code: codeInBind(filters.formula_type_code, 50),
    status: codeInBind(filters.status, 20),
    as_of_date: varcharInBind(filters.as_of_date, 10),
    search_text: varcharInBind(filters.search_text, 200),
    max_rows: numberInBind(filters.max_rows),
    ...resultOutBind(),
    ...successOutBinds()
  });
}
