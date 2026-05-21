import oracledb from 'oracledb';

/**
 * Create employee (POST /api/create-employee) via EMPL.EMPL_EMPLOYEE_CREATE_API_PKG.CREATE_EMPLOYEE_ALL_IN_ONE.
 * Employee compensation is optional via `compensation_components` → p_emp_comp_components_json only.
 * Legacy salary/allowance request fields (basic_salary_kwd, housing_kwd, etc.) are not supported.
 */

/** Removed from create-employee request; use compensation_components instead. */
export const LEGACY_CREATE_COMPENSATION_FIELDS = [
  'basic_salary_kwd',
  'housing_kwd',
  'food_kwd',
  'transport_kwd',
  'other_kwd',
  'mobile_kwd',
  'comp_start',
  'comp_end',
  'allow_start',
  'allow_end'
];

const LEGACY_CREATE_COMPENSATION_FIELD_KEYS = new Set(LEGACY_CREATE_COMPENSATION_FIELDS);

const LEGACY_COMPENSATION_REJECTED_HINT = 'Use compensation_components instead.';

/** Per-row fields for compensation_components[] (API + frontend form). */
export const COMPENSATION_COMPONENT_ROW_FIELDS = [
  'plan_id',
  'component_id',
  'amount',
  'currency_code',
  'effective_start_date',
  'effective_end_date',
  'active_flag'
];

/**
 * Frontend form → API: compensation rows only (replaces legacy salary/allowance inputs).
 * Each UI row should map to one object in compensation_components[].
 */
export const CREATE_EMPLOYEE_COMPENSATION_FORM_MAP = {
  compensation_components: Object.fromEntries(
    COMPENSATION_COMPONENT_ROW_FIELDS.map((field) => [field, field])
  )
};

function normalizeBodyKey(key) {
  return String(key).toLowerCase().replace(/[- ]/g, '_');
}

function isLegacyCreateCompensationKey(key) {
  return LEGACY_CREATE_COMPENSATION_FIELD_KEYS.has(normalizeBodyKey(key));
}

function findLegacyCreateCompensationFields(body) {
  return Object.keys(body ?? {}).filter(isLegacyCreateCompensationKey);
}

export function stripLegacyCreateCompensationFields(body) {
  if (body == null || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => !isLegacyCreateCompensationKey(key))
  );
}

function validateNoLegacyCreateCompensationFields(body) {
  const found = findLegacyCreateCompensationFields(body);
  if (found.length === 0) return { valid: true };
  return {
    valid: false,
    missing: [
      `Legacy compensation fields are not supported (${found.join(', ')}). ${LEGACY_COMPENSATION_REJECTED_HINT}`
    ]
  };
}

function pickRowField(row, snake, camel, upper) {
  return row[snake] ?? row[camel] ?? row[upper];
}

export const REQUIRED_FIELDS = [
  'enterprise_id',
  'first_name_en',
  'last_name_en',
  'email',
  'phone_number',
  'date_of_birth',
  'gender_code',
  'nationality',
  'contact_name',
  'relationship',
  'emerg_phone',
  'work_schedule_id',
  'bank_code',
  'account_number',
  'org_unit_id_hex',
  'enterprise_hire_date',
  'contract_type_code',
  'employment_status'
];

const EMPLOYEE_STATUS_VALUES = ['ACTIVE', 'INACTIVE', 'PROBATION'];

/** Oracle binds when no employee compensation payload is sent (matches DEFAULT NULL in PL/SQL). */
const EMP_COMP_BINDS_EMPTY = Object.freeze({
  p_emp_comp_plan_id: null,
  p_emp_comp_component_id: null,
  p_emp_comp_amount: null,
  p_emp_comp_currency_code: null,
  p_emp_comp_start: null,
  p_emp_comp_end: null,
  p_emp_comp_active_flag: null,
  p_emp_comp_components_json: null
});

