/**
 * Service: Create employee via EMPL.EMPL_EMPLOYEE_CREATE_API_PKG.CREATE_EMPLOYEE_ALL_IN_ONE
 * No direct DML; calls package procedure only with named binds.
 */

import oracledb from 'oracledb';

// ---------------------------------------------------------------------------
// REQUEST SCHEMA / DTO (field list for POST /api/v1/employees/all-in-one)
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} CreateEmployeeAllInOneRequest
 *
 * 1) EMPLOYEE (CORE)
 * @property {number}   enterprise_id          REQUIRED
 * @property {string}   first_name_en          REQUIRED
 * @property {string}   last_name_en           REQUIRED
 * @property {string}   email                  REQUIRED
 * @property {string}   phone_number           REQUIRED
 * @property {string}   date_of_birth          REQUIRED (YYYY-MM-DD)
 * @property {string}   [middle_name_en]
 * @property {string}   [first_name_ar]
 * @property {string}   [middle_name_ar]
 * @property {string}   [last_name_ar]
 * @property {string}   [mobile_number]
 *
 * 2) DEMOGRAPHICS
 * @property {string}   gender_code            REQUIRED
 * @property {string}   nationality            REQUIRED
 * @property {string}   [marital_status_code]
 * @property {string}   [religion_code]
 * @property {string}   [civil_id_number]
 * @property {string}   [passport_number]
 *
 * 3) EMERGENCY CONTACT
 * @property {string}   contact_name           REQUIRED
 * @property {string}   relationship            REQUIRED
 * @property {string}   emerg_phone             REQUIRED
 * @property {string}   [emerg_email]
 * @property {string}   [emerg_address]
 *
 * 4) WORK SCHEDULE
 * @property {number}   work_schedule_id       REQUIRED
 * @property {string}   [ws_start]             DATE YYYY-MM-DD
 * @property {string}   [ws_end]               DATE YYYY-MM-DD
 *
 * 5) COMPENSATION - all optional
 * @property {number}   [basic_salary_kwd]
 * @property {string}   [comp_start]
 * @property {string}   [comp_end]
 *
 * 6) ALLOWANCES - optional; other_kwd defaults to 0
 * @property {number}   [housing_kwd]
 * @property {number}   [transport_kwd]
 * @property {number}   [food_kwd]
 * @property {number}   [mobile_kwd]
 * @property {number}   [other_kwd]            Default 0 if not provided
 * @property {string}   [allow_start]
 * @property {string}   [allow_end]
 *
 * 7) DOCUMENT COMPLIANCE - all optional
 * @property {string}   [civil_id_expiry]
 * @property {string}   [passport_expiry]
 * @property {string}   [visa_number]
 * @property {string}   [visa_expiry]
 * @property {string}   [work_permit_number]
 * @property {string}   [work_permit_expiry]
 *
 * 8) BANK
 * @property {string}   bank_code              REQUIRED
 * @property {string}   account_number          REQUIRED
 * @property {string}   [iban]
 *
 * 9) ASSIGNMENT
 * @property {string}   org_unit_id_hex         REQUIRED (32 hex chars → RAW(16))
 * @property {string}   enterprise_hire_date   REQUIRED (YYYY-MM-DD)
 * @property {string}   contract_type_code     REQUIRED
 * @property {string}   employment_status      REQUIRED
 * @property {string}   [employee_number]
 * @property {number}   [work_location_id]
 * @property {string}   [position_id_hex]     (32 hex → RAW(16))
 * @property {number}   [job_family_id]
 * @property {number}   [job_level_id]
 * @property {number}   [grade_id]
 * @property {number}   [probation_days]
 * @property {number}   [reporting_to_emp_id]
 * @property {string}   [asg_start]
 * @property {string}   [asg_end]
 *
 * 10) ADDRESS - all optional
 * @property {string}   [address_line1]
 * @property {string}   [address_line2]
 * @property {string}   [city]
 * @property {string}   [area]
 * @property {string}   [country_code]
 *
 * 11) DOCUMENT (URL) - all optional
 * @property {string}   [document_type_code]
 * @property {string}   [doc_file_name]
 * @property {string}   [doc_mime_type]
 * @property {string}   [doc_access_url]
 * @property {string}   [doc_hash_sha256]
 *
 * 12) AUDIT
 * @property {string}   [actor]
 */

/** Required field keys for validation (API names). */
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
    p_basic_salary_kwd         => :p_basic_salary_kwd,
    p_comp_start               => :p_comp_start,
    p_comp_end                 => :p_comp_end,
    p_housing_kwd              => :p_housing_kwd,
    p_transport_kwd            => :p_transport_kwd,
    p_food_kwd                 => :p_food_kwd,
    p_mobile_kwd               => :p_mobile_kwd,
    p_other_kwd                => :p_other_kwd,
    p_allow_start              => :p_allow_start,
    p_allow_end                => :p_allow_end,
    p_civil_id_expiry          => :p_civil_id_expiry,
    p_passport_expiry          => :p_passport_expiry,
    p_visa_number              => :p_visa_number,
    p_visa_expiry              => :p_visa_expiry,
    p_work_permit_number       => :p_work_permit_number,
    p_work_permit_expiry       => :p_work_permit_expiry,
    p_bank_code                => :p_bank_code,
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
    o_employee_id              => :o_employee_id
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

