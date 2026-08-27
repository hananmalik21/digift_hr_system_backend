import oracledb from 'oracledb';
import { bufferToHex, hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { packageStatusIsSuccess, withConnection } from '../../../../utils/oraclePackageUtils.js';
import { applyRequisitionDefaults } from '../utils/recRequisitionValidators.js';

export { packageStatusIsSuccess };

const PKG = 'REC.CREATE_REQUISITION_PKG';
const CREATE_PROC = `${PKG}.create_requisition`;
const UPDATE_PROC = `${PKG}.update_requisition`;
const DELETE_PROC = `${PKG}.delete_requisition`;
const APPROVE_PROC = `${PKG}.approve_requisition`;
const OPEN_PROC = `${PKG}.open_requisition`;
const CLOSE_PROC = `${PKG}.close_requisition`;
const HOLD_PROC = `${PKG}.hold_requisition`;
const REOPEN_PROC = `${PKG}.reopen_requisition`;
const REJECT_PROC = `${PKG}.reject_requisition`;

const GENERIC_ERROR_MESSAGE = 'Unable to process requisition. Please try again.';

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function strOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function ynOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  if (s === 'Y' || s === 'N') return s;
  return s.slice(0, 1) === 'Y' ? 'Y' : 'N';
}

function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function optionalRawBuffer(v) {
  if (v === undefined || v === null || v === '') return null;
  return hexToRawBuffer(v);
}

function requiredRawBuffer(v) {
  return hexToRawBuffer(v);
}

/**
 * Accepts a JSON array from the request body; stringifies for Oracle CLOB bind.
 * @param {unknown} value
 * @returns {string|null}
 */
function jsonArrayToClobString(value) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    if (Object.keys(value).length === 0) return null;
    return JSON.stringify(value);
  }
  return null;
}

function parseFileContent(body) {
  const raw = body.file_content ?? body.fileContent ?? body.file;
  if (raw == null || raw === '') return null;
  if (Buffer.isBuffer(raw)) return raw;
  let s = String(raw).trim();
  if (!s) return null;
  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/i.exec(s);
  if (dataUrlMatch) s = dataUrlMatch[1];
  try {
    return Buffer.from(s, 'base64');
  } catch (_) {
    return null;
  }
}

