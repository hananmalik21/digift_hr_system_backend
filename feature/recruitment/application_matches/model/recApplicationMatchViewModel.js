import oracledb from 'oracledb';
import { hexToRawBuffer, normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import {
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { mapViewRowToDetail } from '../../requisitions/utils/recRequisitionViewMapper.js';
import { mapCandidateViewRow } from '../../candidates/utils/recCandidateViewMapper.js';
import { mapApplicationListRow } from '../../applications/utils/recApplicationMappers.js';
import {
  EDUCATION_LOOKUP_TYPES,
  EXPERIENCE_LOOKUP_TYPES,
  FNDSEC_WORK_LOCATIONS_VIEW,
  INACTIVE_APPLICATION_STATUS_CODES,
  LOG_TAG,
  READ_ERROR_MESSAGE,
  REC_APPLICATIONS_VIEW,
  REC_CANDIDATES_FULL_VIEW,
  REC_LOOKUP_VALUES_TABLE,
  REC_REQUISITION_LIST_VIEW
} from '../utils/recApplicationMatchConstants.js';

function guidBufferBind(hex) {
  return {
    val: hexToRawBuffer(hex),
    dir: oracledb.BIND_IN,
    type: oracledb.BUFFER,
    maxSize: 16
  };
}

function enterpriseBind(enterpriseId) {
  return { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
}

function guidEnterpriseBinds(guidHex, enterpriseId) {
  return {
    p_enterprise_id: enterpriseBind(enterpriseId),
    p_application_guid: guidBufferBind(guidHex)
  };
}

function requisitionGuidBinds(guidHex, enterpriseId) {
  return {
    p_enterprise_id: enterpriseBind(enterpriseId),
    p_requisition_guid: guidBufferBind(guidHex)
  };
}

function pickObj(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

function shapeRequisitionForScoring(detail, extras = {}) {
  const rd = detail?.requisition_detail || {};
  const ee = detail?.education_experience || {};
  const jf = detail?.job_family || {};
  const jl = detail?.job_level || {};
  const pos = detail?.position || detail?.position_detail || {};
  const budget = detail?.budget || {};

  return {
    requisition_id: detail?.requisition_id,
    requisition_guid: detail?.requisition_guid,
    requisition_number: detail?.requisition_number,
    requisition_title: detail?.requisition_title,
    position_name: pickObj(pos, 'position_name', 'position_name_en', 'name'),
    job_family_id: pickObj(jf, 'job_family_id'),
    job_family_name: pickObj(jf, 'job_family_name', 'job_family_name_en', 'name'),
    job_level_id: pickObj(jl, 'job_level_id'),
    job_level_name: pickObj(jl, 'level_name', 'job_level_name', 'name'),
    skills: detail?.skills || [],
    min_education_level_code:
      pickObj(ee, 'min_education_level_code') || pickObj(rd, 'min_education_level_code'),
    min_education_level_meaning: extras.education_meaning || null,
    experience_required_code:
      pickObj(ee, 'experience_required_code') || pickObj(rd, 'experience_required_code'),
    experience_required_meaning: extras.experience_meaning || null,
    preferred_field_of_study:
      pickObj(ee, 'preferred_field_of_study') || pickObj(rd, 'preferred_field_of_study'),
    required_certifications:
      pickObj(ee, 'required_certifications') || pickObj(rd, 'required_certifications'),
    minimum_qualifications: pickObj(ee, 'minimum_qualifications') || pickObj(rd, 'minimum_qualifications'),
    work_mode_code: pickObj(rd, 'work_mode_code'),
    target_start_date: pickObj(rd, 'target_start_date'),
    primary_location_id: pickObj(rd, 'primary_location_id'),
    location_name: extras.location_name || pickObj(rd, 'primary_location_name', 'location_name'),
    minimum_salary: pickObj(rd, 'minimum_salary') ?? pickObj(budget, 'minimum_salary'),
    maximum_salary: pickObj(rd, 'maximum_salary') ?? pickObj(budget, 'maximum_salary'),
    currency_code: pickObj(rd, 'currency_code') ?? pickObj(budget, 'currency_code'),
    relocation_prohibited: pickObj(rd, 'relocation_prohibited_flag', 'relocation_prohibited')
  };
}

function shapeCandidateForScoring(appRow, candRow) {
  return {
    candidate_id: candRow?.candidate_id ?? appRow?.candidate_id,
    candidate_guid: candRow?.candidate_guid ?? appRow?.candidate_guid,
    full_name: candRow?.full_name ?? appRow?.candidate_name,
    email: candRow?.email ?? appRow?.email,
    current_title: candRow?.current_title ?? appRow?.current_title,
    current_employer: candRow?.current_employer ?? appRow?.current_employer,
    years_experience: candRow?.years_experience ?? appRow?.years_experience,
    current_location: candRow?.current_location ?? appRow?.current_location,
    expected_salary: candRow?.expected_salary ?? appRow?.expected_salary,
    salary_currency: candRow?.salary_currency ?? appRow?.salary_currency,
    notice_period: candRow?.notice_period ?? appRow?.notice_period,
    willing_to_relocate: candRow?.willing_to_relocate ?? appRow?.willing_to_relocate,
    job_family_id: candRow?.job_family_id ?? null,
    job_level_id: candRow?.job_level_id ?? null,
    education: candRow?.education_json || [],
    experience: candRow?.experience_json || [],
    assessments: candRow?.assessments_json || []
  };
}

async function lookupMeaning(connection, enterpriseId, types, code) {
  if (!code) return null;
  const sql = `SELECT v.MEANING_EN, v.DESCRIPTION_EN
    FROM ${REC_LOOKUP_VALUES_TABLE} v
    WHERE UPPER(TRIM(v.LOOKUP_CODE)) = :p_code
      AND UPPER(TRIM(v.LOOKUP_TYPE)) IN (${types.map((_, i) => `:t${i}`).join(', ')})
      AND (v.ENTERPRISE_ID = :p_enterprise_id OR v.ENTERPRISE_ID IS NULL)
      AND (v.IS_ENABLED IS NULL OR v.IS_ENABLED = 'Y')
    ORDER BY CASE WHEN v.ENTERPRISE_ID = :p_enterprise_id THEN 0 ELSE 1 END
    FETCH FIRST 1 ROWS ONLY`;
  const binds = {
    p_code: { val: String(code).trim().toUpperCase(), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_enterprise_id: enterpriseBind(enterpriseId)
  };
  types.forEach((t, i) => {
    binds[`t${i}`] = { val: t, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 };
  });
  try {
    const r = await connection.execute(sql, binds, ROW_OPTS);
    const row = r.rows?.[0];
    if (!row) return null;
    return row.MEANING_EN || row.meaning_en || row.DESCRIPTION_EN || row.description_en || null;
  } catch {
    return null;
  }
}

async function lookupLocationName(connection, enterpriseId, locationGuidHex) {
  const normalized = locationGuidHex ? normalizeApiGuidString(locationGuidHex) : null;
  if (!normalized) return null;
  const sql = `SELECT v.LOCATION_NAME
    FROM ${FNDSEC_WORK_LOCATIONS_VIEW} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id
      AND v.WORK_LOCATION_GUID = :p_guid
    FETCH FIRST 1 ROWS ONLY`;
  try {
    const r = await connection.execute(
      sql,
      {
        p_enterprise_id: enterpriseBind(enterpriseId),
        p_guid: guidBufferBind(normalized)
      },
      ROW_OPTS
    );
    const row = r.rows?.[0];
    return row?.LOCATION_NAME || row?.location_name || null;
  } catch {
    return null;
  }
}

/** @param {string} requisitionGuidHex @param {number} enterpriseId */
export async function loadRequisitionScoringContext(requisitionGuidHex, enterpriseId) {
  const sql = `SELECT v.* FROM ${REC_REQUISITION_LIST_VIEW} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id AND v.REQUISITION_GUID = :p_requisition_guid
    FETCH FIRST 1 ROWS ONLY`;
  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(sql, requisitionGuidBinds(requisitionGuidHex, enterpriseId), ROW_OPTS);
      const row = r.rows?.[0];
      if (!row) return null;
      const detail = await mapViewRowToDetail(row);
      const shaped = shapeRequisitionForScoring(detail);
      const [experience_meaning, education_meaning, location_name] = await Promise.all([
        lookupMeaning(connection, enterpriseId, EXPERIENCE_LOOKUP_TYPES, shaped.experience_required_code),
        lookupMeaning(connection, enterpriseId, EDUCATION_LOOKUP_TYPES, shaped.min_education_level_code),
        lookupLocationName(connection, enterpriseId, shaped.primary_location_id)
      ]);
      return shapeRequisitionForScoring(detail, {
        experience_meaning,
        education_meaning,
        location_name: location_name || shaped.location_name
      });
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} loadRequisitionScoringContext`, READ_ERROR_MESSAGE);
  }
}

const APPLICATION_SOURCE_SQL = `
SELECT
  a.APPLICATION_ID,
  a.APPLICATION_GUID,
  a.APPLICATION_NUMBER,
  a.ENTERPRISE_ID,
  a.REQUISITION_ID,
  a.REQUISITION_GUID,
  a.REQUISITION_NUMBER,
  a.REQUISITION_TITLE,
  a.CANDIDATE_ID,
  a.CANDIDATE_GUID,
  a.CANDIDATE_NAME,
  a.FIRST_NAME,
  a.LAST_NAME,
  a.EMAIL,
  a.CURRENT_TITLE,
  a.CURRENT_EMPLOYER,
  a.YEARS_EXPERIENCE,
  a.CURRENT_LOCATION,
  a.EXPECTED_SALARY,
  a.SALARY_CURRENCY,
  a.NOTICE_PERIOD,
  a.WILLING_TO_RELOCATE,
  a.CURRENT_STAGE_CODE,
  a.STATUS_CODE,
  a.APPLIED_DATE,
  c.EDUCATION_JSON,
  c.EXPERIENCE_JSON,
  c.ASSESSMENTS_JSON
FROM ${REC_APPLICATIONS_VIEW} a
LEFT JOIN ${REC_CANDIDATES_FULL_VIEW} c
  ON c.ENTERPRISE_ID = a.ENTERPRISE_ID
 AND c.CANDIDATE_ID = a.CANDIDATE_ID`;

async function mapScoringSourceRow(row) {
  const app = mapApplicationListRow(row);
  const cand = await mapCandidateViewRow(row);
  return {
    application: {
      application_id: app.application_id,
      application_guid: app.application_guid,
      application_number: app.application_number,
      application_stage: app.current_stage_code,
      status_code: app.status_code,
      applied_date: app.applied_date,
      enterprise_id: app.enterprise_id,
      requisition_id: app.requisition_id,
      requisition_guid: app.requisition_guid,
      requisition_number: app.requisition_number,
      candidate_id: app.candidate_id,
      candidate_guid: app.candidate_guid
    },
    candidate: shapeCandidateForScoring(app, cand)
  };
}

/** @param {string} applicationGuidHex @param {number} enterpriseId */
export async function loadApplicationScoringSource(applicationGuidHex, enterpriseId) {
  const sql = `${APPLICATION_SOURCE_SQL}
    WHERE a.ENTERPRISE_ID = :p_enterprise_id AND a.APPLICATION_GUID = :p_application_guid
    FETCH FIRST 1 ROWS ONLY`;
  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        guidEnterpriseBinds(applicationGuidHex, enterpriseId),
        ROW_OPTS
      );
      const row = r.rows?.[0];
      return row ? mapScoringSourceRow(row) : null;
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} loadApplicationScoringSource`, READ_ERROR_MESSAGE);
  }
}

function activeApplicationSql() {
  const inactive = INACTIVE_APPLICATION_STATUS_CODES.map((c) => `'${c}'`).join(', ');
  return `(a.STATUS_CODE IS NULL OR a.STATUS_CODE NOT IN (${inactive}))`;
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 */
export async function loadApplicationScoringSourcesForRequisition(requisitionGuidHex, enterpriseId) {
  const sql = `${APPLICATION_SOURCE_SQL}
    WHERE a.ENTERPRISE_ID = :p_enterprise_id AND a.REQUISITION_GUID = :p_requisition_guid
      AND ${activeApplicationSql()}
    ORDER BY a.APPLIED_DATE ASC NULLS LAST, a.APPLICATION_ID`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        requisitionGuidBinds(requisitionGuidHex, enterpriseId),
        ROW_OPTS
      );
      return Promise.all((r.rows || []).map((row) => mapScoringSourceRow(row)));
    });
  } catch (err) {
    rethrowUnlessOperational(
      err,
      `${LOG_TAG} loadApplicationScoringSourcesForRequisition`,
      READ_ERROR_MESSAGE
    );
  }
}