/**
 * Build bind object for CREATE_EMPLOYEE_ALL_IN_ONE from request body.
 * p_other_kwd defaults to 0 if not provided.
 */
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
    p_basic_salary_kwd: toNum(body.basic_salary_kwd, body.basicSalaryKwd, body.BASIC_SALARY_KWD),
    p_comp_start: parseDate(body.comp_start ?? body.compStart ?? body.COMP_START) ?? null,
    p_comp_end: parseDate(body.comp_end ?? body.compEnd ?? body.COMP_END) ?? null,
    p_housing_kwd: toNum(body.housing_kwd, body.housingKwd, body.HOUSING_KWD),
    p_transport_kwd: toNum(body.transport_kwd, body.transportKwd, body.TRANSPORT_KWD),
    p_food_kwd: toNum(body.food_kwd, body.foodKwd, body.FOOD_KWD),
    p_mobile_kwd: toNum(body.mobile_kwd, body.mobileKwd, body.MOBILE_KWD),
    p_other_kwd: toNum(body.other_kwd, body.otherKwd, body.OTHER_KWD) ?? 0,
    p_allow_start: (() => {
      const d = parseDate(body.allow_start ?? body.allowStart ?? body.ALLOW_START);
      if (d) return d;
      const hasAllowance = [body.housing_kwd, body.transport_kwd, body.food_kwd, body.mobile_kwd].some(v => v != null && v !== '');
      return hasAllowance ? parseDate(body.enterprise_hire_date ?? body.enterpriseHireDate ?? body.ENTERPRISE_HIRE_DATE) : null;
    })(),
    p_allow_end: (() => {
      const d = parseDate(body.allow_end ?? body.allowEnd ?? body.ALLOW_END);
      if (d) return d;
      const hasAllowance = [body.housing_kwd, body.transport_kwd, body.food_kwd, body.mobile_kwd].some(v => v != null && v !== '');
      return hasAllowance ? new Date('4712-12-31') : null;
    })(),
    p_civil_id_expiry: parseDate(body.civil_id_expiry ?? body.civilIdExpiry ?? body.CIVIL_ID_EXPIRY) ?? null,
    p_passport_expiry: parseDate(body.passport_expiry ?? body.passportExpiry ?? body.PASSPORT_EXPIRY) ?? null,
    p_visa_number: strBind(fromBody(body, 'visa_number', 'visaNumber', 'VISA_NUMBER', 'visa_no', 'visaNo', 'VISA_NO')),
    p_visa_expiry: (() => { const d = parseDate(body.visa_expiry ?? body.visaExpiry ?? body.VISA_EXPIRY); return d; })(),
    p_work_permit_number: strBind(fromBody(body, 'work_permit_number', 'workPermitNumber', 'WORK_PERMIT_NUMBER', 'work_permit_no', 'workPermitNo')),
    p_work_permit_expiry: (() => { const d = parseDate(body.work_permit_expiry ?? body.workPermitExpiry ?? body.WORK_PERMIT_EXPIRY ?? body.work_permit_expiry_date ?? body.workPermitExpiryDate); return d; })(),
    p_bank_code: body.bank_code ?? body.bankCode ?? body.BANK_CODE,
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
    // Document: same as PL/SQL – only insert when p_doc_file_name is non-empty. Pass plain string/null like other IN params.
    ...(function () {
      const docFileName = strOrNull(
        body.doc_file_name,
        body.docFileName,
        body.DOC_FILE_NAME,
        body.file_name,
        body.fileName,
        body.document_file_name
      );
      const hasDocFile = docFileName != null && String(docFileName).trim() !== '';
      const docType = strOrNull(body.document_type_code, body.documentTypeCode, body.DOCUMENT_TYPE_CODE) ?? 'EMPLOYEE_DOC';
      const docMime = strOrNull(body.doc_mime_type, body.docMimeType, body.DOC_MIME_TYPE);
      const docUrl = strOrNull(body.doc_access_url, body.docAccessUrl, body.DOC_ACCESS_URL);
      const docHash = strOrNull(body.doc_hash_sha256, body.docHashSha256, body.DOC_HASH_SHA256);
      if (!hasDocFile) {
        return {
          p_document_type_code: null,
          p_doc_file_name: null,
          p_doc_mime_type: null,
          p_doc_access_url: null,
          p_doc_hash_sha256: null
        };
      }
      return {
        p_document_type_code: docType,
        p_doc_file_name: docFileName,
        p_doc_mime_type: docMime,
        p_doc_access_url: docUrl != null && String(docUrl).trim() !== '' ? docUrl : docFileName,
        p_doc_hash_sha256: docHash
      };
    })(),
    p_actor: strOrNull(body.actor, body.ACTOR, body.p_actor),
    o_employee_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
  };
}

/** Map API field name -> list of body keys to check (for validation). */
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

/**
 * Validate required fields before calling PL/SQL.
 * @param {Object} body - Request body (form or JSON)
 * @returns {{ valid: boolean, missing: string[] }}
 */
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
  return { valid: true, missing: [] };
}

/**
 * Call EMPL.EMPL_EMPLOYEE_CREATE_API_PKG.CREATE_EMPLOYEE_ALL_IN_ONE.
 * Caller must get and release connection.
 * @param {import('oracledb').Connection} connection
 * @param {CreateEmployeeAllInOneRequest} body - Normalized request body
 * @returns {Promise<{ employeeId: number }>}
 */
export async function createEmployeeAllInOne(connection, body) {
  const binds = buildBinds(body);
  const result = await connection.execute(CREATE_EMPLOYEE_ALL_IN_ONE_SQL, binds, { autoCommit: true });
  const out = result.outBinds || {};
  const employeeId = Array.isArray(out.o_employee_id) ? out.o_employee_id[0] : out.o_employee_id;
  return { employeeId };
}
