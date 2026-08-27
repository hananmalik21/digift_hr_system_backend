import {
  normalizeGuidValue,
  normalizeYnFlag,
  rowKeyMap,
  safeFiniteNumber,
  strOrNull
} from '../../applications/utils/recApplicationRowUtils.js';
import { parseJsonColumn } from '../../shared/recViewJsonParse.js';
import { LOCATION_UNSPECIFIED_DISPLAY } from './recCandidateMatchConstants.js';

export { normalizeGuidValue, normalizeYnFlag, rowKeyMap, safeFiniteNumber, strOrNull };

/**
 * Date-only ISO (YYYY-MM-DD) without UTC day-shift.
 * @param {unknown} v
 * @returns {string|null}
 */
export function formatDateOnly(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

export function candidateInitials(firstName, lastName, candidateName) {
  const first = strOrNull(firstName);
  const last = strOrNull(lastName);
  const fromParts = [first?.charAt(0), last?.charAt(0)].filter(Boolean).join('').toUpperCase();
  if (fromParts) return fromParts;

  const name = strOrNull(candidateName);
  if (!name) return null;
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    return `${tokens[0].charAt(0)}${tokens[tokens.length - 1].charAt(0)}`.toUpperCase();
  }
  return tokens[0].slice(0, 2).toUpperCase();
}

function pick(m, ...keys) {
  for (const key of keys) {
    if (m[key] != null && m[key] !== '') return m[key];
  }
  return undefined;
}

function normalizeSkillItem(item) {
  if (item == null) return null;
  if (typeof item === 'string') {
    const skill_name = strOrNull(item);
    return skill_name ? { skill_id: null, skill_name } : null;
  }
  if (typeof item !== 'object' || Array.isArray(item)) return null;
  const row = rowKeyMap(item);
  const skill_name = strOrNull(
    pick(row, 'skill_name', 'name', 'skill', 'key_skill', 'meaning_en')
  );
  if (!skill_name) return null;
  return {
    skill_id: safeFiniteNumber(pick(row, 'skill_id', 'id')),
    skill_name
  };
}

export function mapSkills(parsedJson, keySkillsText) {
  if (Array.isArray(parsedJson) && parsedJson.length) {
    return parsedJson.map((item) => normalizeSkillItem(item)).filter(Boolean);
  }
  const text = strOrNull(keySkillsText);
  if (!text) return [];
  return text
    .split(/[,;\n|]/)
    .map((part) => normalizeSkillItem(part))
    .filter(Boolean);
}

export function mapTalentPool(m) {
  const talent_pool_id = safeFiniteNumber(m.talent_pool_id);
  const talent_pool_guid = normalizeGuidValue(m.talent_pool_guid);
  const name = strOrNull(m.talent_pool_name);
  const level = strOrNull(m.talent_pool_level);
  const displayFromView = strOrNull(m.talent_pool_display);
  if (talent_pool_id == null && !talent_pool_guid && !name && !level && !displayFromView) {
    return null;
  }
  let display = displayFromView;
  if (!display && name && level) display = `${name} - ${level}`;
  else if (!display) display = name || level;
  return {
    talent_pool_id,
    talent_pool_guid,
    name,
    level,
    display: display ?? null
  };
}

/**
 * @template T
 * @param {unknown} parsedJson
 * @param {(item: unknown) => T|null} normalizeItem
 * @returns {T[]}
 */
function mapJsonObjectArray(parsedJson, normalizeItem) {
  if (!Array.isArray(parsedJson) || !parsedJson.length) return [];
  return parsedJson.map((item) => normalizeItem(item)).filter(Boolean);
}

/** Prefer view count; fall back to parsed array length when the count column is null. */
function viewCountOrLength(rawCount, items) {
  return safeFiniteNumber(rawCount) ?? items.length;
}

function normalizeExperienceHistoryItem(item) {
  if (item == null || typeof item !== 'object' || Array.isArray(item)) return null;
  const row = rowKeyMap(item);
  return {
    experience_id: safeFiniteNumber(row.experience_id),
    experience_guid: normalizeGuidValue(row.experience_guid),
    company_name: strOrNull(row.company_name),
    job_title: strOrNull(row.job_title),
    location: strOrNull(row.location),
    start_date: formatDateOnly(row.start_date),
    end_date: formatDateOnly(row.end_date),
    current_job_flag: normalizeYnFlag(row.current_job_flag),
    description: strOrNull(row.description)
  };
}

function normalizeEducationHistoryItem(item) {
  if (item == null || typeof item !== 'object' || Array.isArray(item)) return null;
  const row = rowKeyMap(item);
  return {
    education_id: safeFiniteNumber(row.education_id),
    education_guid: normalizeGuidValue(row.education_guid),
    degree_name: strOrNull(row.degree_name),
    institution_name: strOrNull(row.institution_name),
    field_of_study: strOrNull(row.field_of_study),
    start_date: formatDateOnly(row.start_date),
    end_date: formatDateOnly(row.end_date),
    grade: strOrNull(row.grade),
    description: strOrNull(row.description)
  };
}

export function mapExperienceHistory(parsedJson) {
  return mapJsonObjectArray(parsedJson, normalizeExperienceHistoryItem);
}

export function mapEducationHistory(parsedJson) {
  return mapJsonObjectArray(parsedJson, normalizeEducationHistoryItem);
}

/**
 * Map one REC.V_REQUISITION_CANDIDATE_MATCH row.
 * Availability / match / display strings come directly from the view — no JS scoring.
 * @param {Record<string, unknown>} row
 */