/** Max length before using CLOB for p_emp_comp_components_json (aligns with compensation JSON pattern). */
const COMPENSATION_COMPONENTS_JSON_MAX = (() => {
  const raw = process.env.DB_EMP_CREATE_COMP_COMPONENTS_JSON_MAX;
  if (raw === undefined || raw === '') return 30000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 30000;
  return n;
})();

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {{ ok: true, value: undefined | unknown[] }} ParseCompensationOk
 * @typedef {{ ok: false, message: string }} ParseCompensationErr
 * @typedef {ParseCompensationOk | ParseCompensationErr} ParseCompensationResult
 */

/**
 * Normalize optional `compensation_components` from JSON (array) or multipart/form-data (JSON string).
 * @param {object | null | undefined} body
 * @returns {ParseCompensationResult}
 */
function parseCompensationComponentsField(body) {
  if (body == null || typeof body !== 'object') {
    return { ok: true, value: undefined };
  }
  const v =
    body.compensation_components ?? body.compensationComponents ?? body.COMPENSATION_COMPONENTS;
  if (v === undefined || v === null) {
    return { ok: true, value: undefined };
  }
  if (Array.isArray(v)) {
    return { ok: true, value: v };
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '' || s.toLowerCase() === 'null') {
      return { ok: true, value: undefined };
    }
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return { ok: true, value: parsed };
      }
      return {
        ok: false,
        message: 'compensation_components must be an array (or a JSON string of an array)'
      };
    } catch {
      return { ok: false, message: 'compensation_components must be valid JSON' };
    }
  }
  return { ok: false, message: 'compensation_components must be an array' };
}

function empCompComponentsJsonBind(jsonString) {
  const useString =
    COMPENSATION_COMPONENTS_JSON_MAX > 0 && jsonString.length <= COMPENSATION_COMPONENTS_JSON_MAX;
  return {
    val: jsonString,
    dir: oracledb.BIND_IN,
    type: useString ? oracledb.STRING : oracledb.CLOB
  };
}

function normalizeCompensationRowForJson(row) {
  const plan_id = Number(pickRowField(row, 'plan_id', 'planId', 'PLAN_ID'));
  const component_id = Number(pickRowField(row, 'component_id', 'componentId', 'COMPONENT_ID'));
  const amount = Number(pickRowField(row, 'amount', 'amount', 'AMOUNT'));
  const currency_code = String(pickRowField(row, 'currency_code', 'currencyCode', 'CURRENCY_CODE')).trim().toUpperCase();
  const effective_start_date = String(pickRowField(row, 'effective_start_date', 'effectiveStartDate', 'EFFECTIVE_START_DATE'))
    .trim()
    .slice(0, 10);
  const endRaw = pickRowField(row, 'effective_end_date', 'effectiveEndDate', 'EFFECTIVE_END_DATE');
  const effective_end_date =
    endRaw == null || (typeof endRaw === 'string' && endRaw.trim() === '') || String(endRaw).toLowerCase() === 'null'
      ? null
      : String(endRaw).trim().slice(0, 10);
  const afRaw = pickRowField(row, 'active_flag', 'activeFlag', 'ACTIVE_FLAG');
  const active_flag =
    afRaw == null || String(afRaw).trim() === ''
      ? 'Y'
      : String(afRaw).trim().toUpperCase();

  return {
    plan_id,
    component_id,
    amount,
    currency_code,
    effective_start_date,
    effective_end_date,
    active_flag
  };
}

/** PL/SQL optional employee compensation: NULL json + NULL singles when absent/empty. */
function buildEmpCompBinds(body) {
  const parsed = parseCompensationComponentsField(body);
  const rows = parsed.ok ? parsed.value : undefined;
  if (!parsed.ok || rows == null || rows.length === 0) {
    return { ...EMP_COMP_BINDS_EMPTY };
  }
  const jsonStr = JSON.stringify({
    components: rows.map((row) => normalizeCompensationRowForJson(row))
  });
  return {
    ...EMP_COMP_BINDS_EMPTY,
    p_emp_comp_components_json: empCompComponentsJsonBind(jsonStr)
  };
}

