/**
 * Service: Update employee via EMPL.EMPL_EMPLOYEE_UPDATE_API_PKG.UPDATE_EMPLOYEE_ALL_IN_ONE
 */

import oracledb from 'oracledb';
import { getConnection } from '../config/db.js';

const EMPLOYEE_STATUS_VALUES = ['ACTIVE', 'INACTIVE', 'PROBATION'];

const UPDATE_EMPLOYEE_ALL_IN_ONE_SQL = `
BEGIN
  EMPL.EMPL_EMPLOYEE_UPDATE_API_PKG.UPDATE_EMPLOYEE_ALL_IN_ONE(
    p_enterprise_id            => :p_enterprise_id,
    p_employee_id              => :p_employee_id,
    p_first_name_en            => :p_first_name_en,
    p_middle_name_en           => :p_middle_name_en,
    p_last_name_en             => :p_last_name_en,
    p_first_name_ar            => :p_first_name_ar,
    p_middle_name_ar           => :p_middle_name_ar,
    p_last_name_ar             => :p_last_name_ar,
    p_email                    => :p_email,
    p_phone_number             => :p_phone_number,
    p_mobile_number            => :p_mobile_number,
    p_date_of_birth            => :p_date_of_birth,
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
    p_bank_name                => :p_bank_name,
    p_account_number           => :p_account_number,
    p_iban                     => :p_iban,
    p_org_unit_id              => HEXTORAW(:p_org_unit_id_hex),
    p_work_location_id       => :p_work_location_id,
    p_position_id              => HEXTORAW(:p_position_id_hex),
    p_job_family_id            => :p_job_family_id,
    p_job_level_id             => :p_job_level_id,
    p_grade_id                 => :p_grade_id,
    p_enterprise_hire_date     => :p_enterprise_hire_date,
    p_contract_type_code      => :p_contract_type_code,
    p_probation_days           => :p_probation_days,
    p_reporting_to_emp_id      => :p_reporting_to_emp_id,
    p_employment_status       => :p_employment_status,
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
    p_doc_access_url           => :p_doc_access_url,
    p_doc_hash_sha256          => :p_doc_hash_sha256,
    p_doc_file_content         => :p_doc_file_content,
    p_doc_action               => :p_doc_action,
    p_replace_document_id      => :p_replace_document_id,
    p_actor                    => :p_actor,
    p_employee_status          => :p_employee_status,
    p_employee_is_active       => :p_employee_is_active,
    o_document_id              => :o_document_id,
    o_document_guid            => :o_document_guid
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

function strOrNull(...vals) {
  const v = vals.find(x => x != null && String(x).trim() !== '');
  return v != null ? String(v).trim() : null;
}

/** Arabic name fields are optional; returns null for missing, empty, or whitespace-only. */
function optionalStrAr(...vals) {
  const v = vals.find(x => x != null && String(x).trim() !== '');
  return v != null ? String(v).trim() : null;
}

function toNum(...vals) {
  const v = vals.find(x => x != null && x !== '');
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeHex(hex) {
  if (hex == null || hex === '') return null;
  const s = String(hex).replace(/^0x/i, '').replace(/-/g, '').trim();
  return s.length === 32 && /^[0-9A-Fa-f]+$/.test(s) ? s.toUpperCase() : null;
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

const DOC_ACTION_VALUES = ['ADD', 'REPLACE'];
function normalizeDocAction(val) {
  if (val == null || String(val).trim() === '') return 'ADD';
  const s = String(val).trim().toUpperCase();
  return DOC_ACTION_VALUES.includes(s) ? s : 'ADD';
}

/**
 * Build bind object for UPDATE_EMPLOYEE_ALL_IN_ONE. Request body field names match create (snake_case);
 * camelCase is accepted as fallback for compatibility. org_unit_id / org_unit_id_hex and position_id /
 * position_id_hex: 32-char hex string, bound as HEXTORAW in SQL.
 */
export function buildUpdateBinds(employeeId, body) {
  const b = body || {};
  const orgUnitHex = normalizeHex(b.org_unit_id_hex ?? b.org_unit_id ?? b.orgUnitId ?? b.orgUnitIdHex);
  const positionHex = normalizeHex(b.position_id_hex ?? b.position_id ?? b.positionId ?? b.positionIdHex);

  return {
    p_enterprise_id: toNum(b.enterprise_id, b.enterpriseId) ?? null,
    p_employee_id: Number(employeeId),
    p_first_name_en: strOrNull(b.first_name_en, b.firstNameEn),
    p_middle_name_en: strOrNull(b.middle_name_en, b.middleNameEn),
    p_last_name_en: strOrNull(b.last_name_en, b.lastNameEn),
    p_first_name_ar: optionalStrAr(b.first_name_ar, b.firstNameAr, b.FIRST_NAME_AR),
    p_middle_name_ar: optionalStrAr(b.middle_name_ar, b.middleNameAr, b.MIDDLE_NAME_AR),
    p_last_name_ar: optionalStrAr(b.last_name_ar, b.lastNameAr, b.LAST_NAME_AR),
    p_email: strOrNull(b.email),
    p_phone_number: strOrNull(b.phone_number, b.phoneNumber),
    p_mobile_number: strOrNull(b.mobile_number, b.mobileNumber),
    p_date_of_birth: parseDate(b.date_of_birth ?? b.dateOfBirth),
    p_gender_code: strOrNull(b.gender_code, b.genderCode),
    p_nationality: strOrNull(b.nationality),
    p_marital_status_code: strOrNull(b.marital_status_code, b.maritalStatusCode),
    p_religion_code: strOrNull(b.religion_code, b.religionCode),
    p_civil_id_number: strOrNull(b.civil_id_number, b.civilIdNumber),
    p_passport_number: strOrNull(b.passport_number, b.passportNumber),
    p_contact_name: strOrNull(b.contact_name, b.emergencyContactName),
    p_relationship: strOrNull(b.relationship, b.emergencyRelationship),
    p_emerg_phone: strOrNull(b.emerg_phone, b.emergencyPhone),
    p_emerg_email: strOrNull(b.emerg_email, b.emergencyEmail),
    p_emerg_address: strOrNull(b.emerg_address, b.emergencyAddress),
    p_work_schedule_id: toNum(b.work_schedule_id, b.workScheduleId),
    p_ws_start: parseDate(b.ws_start ?? b.wsStart),
    p_ws_end: parseDate(b.ws_end ?? b.wsEnd),
    p_basic_salary_kwd: toNum(b.basic_salary_kwd, b.basicSalaryKwd),
    p_comp_start: parseDate(b.comp_start ?? b.compStart),
    p_comp_end: parseDate(b.comp_end ?? b.compEnd),
    p_housing_kwd: toNum(b.housing_kwd, b.housingKwd),
    p_transport_kwd: toNum(b.transport_kwd, b.transportKwd),
    p_food_kwd: toNum(b.food_kwd, b.foodKwd),
    p_mobile_kwd: toNum(b.mobile_kwd, b.mobileKwd),
    p_other_kwd: toNum(b.other_kwd, b.otherKwd),
    p_allow_start: parseDate(b.allow_start ?? b.allowStart),
    p_allow_end: parseDate(b.allow_end ?? b.allowEnd),
    p_civil_id_expiry: parseDate(b.civil_id_expiry ?? b.civilIdExpiry),
    p_passport_expiry: parseDate(b.passport_expiry ?? b.passportExpiry),
    p_visa_number: strOrNull(b.visa_number, b.visaNumber),
    p_visa_expiry: parseDate(b.visa_expiry ?? b.visaExpiry),
    p_work_permit_number: strOrNull(b.work_permit_number, b.workPermitNumber),
    p_work_permit_expiry: parseDate(b.work_permit_expiry ?? b.workPermitExpiry),
    p_bank_code: strOrNull(b.bank_code, b.bankCode),
    p_bank_name: strOrNull(b.bank_name, b.bankName),
    p_account_number: strOrNull(b.account_number, b.accountNumber),
    p_iban: strOrNull(b.iban),
    p_org_unit_id_hex: orgUnitHex,
    p_work_location_id: toNum(b.work_location_id, b.workLocationId),
    p_position_id_hex: positionHex,
    p_job_family_id: toNum(b.job_family_id, b.jobFamilyId),
    p_job_level_id: toNum(b.job_level_id, b.jobLevelId),
    p_grade_id: toNum(b.grade_id, b.gradeId),
    p_enterprise_hire_date: parseDate(b.enterprise_hire_date ?? b.enterpriseHireDate),
    p_contract_type_code: strOrNull(b.contract_type_code, b.contractTypeCode),
    p_probation_days: toNum(b.probation_days, b.probationDays),
    p_reporting_to_emp_id: toNum(b.reporting_to_emp_id, b.reportingToEmpId),
    p_employment_status: strOrNull(b.employment_status, b.employmentStatus),
    p_asg_start: parseDate(b.asg_start ?? b.asgStart),
    p_asg_end: parseDate(b.asg_end ?? b.asgEnd),
    p_address_line1: strOrNull(b.address_line1, b.addressLine1),
    p_address_line2: strOrNull(b.address_line2, b.addressLine2),
    p_city: strOrNull(b.city),
    p_area: strOrNull(b.area),
    p_country_code: strOrNull(b.country_code, b.countryCode),
    p_document_type_code: strOrNull(b.document_type_code, b.documentTypeCode),
    p_doc_file_name: strOrNull(b.doc_file_name, b.docFileName),
    p_doc_mime_type: strOrNull(b.doc_mime_type, b.docMimeType),
    p_doc_access_url: strOrNull(b.doc_access_url, b.docAccessUrl),
    p_doc_hash_sha256: strOrNull(b.doc_hash_sha256, b.docHashSha256),
    p_doc_action: normalizeDocAction(b.doc_action ?? b.docAction),
    p_replace_document_id: toNum(b.replace_document_id, b.replaceDocumentId),
    p_actor: strOrNull(b.actor),
    p_employee_status: normalizeEmployeeStatus(b),
    p_employee_is_active: normalizeEmployeeIsActive(b)
  };
}

/**
 * Validation for update body. Returns { valid: boolean, message?: string, code?: string }.
 * Required: enterprise_id (body), employee_id (URL). All document fields are optional.
 * first_name_ar, middle_name_ar, last_name_ar (Arabic names) are optional.
 * doc_action defaults to ADD; if provided must be ADD | REPLACE (case-insensitive).
 * replace_document_id if provided must be a number.
 */
export function validateUpdateBody(body, employeeId) {
  const empId = parseInt(employeeId, 10);
  if (!Number.isInteger(empId) || empId < 1) {
    return { valid: false, message: 'employee_id must be a positive integer', code: 'VALIDATION_ERROR' };
  }
  const entId = body?.enterprise_id ?? body?.enterpriseId ?? body?.ENTERPRISE_ID;
  if (entId == null || entId === '') {
    return { valid: false, message: 'enterprise_id is required', code: 'VALIDATION_ERROR' };
  }
  const entNum = Number(entId);
  if (!Number.isFinite(entNum) || entNum < 1) {
    return { valid: false, message: 'enterprise_id must be a positive number', code: 'VALIDATION_ERROR' };
  }
  const statusVal = body?.employee_status ?? body?.employeeStatus ?? body?.EMPLOYEE_STATUS;
  if (statusVal != null && String(statusVal).trim() !== '') {
    const u = String(statusVal).trim().toUpperCase();
    if (!EMPLOYEE_STATUS_VALUES.includes(u)) {
      return { valid: false, message: 'employee_status must be one of: ACTIVE, INACTIVE, PROBATION', code: 'VALIDATION_ERROR' };
    }
  }
  const isActiveVal = body?.employee_is_active ?? body?.employeeIsActive ?? body?.EMPLOYEE_IS_ACTIVE ?? body?.IS_ACTIVE;
  if (isActiveVal != null && String(isActiveVal).trim() !== '') {
    const u = String(isActiveVal).trim().toUpperCase();
    if (u !== 'Y' && u !== 'N') {
      return { valid: false, message: 'employee_is_active must be Y or N', code: 'VALIDATION_ERROR' };
    }
  }
  const docActionVal = body?.doc_action ?? body?.docAction;
  if (docActionVal != null && String(docActionVal).trim() !== '') {
    const u = String(docActionVal).trim().toUpperCase();
    if (!DOC_ACTION_VALUES.includes(u)) {
      return { valid: false, message: 'doc_action must be ADD or REPLACE', code: 'VALIDATION_ERROR' };
    }
  }
  const replaceDocId = body?.replace_document_id ?? body?.replaceDocumentId;
  if (replaceDocId !== undefined && replaceDocId !== null && replaceDocId !== '') {
    const n = Number(replaceDocId);
    if (!Number.isFinite(n) || n < 0) {
      return { valid: false, message: 'replace_document_id must be a non-negative number', code: 'VALIDATION_ERROR' };
    }
  }
  return { valid: true };
}

/**
 * Execute UPDATE_EMPLOYEE_ALL_IN_ONE. When connection is provided, caller must close it.
 * @param {object} connection - Oracle connection (optional; if omitted, one is obtained and closed)
 * @param {number} employeeId
 * @param {Object} body - Request body (snake_case, same as create; camelCase accepted)
 * @param {Object} fileOpts - Optional { fileContent: Buffer, fileName?: string, mimeType?: string } for document upload
 * @returns {Promise<{ documentId?: number, documentGuid?: string }>} documentId/guid when procedure returns them
 */
export async function updateEmployeeAllInOne(connection, employeeId, body, fileOpts = {}) {
  const ownConnection = connection == null;
  const conn = connection ?? await getConnection();
  try {
    const binds = buildUpdateBinds(employeeId, body);
    if (fileOpts.fileContent != null) {
      binds.p_doc_file_content = fileOpts.fileContent;
      binds.p_doc_access_url = null;
      binds.p_doc_file_name = fileOpts.fileName ?? binds.p_doc_file_name ?? null;
      binds.p_doc_mime_type = fileOpts.mimeType ?? binds.p_doc_mime_type ?? null;
    } else {
      binds.p_doc_file_content = { type: oracledb.BLOB, dir: oracledb.BIND_IN, val: null };
    }
    binds.o_document_id = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };
    binds.o_document_guid = { type: oracledb.BUFFER, dir: oracledb.BIND_OUT, maxSize: 16 };
    const result = await conn.execute(UPDATE_EMPLOYEE_ALL_IN_ONE_SQL, binds, { autoCommit: true });
    const outBinds = result.outBinds || {};
    const docId = Array.isArray(outBinds.o_document_id) ? outBinds.o_document_id[0] : outBinds.o_document_id;
    const rawGuid = Array.isArray(outBinds.o_document_guid) ? outBinds.o_document_guid?.[0] : outBinds.o_document_guid;
    let documentGuid = null;
    if (rawGuid != null && Buffer.isBuffer(rawGuid) && rawGuid.length === 16) {
      documentGuid = rawGuid.toString('hex').toLowerCase();
    } else if (typeof rawGuid === 'string' && rawGuid.trim().length === 32) {
      documentGuid = rawGuid.trim().toLowerCase();
    }
    return { documentId: docId ?? null, documentGuid };
  } finally {
    if (ownConnection) {
      try { await conn.close(); } catch (_) {}
    }
  }
}