export async function mapCandidateMatchRow(row) {
  const m = rowKeyMap(row);
  const [skillsJson, educationJson, experienceHistoryJson] = await Promise.all([
    parseJsonColumn(pick(m, 'skills_json', 'key_skills_json'), true),
    parseJsonColumn(m.education_json, true),
    parseJsonColumn(m.experience_history_json, true)
  ]);

  const experience_history = mapExperienceHistory(experienceHistoryJson);
  const education = mapEducationHistory(educationJson);
  const experience_history_count = viewCountOrLength(
    m.experience_history_count,
    experience_history
  );
  const education_count = viewCountOrLength(m.education_count, education);
  const candidate_name = strOrNull(m.candidate_name);
  const first_name = strOrNull(m.first_name);
  const last_name = strOrNull(m.last_name);
  const email = strOrNull(m.email);
  const phone = strOrNull(m.phone);
  const current_title = strOrNull(m.current_title);
  const current_employer = strOrNull(m.current_employer);
  const years_experience = safeFiniteNumber(m.years_experience);
  const experience_display = strOrNull(m.experience_display);
  const current_location = strOrNull(m.current_location);
  const location_display =
    strOrNull(m.location_display) ?? strOrNull(current_location) ?? LOCATION_UNSPECIFIED_DISPLAY;

  const match_score = safeFiniteNumber(m.match_score);
  const match_display = strOrNull(m.match_display);
  const match_level = strOrNull(m.match_level);
  const recommendation = strOrNull(m.recommendation_code);

  const notice_period = strOrNull(m.notice_period);
  const notice_period_days = safeFiniteNumber(m.notice_period_days);
  const estimated_available_date = formatDateOnly(
    pick(m, 'estimated_available_date_iso', 'estimated_available_date')
  );
  const availability_score = safeFiniteNumber(m.availability_score);
  const availability_code = strOrNull(m.availability_code);
  const availability_text = strOrNull(m.availability_text);

  // Application status from REC.V_REQUISITION_CANDIDATE_MATCH — do not invent flags in Node.
  const applied_flag = normalizeYnFlag(m.applied_flag);
  const application_status = strOrNull(m.application_status);
  const can_add_as_applicant = normalizeYnFlag(m.can_add_as_applicant);
  const application_count = safeFiniteNumber(m.application_count);
  const application_id = safeFiniteNumber(m.application_id);
  const application_guid = normalizeGuidValue(m.application_guid);
  const application_number = strOrNull(m.application_number);
  const application_stage_code = strOrNull(
    pick(m, 'application_stage_code', 'current_stage_code')
  );
  const application_status_code = strOrNull(m.application_status_code);
  const application_applied_date = formatDateOnly(
    pick(m, 'application_applied_date_iso', 'application_applied_date', 'applied_date')
  );
  const already_applied = applied_flag === 'Y';

  const title_score = safeFiniteNumber(m.title_match_score);
  const experience_score = safeFiniteNumber(m.experience_score);
  const relocation_score = safeFiniteNumber(m.relocation_score);

  const application = {
    applied_flag,
    application_status,
    can_add_as_applicant,
    application_count,
    application_id,
    application_guid,
    application_number,
    stage_code: application_stage_code,
    status_code: application_status_code,
    applied_date: application_applied_date
  };

  return {
    candidate_id: safeFiniteNumber(m.candidate_id),
    candidate_guid: normalizeGuidValue(m.candidate_guid),
    candidate_name,
    first_name,
    middle_name: strOrNull(m.middle_name),
    last_name,
    initials: candidateInitials(first_name, last_name, candidate_name),
    email,
    phone,
    contact: { email, phone },
    current_title,
    current_employer,
    candidate_subtitle: strOrNull(m.candidate_subtitle),
    years_experience,
    experience_display,
    experience: {
      years: years_experience,
      display: experience_display
    },
    current_location,
    location_display,
    location: {
      value: current_location,
      display: location_display
    },
    notice_period,
    notice_period_days,
    estimated_available_date,
    availability_score,
    availability_code,
    availability_text,
    availability: {
      score: availability_score,
      code: availability_code,
      notice_period_days,
      estimated_available_date,
      display: availability_text
    },
    match_score,
    match_display,
    match_level,
    recommendation_code: recommendation,
    match: {
      score: match_score,
      display: match_display,
      level: match_level,
      recommendation
    },
    title_match_score: title_score,
    title_match_type: strOrNull(m.title_match_type),
    experience_score,
    relocation_score,
    scores: {
      title: title_score,
      experience: experience_score,
      availability: availability_score,
      relocation: relocation_score
    },
    willing_to_relocate: normalizeYnFlag(m.willing_to_relocate),
    linkedin_profile: strOrNull(m.linkedin_profile),
    portfolio_link: strOrNull(m.portfolio_link),
    github_link: strOrNull(m.github_link),
    profiles: {
      linkedin: strOrNull(m.linkedin_profile),
      portfolio: strOrNull(m.portfolio_link),
      github: strOrNull(m.github_link)
    },
    profile_completeness_score: safeFiniteNumber(m.profile_completeness_score),
    skills: mapSkills(skillsJson, m.key_skills_text),
    talent_pool: mapTalentPool(m),
    experience_history_count,
    experience_history,
    education_count,
    education,
    application,
    // Flat fields for backward-compatible Flutter clients
    applied_flag,
    application_status,
    can_add_as_applicant,
    application_count,
    application_id,
    application_guid,
    application_number,
    application_stage_code,
    application_status_code,
    application_applied_date,
    already_applied
  };
}

export function mapRequisitionHeader(requisition, requisitionGuidHex) {
  return {
    requisition_guid: normalizeGuidValue(requisition?.requisition_guid) ?? requisitionGuidHex,
    requisition_number: strOrNull(requisition?.requisition_number),
    requisition_title: strOrNull(requisition?.requisition_title)
  };
}