const CREATE_EMPLOYEE_ALL_IN_ONE_SQL = `
BEGIN
  EMPL.EMPL_EMPLOYEE_CREATE_API_PKG.CREATE_EMPLOYEE_ALL_IN_ONE(
    p_enterprise_id            => :p_enterprise_id,
    p_first_name_en            => :p_first_name_en,
    p_last_name_en             => :p_last_name_en,
    p_email                    => :p_email,
    p_phone_number             => :p_phone_number,
    p_date_of_birth            => :p_date_of_birth,
    p_middle_name_en           => :p_middle_name_en,
    p_first_name_ar            => :p_first_name_ar,
    p_middle_name_ar           => :p_middle_name_ar,
    p_last_name_ar             => :p_last_name_ar,
    p_mobile_number            => :p_mobile_number,
    p_gender_code              => :p_gender_code,
    p_nationality              => :p_nationality,
    p_marital_status_code      => :p_marital_status_code,
    p_religion_code            => :p_religion_code,
    p_civil_id_number          => :p_civil_id_number,
    p_passport_number          => :p_passport_number,
    p_contact_name             => :p_contact_name,
    p_relationship             => :p_relationship,
    p_emerg_phone              => :p_emerg_phone,
    p_emerg_email              => :p_emerg_email,
    p_emerg_address            => :p_emerg_address,
    p_work_schedule_id         => :p_work_schedule_id,
    p_ws_start                 => :p_ws_start,
    p_ws_end                   => :p_ws_end,
    p_civil_id_expiry          => :p_civil_id_expiry,
    p_passport_expiry          => :p_passport_expiry,
    p_visa_number              => :p_visa_number,
    p_visa_expiry              => :p_visa_expiry,
    p_work_permit_number       => :p_work_permit_number,
    p_work_permit_expiry       => :p_work_permit_expiry,
    p_bank_code                => :p_bank_code,
    p_bank_name                => :p_bank_name,
    p_account_number           => :p_account_number,
    p_iban                     => :p_iban,
    p_org_unit_id              => :p_org_unit_id,
    p_enterprise_hire_date     => :p_enterprise_hire_date,
    p_contract_type_code       => :p_contract_type_code,
    p_employment_status        => :p_employment_status,
    p_employee_number          => :p_employee_number,
    p_work_location_id         => :p_work_location_id,
    p_position_id              => :p_position_id,
    p_job_family_id            => :p_job_family_id,
    p_job_level_id             => :p_job_level_id,
    p_grade_id                 => :p_grade_id,
    p_probation_days           => :p_probation_days,
    p_reporting_to_emp_id      => :p_reporting_to_emp_id,
    p_asg_start                => :p_asg_start,
    p_asg_end                  => :p_asg_end,
    p_address_line1            => :p_address_line1,
    p_address_line2            => :p_address_line2,
    p_city                     => :p_city,
    p_area                     => :p_area,
    p_country_code             => :p_country_code,
    p_document_type_code       => :p_document_type_code,
    p_doc_file_name            => :p_doc_file_name,
    p_doc_mime_type            => :p_doc_mime_type,
    p_doc_access_url            => :p_doc_access_url,
    p_doc_hash_sha256           => :p_doc_hash_sha256,
    p_actor                    => :p_actor,
    p_employee_status          => :p_employee_status,
    p_employee_is_active       => :p_employee_is_active,
    p_password_hash            => :p_password_hash,
    p_emp_comp_plan_id         => :p_emp_comp_plan_id,
    p_emp_comp_component_id    => :p_emp_comp_component_id,
    p_emp_comp_amount          => :p_emp_comp_amount,
    p_emp_comp_currency_code   => :p_emp_comp_currency_code,
    p_emp_comp_start           => :p_emp_comp_start,
    p_emp_comp_end             => :p_emp_comp_end,
    p_emp_comp_active_flag     => :p_emp_comp_active_flag,
    p_emp_comp_components_json => :p_emp_comp_components_json,
    o_employee_id              => :o_employee_id
  );
END;
`;

const INSERT_DOCUMENT_SQL = `
BEGIN
  EMPL.EMPL_EMPLOYEE_CREATE_API_PKG.INSERT_DOCUMENT(
    p_employee_id        => :p_employee_id,
    p_document_type_code => :p_document_type_code,
    p_file_name          => :p_file_name,
    p_mime_type          => :p_mime_type,
    p_status             => :p_status,
    p_is_active          => :p_is_active,
    p_created_by         => :p_created_by,
    p_file_content       => :p_file_content,
    p_access_url         => :p_access_url,
    p_file_hash_sha256   => :p_file_hash_sha256,
    o_document_id        => :o_document_id,
    o_document_guid      => :o_document_guid
  );
END;
`;