function normalizeOutString(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutString(v[0]);
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeOutNumber(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutNumber(v[0]);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeOutGuidHex(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutGuidHex(v[0]);
  return bufferToHex(v);
}

/** @param {unknown} value @returns {'DRAFT'|'SUBMIT'} */
export function resolveRequisitionAction(value) {
  if (value === undefined || value === null || value === '') return 'DRAFT';
  const a = String(value).trim().toUpperCase();
  if (a === 'DRAFT' || a === 'SUBMIT') return a;
  return 'DRAFT';
}

/** @deprecated Use resolveRequisitionAction after API validation */
export const resolveCreateAction = resolveRequisitionAction;

/** @deprecated Use resolveRequisitionAction after API validation */
export const resolveUpdateAction = resolveRequisitionAction;

function actionBind(val) {
  return { val, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 20 };
}

function guidInBind(hex) {
  return {
    val: hexToRawBuffer(hex),
    dir: oracledb.BIND_IN,
    type: oracledb.BUFFER,
    maxSize: 16
  };
}

async function executeLifecycle(plsql, binds) {
  try {
    const result = await withConnection((connection) =>
      connection.execute(plsql, binds, { autoCommit: true })
    );
    const parsed = parsePackageOut(result?.outBinds);
    return { status: parsed.status, message: parsed.message };
  } catch (err) {
    console.error('[recRequisitionsModel] lifecycle procedure failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_ERROR_MESSAGE };
  }
}

function buildSharedInBinds(b) {
  const fileBuf = parseFileContent(b);
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_requisition_title: {
      val: strOrNull(b.requisition_title),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_position_id: {
      val: optionalRawBuffer(b.position_id),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_org_unit_id: {
      val: optionalRawBuffer(b.org_unit_id),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_job_family_id: { val: intOrNull(b.job_family_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_job_level_id: { val: intOrNull(b.job_level_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_grade_id: { val: intOrNull(b.grade_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_employment_type_code: {
      val: strOrNull(b.employment_type_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_number_of_openings: { val: intOrNull(b.number_of_openings), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_priority_code: {
      val: strOrNull(b.priority_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_primary_location_id: {
      val: optionalRawBuffer(b.primary_location_id),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_work_mode_code: {
      val: strOrNull(b.work_mode_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_target_start_date: { val: parseDate(b.target_start_date), dir: oracledb.BIND_IN, type: oracledb.DATE },
    p_expected_end_date: { val: parseDate(b.expected_end_date), dir: oracledb.BIND_IN, type: oracledb.DATE },
    p_position_type_code: {
      val: strOrNull(b.position_type_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_business_justification: {
      val: strOrNull(b.business_justification),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_impact_if_not_filled: {
      val: strOrNull(b.impact_if_not_filled),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_reports_to_position_id: {
      val: optionalRawBuffer(b.reports_to_position_id),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_justification_org_unit_id: {
      val: optionalRawBuffer(b.justification_org_unit_id),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_cost_center_id: {
      val: strOrNull(b.cost_center_id),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_position_summary: {
      val: strOrNull(b.position_summary),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_key_responsibilities: {
      val: strOrNull(b.key_responsibilities),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_minimum_qualifications: {
      val: strOrNull(b.minimum_qualifications),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_preferred_qualifications: {
      val: strOrNull(b.preferred_qualifications),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_travel_requirement_code: {
      val: strOrNull(b.travel_requirement_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_required_certifications: {
      val: strOrNull(b.required_certifications),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_physical_requirements: {
      val: strOrNull(b.physical_requirements),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_skills_json: {
      val: jsonArrayToClobString(b.skills_json),
      dir: oracledb.BIND_IN,
      type: oracledb.CLOB
    },
    p_min_education_level_code: {
      val: strOrNull(b.min_education_level_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_experience_required_code: {
      val: strOrNull(b.experience_required_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_preferred_field_of_study: {
      val: strOrNull(b.preferred_field_of_study),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_management_experience_code: {
      val: strOrNull(b.management_experience_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_hiring_manager_employee_id: {
      val: intOrNull(b.hiring_manager_employee_id),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_recruiter_employee_id: {
      val: intOrNull(b.recruiter_employee_id),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_hrbp_employee_id: { val: intOrNull(b.hrbp_employee_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_interview_panel_json: {
      val: jsonArrayToClobString(b.interview_panel_json),
      dir: oracledb.BIND_IN,
      type: oracledb.CLOB
    },
    p_currency_code: {
      val: strOrNull(b.currency_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 10
    },
    p_compensation_type_code: {
      val: strOrNull(b.compensation_type_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_minimum_salary: { val: numOrNull(b.minimum_salary), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_maximum_salary: { val: numOrNull(b.maximum_salary), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_bonus_eligible_flag: {
      val: ynOrNull(b.bonus_eligible_flag),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    },
    p_equity_eligible_flag: {
      val: ynOrNull(b.equity_eligible_flag),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    },
    p_additional_benefits: {
      val: strOrNull(b.additional_benefits),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_budget_code: {
      val: strOrNull(b.budget_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_approved_budget_amount: {
      val: numOrNull(b.approved_budget_amount),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_file_name: { val: strOrNull(b.file_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_mime_type: { val: strOrNull(b.mime_type), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_file_size: { val: numOrNull(b.file_size), dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  if (fileBuf != null) {
    binds.p_file_content = { val: fileBuf, dir: oracledb.BIND_IN, type: oracledb.BLOB };
  } else {
    binds.p_file_content = { val: null, dir: oracledb.BIND_IN, type: oracledb.BLOB };
  }

  return binds;
}

function parsePackageOut(outBinds) {
  const ob = outBinds || {};
  return {
    requisition_id: normalizeOutNumber(ob.o_requisition_id),
    requisition_guid: normalizeOutGuidHex(ob.o_requisition_guid),
    requisition_number: normalizeOutString(ob.o_requisition_number),
    status: normalizeOutString(ob.o_status),
    message: normalizeOutString(ob.o_message) ?? ''
  };
}

function packageErrorResult(message = GENERIC_ERROR_MESSAGE) {
  return {
    requisition_id: null,
    requisition_guid: null,
    requisition_number: null,
    status: 'ERROR',
    message
  };
}

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    p_enterprise_id              => :p_enterprise_id,
    p_requisition_title          => :p_requisition_title,
    p_position_id                => :p_position_id,
    p_org_unit_id                => :p_org_unit_id,
    p_job_family_id              => :p_job_family_id,
    p_job_level_id               => :p_job_level_id,
    p_grade_id                   => :p_grade_id,
    p_employment_type_code       => :p_employment_type_code,
    p_number_of_openings         => :p_number_of_openings,
    p_priority_code              => :p_priority_code,
    p_primary_location_id        => :p_primary_location_id,
    p_work_mode_code             => :p_work_mode_code,
    p_target_start_date          => :p_target_start_date,
    p_expected_end_date          => :p_expected_end_date,
    p_position_type_code         => :p_position_type_code,
    p_business_justification     => :p_business_justification,
    p_impact_if_not_filled       => :p_impact_if_not_filled,
    p_reports_to_position_id     => :p_reports_to_position_id,
    p_justification_org_unit_id  => :p_justification_org_unit_id,
    p_cost_center_id             => :p_cost_center_id,
    p_position_summary           => :p_position_summary,
    p_key_responsibilities       => :p_key_responsibilities,
    p_minimum_qualifications     => :p_minimum_qualifications,
    p_preferred_qualifications   => :p_preferred_qualifications,
    p_travel_requirement_code    => :p_travel_requirement_code,
    p_required_certifications    => :p_required_certifications,
    p_physical_requirements      => :p_physical_requirements,
    p_skills_json                => :p_skills_json,
    p_min_education_level_code   => :p_min_education_level_code,
    p_experience_required_code     => :p_experience_required_code,
    p_preferred_field_of_study   => :p_preferred_field_of_study,
    p_management_experience_code => :p_management_experience_code,
    p_hiring_manager_employee_id => :p_hiring_manager_employee_id,
    p_recruiter_employee_id      => :p_recruiter_employee_id,
    p_hrbp_employee_id           => :p_hrbp_employee_id,
    p_interview_panel_json       => :p_interview_panel_json,
    p_currency_code              => :p_currency_code,
    p_compensation_type_code     => :p_compensation_type_code,
    p_minimum_salary             => :p_minimum_salary,
    p_maximum_salary             => :p_maximum_salary,
    p_bonus_eligible_flag        => :p_bonus_eligible_flag,
    p_equity_eligible_flag       => :p_equity_eligible_flag,
    p_additional_benefits        => :p_additional_benefits,
    p_budget_code                => :p_budget_code,
    p_approved_budget_amount     => :p_approved_budget_amount,
    p_file_name                  => :p_file_name,
    p_mime_type                  => :p_mime_type,
    p_file_size                  => :p_file_size,
    p_file_content               => :p_file_content,
    p_action                     => :p_action,
    p_created_by                 => :p_created_by,
    p_requisition_id             => :o_requisition_id,
    p_requisition_guid           => :o_requisition_guid,
    p_requisition_number         => :o_requisition_number,
    p_status                     => :o_status,
    p_message                    => :o_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    p_requisition_guid           => :p_requisition_guid,
    p_enterprise_id              => :p_enterprise_id,
    p_requisition_title          => :p_requisition_title,
    p_position_id                => :p_position_id,
    p_org_unit_id                => :p_org_unit_id,
    p_job_family_id              => :p_job_family_id,
    p_job_level_id               => :p_job_level_id,
    p_grade_id                   => :p_grade_id,
    p_employment_type_code       => :p_employment_type_code,
    p_number_of_openings         => :p_number_of_openings,
    p_priority_code              => :p_priority_code,
    p_primary_location_id        => :p_primary_location_id,
    p_work_mode_code             => :p_work_mode_code,
    p_target_start_date          => :p_target_start_date,
    p_expected_end_date          => :p_expected_end_date,
    p_position_type_code         => :p_position_type_code,
    p_business_justification     => :p_business_justification,
    p_impact_if_not_filled       => :p_impact_if_not_filled,
    p_reports_to_position_id     => :p_reports_to_position_id,
    p_justification_org_unit_id  => :p_justification_org_unit_id,
    p_cost_center_id             => :p_cost_center_id,
    p_position_summary           => :p_position_summary,
    p_key_responsibilities       => :p_key_responsibilities,
    p_minimum_qualifications     => :p_minimum_qualifications,
    p_preferred_qualifications   => :p_preferred_qualifications,
    p_travel_requirement_code    => :p_travel_requirement_code,
    p_required_certifications    => :p_required_certifications,
    p_physical_requirements      => :p_physical_requirements,
    p_skills_json                => :p_skills_json,
    p_min_education_level_code   => :p_min_education_level_code,
    p_experience_required_code     => :p_experience_required_code,
    p_preferred_field_of_study   => :p_preferred_field_of_study,
    p_management_experience_code => :p_management_experience_code,
    p_hiring_manager_employee_id => :p_hiring_manager_employee_id,
    p_recruiter_employee_id      => :p_recruiter_employee_id,
    p_hrbp_employee_id           => :p_hrbp_employee_id,
    p_interview_panel_json       => :p_interview_panel_json,
    p_currency_code              => :p_currency_code,
    p_compensation_type_code     => :p_compensation_type_code,
    p_minimum_salary             => :p_minimum_salary,
    p_maximum_salary             => :p_maximum_salary,
    p_bonus_eligible_flag        => :p_bonus_eligible_flag,
    p_equity_eligible_flag       => :p_equity_eligible_flag,
    p_additional_benefits        => :p_additional_benefits,
    p_budget_code                => :p_budget_code,
    p_approved_budget_amount     => :p_approved_budget_amount,
    p_file_name                  => :p_file_name,
    p_mime_type                  => :p_mime_type,
    p_file_size                  => :p_file_size,
    p_file_content               => :p_file_content,
    p_action                     => :p_action,
    p_last_updated_by            => :p_last_updated_by,
    p_status                     => :o_status,
    p_message                    => :o_message
  );
END;`;

const APPROVE_PLSQL = `
BEGIN
  ${APPROVE_PROC}(
    p_requisition_guid => :p_requisition_guid,
    p_enterprise_id    => :p_enterprise_id,
    p_approved_by      => :p_approved_by,
    p_status           => :o_status,
    p_message          => :o_message
  );
END;`;

const OPEN_PLSQL = `
BEGIN
  ${OPEN_PROC}(
    p_requisition_guid => :p_requisition_guid,
    p_enterprise_id    => :p_enterprise_id,
    p_opened_by        => :p_opened_by,
    p_status           => :o_status,
    p_message          => :o_message
  );
END;`;

const CLOSE_PLSQL = `
BEGIN
  ${CLOSE_PROC}(
    p_requisition_guid => :p_requisition_guid,
    p_enterprise_id    => :p_enterprise_id,
    p_closed_by        => :p_closed_by,
    p_status           => :o_status,
    p_message          => :o_message
  );
END;`;

const HOLD_PLSQL = `
BEGIN
  ${HOLD_PROC}(
    p_requisition_guid => :p_requisition_guid,
    p_enterprise_id    => :p_enterprise_id,
    p_held_by          => :p_held_by,
    p_status           => :o_status,
    p_message          => :o_message
  );
END;`;

const REOPEN_PLSQL = `
BEGIN
  ${REOPEN_PROC}(
    p_requisition_guid => :p_requisition_guid,
    p_enterprise_id    => :p_enterprise_id,
    p_reopened_by      => :p_reopened_by,
    p_status           => :o_status,
    p_message          => :o_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    p_requisition_guid => :p_requisition_guid,
    p_enterprise_id    => :p_enterprise_id,
    p_status           => :o_status,
    p_message          => :o_message
  );
END;`;

const REJECT_PLSQL = `
BEGIN
  ${REJECT_PROC}(
    p_requisition_guid => :p_requisition_guid,
    p_enterprise_id    => :p_enterprise_id,
    p_rejected_by      => :p_rejected_by,
    p_rejection_reason => :p_rejection_reason,
    p_status           => :o_status,
    p_message          => :o_message
  );
END;`;

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ requisition_id: number|null, requisition_number: string|null, status: string, message: string }>}
 */
export async function createRequisitionViaPackage(body) {
  const b = applyRequisitionDefaults({ ...(body || {}) });
  const binds = {
    ...buildSharedInBinds(b),
    p_action: actionBind(resolveRequisitionAction(b.action)),
    p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    o_requisition_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    o_requisition_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    o_requisition_number: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
    o_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    o_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(CREATE_PLSQL, binds, { autoCommit: true })
    );
    return parsePackageOut(result?.outBinds);
  } catch (err) {
    console.error('[recRequisitionsModel] create_requisition failed:', err?.errorNum ?? '', '[redacted]');
    return packageErrorResult();
  }
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ requisition_id: number|null, requisition_number: string|null, status: string, message: string }>}
 */
export async function updateRequisitionViaPackage(body) {
  const b = applyRequisitionDefaults({ ...(body || {}) });
  const binds = {
    p_requisition_guid: {
      val: requiredRawBuffer(b.requisition_guid),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    ...buildSharedInBinds(b),
    p_action: actionBind(resolveRequisitionAction(b.action)),
    p_last_updated_by: {
      val: strOrNull(b.last_updated_by),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    o_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    o_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(UPDATE_PLSQL, binds, { autoCommit: true })
    );
    return parsePackageOut(result?.outBinds);
  } catch (err) {
    console.error('[recRequisitionsModel] update_requisition failed:', err?.errorNum ?? '', '[redacted]');
    return packageErrorResult();
  }
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 * @param {string} approvedBy
 */
export async function approveRequisitionViaPackage(requisitionGuidHex, enterpriseId, approvedBy) {
  return executeLifecycle(APPROVE_PLSQL, {
    p_requisition_guid: guidInBind(requisitionGuidHex),
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_approved_by: { val: strOrNull(approvedBy), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    o_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    o_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  });
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 * @param {string} openedBy
 */
export async function openRequisitionViaPackage(requisitionGuidHex, enterpriseId, openedBy) {
  return executeLifecycle(OPEN_PLSQL, {
    p_requisition_guid: guidInBind(requisitionGuidHex),
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_opened_by: { val: strOrNull(openedBy), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    o_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    o_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  });
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 * @param {string} closedBy
 */
export async function closeRequisitionViaPackage(requisitionGuidHex, enterpriseId, closedBy) {
  return executeLifecycle(CLOSE_PLSQL, {
    p_requisition_guid: guidInBind(requisitionGuidHex),
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_closed_by: { val: strOrNull(closedBy), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    o_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    o_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  });
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 * @param {string} heldBy
 */
export async function holdRequisitionViaPackage(requisitionGuidHex, enterpriseId, heldBy) {
  return executeLifecycle(HOLD_PLSQL, {
    p_requisition_guid: guidInBind(requisitionGuidHex),
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_held_by: { val: strOrNull(heldBy), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    o_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    o_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  });
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 * @param {string} reopenedBy
 */
export async function reopenRequisitionViaPackage(requisitionGuidHex, enterpriseId, reopenedBy) {
  return executeLifecycle(REOPEN_PLSQL, {
    p_requisition_guid: guidInBind(requisitionGuidHex),
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_reopened_by: { val: strOrNull(reopenedBy), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    o_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    o_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  });
}

/**
 * @param {string} requisitionGuidHex 32-char hex (no dashes)
 * @param {number} enterpriseId
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function deleteRequisitionViaPackage(requisitionGuidHex, enterpriseId) {
  const binds = {
    p_requisition_guid: guidInBind(requisitionGuidHex),
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    o_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    o_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(DELETE_PLSQL, binds, { autoCommit: true })
    );
    const parsed = parsePackageOut(result?.outBinds);
    return { status: parsed.status, message: parsed.message };
  } catch (err) {
    console.error('[recRequisitionsModel] delete_requisition failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_ERROR_MESSAGE };
  }
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 * @param {string} rejectedBy
 * @param {string|null|undefined} rejectionReason
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function rejectRequisitionViaPackage(
  requisitionGuidHex,
  enterpriseId,
  rejectedBy,
  rejectionReason
) {
  return executeLifecycle(REJECT_PLSQL, {
    p_requisition_guid: guidInBind(requisitionGuidHex),
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_rejected_by: { val: strOrNull(rejectedBy), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_rejection_reason: {
      val: strOrNull(rejectionReason),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    o_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    o_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  });
}