function parseDate(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'string' && val.trim().toLowerCase() === 'null') return null;
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function hexToBuffer(hex) {
  if (hex == null || hex === '') return null;
  const s = String(hex).replace(/^0x/i, '').trim();
  if (s.length !== 32 || !/^[0-9A-Fa-f]+$/.test(s)) return null;
  return Buffer.from(s, 'hex');
}

function strOrNull(...vals) {
  const v = vals.find(x => x != null && String(x).trim() !== '');
  return v != null ? String(v).trim() : null;
}

export function fromBody(body, ...keys) {
  for (const k of keys) {
    const v = body[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  const lower = keys.map(k => String(k).toLowerCase().replace(/[- ]/g, '_'));
  for (const [key, val] of Object.entries(body || {})) {
    const n = key.toLowerCase().replace(/[- ]/g, '_');
    if (lower.some(l => n === l || n === l.replace(/_/g, '')) && val != null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return null;
}

export function fromBodyKeyContains(body, substring) {
  const sub = String(substring).toLowerCase();
  for (const [key, val] of Object.entries(body || {})) {
    if (key.toLowerCase().includes(sub) && val != null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return null;
}

function toNum(...vals) {
  const v = vals.find(x => x != null && x !== '');
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strBind(val) {
  return val != null && String(val).trim() !== ''
    ? { type: oracledb.STRING, dir: oracledb.BIND_IN, val: String(val).trim() }
    : null;
}

function normalizeEmployeeStatus(body) {
  const v = body.employee_status ?? body.employeeStatus ?? body.EMPLOYEE_STATUS;
  if (v == null || String(v).trim() === '') return null;
  return String(v).trim().toUpperCase();
}

function normalizeEmployeeIsActive(body) {
  const v = body.employee_is_active ?? body.employeeIsActive ?? body.EMPLOYEE_IS_ACTIVE ?? body.IS_ACTIVE;
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim().toUpperCase();
  return s === 'Y' || s === 'N' ? s : null;
}

function buildDocumentBinds(body) {
  const docFileName = strOrNull(
    body.doc_file_name,
    body.docFileName,
    body.DOC_FILE_NAME,
    body.file_name,
    body.fileName,
    body.document_file_name
  );
  const hasDocFile = docFileName != null && String(docFileName).trim() !== '';
  if (!hasDocFile) {
    return {
      p_document_type_code: null,
      p_doc_file_name: null,
      p_doc_mime_type: null,
      p_doc_access_url: null,
      p_doc_hash_sha256: null
    };
  }
  const docType = strOrNull(body.document_type_code, body.documentTypeCode, body.DOCUMENT_TYPE_CODE) ?? 'EMPLOYEE_DOC';
  const docMime = strOrNull(body.doc_mime_type, body.docMimeType, body.DOC_MIME_TYPE);
  const docUrl = strOrNull(body.doc_access_url, body.docAccessUrl, body.DOC_ACCESS_URL);
  const docHash = strOrNull(body.doc_hash_sha256, body.docHashSha256, body.DOC_HASH_SHA256);
  return {
    p_document_type_code: docType,
    p_doc_file_name: docFileName,
    p_doc_mime_type: docMime,
    p_doc_access_url: docUrl != null && String(docUrl).trim() !== '' ? docUrl : docFileName,
    p_doc_hash_sha256: docHash
  };
}

export function buildBinds(body) {
  const orgUnitIdRaw = hexToBuffer(body.org_unit_id_hex ?? body.org_unit_id);
  const positionIdRaw = (body.position_id_hex != null || body.position_id != null)
    ? hexToBuffer(body.position_id_hex ?? body.position_id) : null;

  const civilVal = fromBody(body, 'civil_id_number', 'civilIdNumber', 'CIVIL_ID_NUMBER', 'civil_id', 'CIVIL_ID', 'civil_number', 'civilID');
  const passportVal = fromBody(body, 'passport_number', 'passportNumber', 'PASSPORT_NUMBER', 'passport', 'PASSPORT', 'passport_no', 'passportNo') || fromBodyKeyContains(body, 'passport');

  return {
    p_enterprise_id: toNum(body.enterprise_id, body.ENTERPRISE_ID) ?? body.enterprise_id ?? body.ENTERPRISE_ID,
    p_first_name_en: body.first_name_en ?? body.firstNameEn ?? body.FIRST_NAME_EN ?? body.FIRST_NAME,
    p_last_name_en: body.last_name_en ?? body.lastNameEn ?? body.LAST_NAME_EN ?? body.LAST_NAME,
    p_email: body.email ?? body.EMAIL,
    p_phone_number: body.phone_number ?? body.phoneNumber ?? body.PHONE_NUMBER,
    p_date_of_birth: parseDate(body.date_of_birth ?? body.dateOfBirth ?? body.DATE_OF_BIRTH),
    p_middle_name_en: strOrNull(body.middle_name_en, body.middleNameEn, body.MIDDLE_NAME_EN),
    p_first_name_ar: strOrNull(body.first_name_ar, body.firstNameAr, body.FIRST_NAME_AR),
    p_middle_name_ar: strOrNull(body.middle_name_ar, body.middleNameAr, body.MIDDLE_NAME_AR),
    p_last_name_ar: strOrNull(body.last_name_ar, body.lastNameAr, body.LAST_NAME_AR),
    p_mobile_number: strOrNull(body.mobile_number, body.mobileNumber, body.MOBILE_NUMBER),
    p_gender_code: body.gender_code ?? body.genderCode ?? body.GENDER_CODE,
    p_nationality: body.nationality ?? body.NATIONALITY,
    p_marital_status_code: strOrNull(body.marital_status_code, body.maritalStatusCode, body.MARITAL_STATUS_CODE),
    p_religion_code: strOrNull(body.religion_code, body.religionCode, body.RELIGION_CODE),
    p_civil_id_number: strBind(civilVal),
    p_passport_number: strBind(passportVal),
    p_contact_name: body.contact_name ?? body.contactName ?? body.CONTACT_NAME,
    p_relationship: body.relationship ?? body.RELATIONSHIP,
    p_emerg_phone: body.emerg_phone ?? body.emergPhone ?? body.EMERG_PHONE ?? body.emergency_phone,
    p_emerg_email: strOrNull(body.emerg_email, body.emergEmail, body.EMERG_EMAIL),
    p_emerg_address: strOrNull(body.emerg_address, body.emergAddress, body.EMERG_ADDRESS),
    p_work_schedule_id: toNum(body.work_schedule_id, body.workScheduleId, body.WORK_SCHEDULE_ID) ?? body.work_schedule_id ?? body.workScheduleId ?? body.WORK_SCHEDULE_ID,
    p_ws_start: parseDate(body.ws_start ?? body.wsStart ?? body.WS_START) ?? null,
    p_ws_end: parseDate(body.ws_end ?? body.wsEnd ?? body.WS_END) ?? null,
    p_civil_id_expiry: parseDate(body.civil_id_expiry ?? body.civilIdExpiry ?? body.CIVIL_ID_EXPIRY) ?? null,
    p_passport_expiry: parseDate(body.passport_expiry ?? body.passportExpiry ?? body.PASSPORT_EXPIRY) ?? null,
    p_visa_number: strBind(fromBody(body, 'visa_number', 'visaNumber', 'VISA_NUMBER', 'visa_no', 'visaNo', 'VISA_NO')),
    p_visa_expiry: parseDate(body.visa_expiry ?? body.visaExpiry ?? body.VISA_EXPIRY),
    p_work_permit_number: strBind(fromBody(body, 'work_permit_number', 'workPermitNumber', 'WORK_PERMIT_NUMBER', 'work_permit_no', 'workPermitNo')),
    p_work_permit_expiry: parseDate(
      body.work_permit_expiry ?? body.workPermitExpiry ?? body.WORK_PERMIT_EXPIRY
        ?? body.work_permit_expiry_date ?? body.workPermitExpiryDate
    ),
    p_bank_code: body.bank_code ?? body.bankCode ?? body.BANK_CODE,
    p_bank_name: strOrNull(body.bank_name, body.bankName, body.BANK_NAME),
    p_account_number: body.account_number ?? body.accountNumber ?? body.ACCOUNT_NUMBER,
    p_iban: strOrNull(body.iban, body.IBAN),
    p_org_unit_id: orgUnitIdRaw,
    p_enterprise_hire_date: parseDate(body.enterprise_hire_date ?? body.enterpriseHireDate ?? body.ENTERPRISE_HIRE_DATE),
    p_contract_type_code: body.contract_type_code ?? body.contractTypeCode ?? body.CONTRACT_TYPE_CODE,
    p_employment_status: body.employment_status ?? body.employmentStatus ?? body.EMPLOYMENT_STATUS,
    p_employee_number: strOrNull(body.employee_number, body.employeeNumber, body.EMPLOYEE_NUMBER),
    p_work_location_id: toNum(body.work_location_id, body.workLocationId, body.WORK_LOCATION_ID),
    p_position_id: positionIdRaw,
    p_job_family_id: toNum(body.job_family_id, body.jobFamilyId, body.JOB_FAMILY_ID),
    p_job_level_id: toNum(body.job_level_id, body.jobLevelId, body.JOB_LEVEL_ID),
    p_grade_id: toNum(body.grade_id, body.gradeId, body.GRADE_ID),
    p_probation_days: toNum(body.probation_days, body.probationDays, body.PROBATION_DAYS),
    p_reporting_to_emp_id: toNum(body.reporting_to_emp_id, body.reportingToEmpId, body.REPORTING_TO_EMP_ID),
    p_asg_start: parseDate(body.asg_start ?? body.asgStart ?? body.ASG_START) ?? null,
    p_asg_end: parseDate(body.asg_end ?? body.asgEnd ?? body.ASG_END) ?? null,
    p_address_line1: strOrNull(body.address_line1, body.addressLine1, body.ADDRESS_LINE1),
    p_address_line2: strOrNull(body.address_line2, body.addressLine2, body.ADDRESS_LINE2),
    p_city: strOrNull(body.city, body.CITY),
    p_area: strOrNull(body.area, body.AREA),
    p_country_code: strOrNull(body.country_code, body.countryCode, body.COUNTRY_CODE),
    ...buildDocumentBinds(body),
    p_actor: strOrNull(body.actor, body.ACTOR, body.p_actor),
    p_employee_status: normalizeEmployeeStatus(body),
    p_employee_is_active: normalizeEmployeeIsActive(body),
    p_password_hash: strOrNull(body.password_hash, body.passwordHash, body.PASSWORD_HASH),
    ...buildEmpCompBinds(body),
    o_employee_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
  };
}

const FIELD_GETTERS = {
  enterprise_id: b => b.enterprise_id ?? b.ENTERPRISE_ID,
  first_name_en: b => b.first_name_en ?? b.firstNameEn ?? b.FIRST_NAME_EN ?? b.FIRST_NAME,
  last_name_en: b => b.last_name_en ?? b.lastNameEn ?? b.LAST_NAME_EN ?? b.LAST_NAME,
  email: b => b.email ?? b.EMAIL,
  phone_number: b => b.phone_number ?? b.phoneNumber ?? b.PHONE_NUMBER,
  date_of_birth: b => b.date_of_birth ?? b.dateOfBirth ?? b.DATE_OF_BIRTH,
  gender_code: b => b.gender_code ?? b.genderCode ?? b.GENDER_CODE,
  nationality: b => b.nationality ?? b.NATIONALITY,
  contact_name: b => b.contact_name ?? b.contactName ?? b.CONTACT_NAME,
  relationship: b => b.relationship ?? b.RELATIONSHIP,
  emerg_phone: b => b.emerg_phone ?? b.emergPhone ?? b.EMERG_PHONE ?? b.emergency_phone,
  work_schedule_id: b => b.work_schedule_id ?? b.workScheduleId ?? b.WORK_SCHEDULE_ID,
  bank_code: b => b.bank_code ?? b.bankCode ?? b.BANK_CODE,
  account_number: b => b.account_number ?? b.accountNumber ?? b.ACCOUNT_NUMBER,
  org_unit_id_hex: b => b.org_unit_id_hex ?? b.org_unit_id,
  enterprise_hire_date: b => b.enterprise_hire_date ?? b.enterpriseHireDate ?? b.ENTERPRISE_HIRE_DATE,
  contract_type_code: b => b.contract_type_code ?? b.contractTypeCode ?? b.CONTRACT_TYPE_CODE,
  employment_status: b => b.employment_status ?? b.employmentStatus ?? b.EMPLOYMENT_STATUS
};

export function validateLifecycleFields(body) {
  const statusVal = body.employee_status ?? body.employeeStatus ?? body.EMPLOYEE_STATUS;
  if (statusVal != null && String(statusVal).trim() !== '') {
    const u = String(statusVal).trim().toUpperCase();
    if (!EMPLOYEE_STATUS_VALUES.includes(u)) {
      return { valid: false, message: 'employee_status must be one of: ACTIVE, INACTIVE, PROBATION' };
    }
  }
  const isActiveVal = body.employee_is_active ?? body.employeeIsActive ?? body.EMPLOYEE_IS_ACTIVE ?? body.IS_ACTIVE;
  if (isActiveVal != null && String(isActiveVal).trim() !== '') {
    const u = String(isActiveVal).trim().toUpperCase();
    if (u !== 'Y' && u !== 'N') {
      return { valid: false, message: 'employee_is_active must be Y or N' };
    }
  }
  return { valid: true };
}

export function validateRequired(body) {
  const missing = [];
  for (const key of REQUIRED_FIELDS) {
    const getter = FIELD_GETTERS[key];
    const val = getter ? getter(body) : body[key];
    if (val == null || (typeof val === 'string' && val.trim() === '')) {
      missing.push(key);
    }
  }
  if (missing.length > 0) return { valid: false, missing };
  const orgHex = body.org_unit_id_hex ?? body.org_unit_id;
  if (!hexToBuffer(orgHex)) {
    missing.push('org_unit_id_hex (must be 32-character hex)');
    return { valid: false, missing };
  }
  const legacyComp = validateNoLegacyCreateCompensationFields(body);
  if (!legacyComp.valid) {
    return { valid: false, missing: legacyComp.missing };
  }
  const lifecycle = validateLifecycleFields(body);
  if (!lifecycle.valid) {
    return { valid: false, missing: [lifecycle.message] };
  }
  const compStruct = validateCompensationComponentsStructure(body);
  if (!compStruct.valid) {
    return { valid: false, missing: compStruct.missing };
  }
  return { valid: true, missing: [] };
}

/**
 * Optional `compensation_components`: array of rows for EMPL.EMPL_EMPLOYEE_CREATE_API_PKG (JSON path).
 * Deep business rules are enforced in PL/SQL only.
 */
export function validateCompensationComponentsStructure(body) {
  const parsed = parseCompensationComponentsField(body);
  if (!parsed.ok) {
    return { valid: false, missing: [parsed.message] };
  }
  const raw = parsed.value;
  if (raw === undefined || raw.length === 0) {
    return { valid: true, missing: [] };
  }

  const missing = [];
  raw.forEach((row, idx) => {
    const p = `compensation_components[${idx}]`;
    if (row == null || typeof row !== 'object' || Array.isArray(row)) {
      missing.push(`${p} must be an object`);
      return;
    }

    const planId = pickRowField(row, 'plan_id', 'planId', 'PLAN_ID');
    const compId = pickRowField(row, 'component_id', 'componentId', 'COMPONENT_ID');
    const amount = pickRowField(row, 'amount', 'amount', 'AMOUNT');
    const cur = pickRowField(row, 'currency_code', 'currencyCode', 'CURRENCY_CODE');
    const start = pickRowField(row, 'effective_start_date', 'effectiveStartDate', 'EFFECTIVE_START_DATE');

    if (planId == null || planId === '') {
      missing.push(`${p}.plan_id is required`);
    } else {
      const n = Number(planId);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        missing.push(`${p}.plan_id must be a positive integer`);
      }
    }

    if (compId == null || compId === '') {
      missing.push(`${p}.component_id is required`);
    } else {
      const n = Number(compId);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        missing.push(`${p}.component_id must be a positive integer`);
      }
    }

    if (amount == null || amount === '') {
      missing.push(`${p}.amount is required`);
    } else if (!Number.isFinite(Number(amount))) {
      missing.push(`${p}.amount must be a number`);
    }

    if (cur == null || String(cur).trim() === '') {
      missing.push(`${p}.currency_code is required`);
    }

    if (start == null || String(start).trim() === '') {
      missing.push(`${p}.effective_start_date is required`);
    } else if (!ISO_DATE_ONLY.test(String(start).trim().slice(0, 10))) {
      missing.push(`${p}.effective_start_date must be YYYY-MM-DD`);
    }

    const endRaw = pickRowField(row, 'effective_end_date', 'effectiveEndDate', 'EFFECTIVE_END_DATE');
    if (endRaw != null && String(endRaw).trim() !== '' && String(endRaw).toLowerCase() !== 'null') {
      if (!ISO_DATE_ONLY.test(String(endRaw).trim().slice(0, 10))) {
        missing.push(`${p}.effective_end_date must be YYYY-MM-DD when provided`);
      }
    }

    const af = pickRowField(row, 'active_flag', 'activeFlag', 'ACTIVE_FLAG');
    if (af != null && String(af).trim() !== '') {
      const u = String(af).trim().toUpperCase();
      if (u !== 'Y' && u !== 'N') {
        missing.push(`${p}.active_flag must be Y or N`);
      }
    }
  });

  if (missing.length > 0) {
    return { valid: false, missing };
  }
  return { valid: true, missing: [] };
}

export async function createEmployeeAllInOne(connection, body) {
  const binds = buildBinds(stripLegacyCreateCompensationFields(body));
  const result = await connection.execute(CREATE_EMPLOYEE_ALL_IN_ONE_SQL, binds, { autoCommit: true });
  const out = result.outBinds || {};
  const employeeId = Array.isArray(out.o_employee_id) ? out.o_employee_id[0] : out.o_employee_id;
  return { employeeId };
}

export async function insertDocument(connection, opts) {
  const {
    employeeId,
    documentTypeCode = 'EMPLOYEE_DOC',
    fileName,
    mimeType = 'application/octet-stream',
    fileContent,
    createdBy = 'API'
  } = opts;
  const binds = {
    p_employee_id: employeeId,
    p_document_type_code: documentTypeCode,
    p_file_name: fileName || 'document',
    p_mime_type: mimeType,
    p_status: 'UPLOADED',
    p_is_active: 'Y',
    p_created_by: createdBy,
    p_file_content: fileContent,
    p_access_url: null,
    p_file_hash_sha256: null,
    o_document_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
    o_document_guid: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT, maxSize: 16 }
  };
  const result = await connection.execute(INSERT_DOCUMENT_SQL, binds, { autoCommit: true });
  const out = result.outBinds || {};
  const documentId = Array.isArray(out.o_document_id) ? out.o_document_id[0] : out.o_document_id;
  const rawGuid = Array.isArray(out.o_document_guid) ? out.o_document_guid?.[0] : out.o_document_guid;
  const documentGuid = rawGuid != null && Buffer.isBuffer(rawGuid)
    ? rawGuid.toString('hex').toLowerCase()
    : (typeof rawGuid === 'string' ? rawGuid.toLowerCase() : null);
  return { documentId, documentGuid };
}

const UPDATE_DOCUMENT_ACCESS_URL_SQL = `
  UPDATE EMPL.DOCUMENTS
  SET ACCESS_URL = :access_url
  WHERE DOCUMENT_GUID = HEXTORAW(:guid)
`;

export async function updateDocumentAccessUrl(connection, documentGuidHex, accessUrl) {
  const guid = String(documentGuidHex ?? '').trim().replace(/-/g, '').toUpperCase();
  if (guid.length !== 32 || !/^[0-9A-F]+$/.test(guid)) return;
  await connection.execute(
    UPDATE_DOCUMENT_ACCESS_URL_SQL,
    { access_url: accessUrl, guid },
    { autoCommit: true }
  );
}
