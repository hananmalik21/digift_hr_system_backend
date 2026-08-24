import {
  AVAILABILITY_CODES,
  COMPENSATION_SLIGHTLY_ABOVE_PCT,
  COMPENSATION_STATUS,
  EDUCATION_RANK_FALLBACKS,
  ELIGIBILITY_STATUS,
  EXPERIENCE_BAND_FALLBACKS,
  EXPERIENCE_STATUS,
  JOB_FAMILY_SUBWEIGHT,
  JOB_LEVEL_SUBWEIGHT,
  MATCH_LEVELS,
  MATCH_WEIGHTS,
  RECOMMENDATIONS,
  SKILLS_PREFERRED_WEIGHT,
  SKILLS_REQUIRED_WEIGHT,
  UNKNOWN_COMPONENT_SCORE
} from './recApplicationMatchConstants.js';
import {
  addDaysIso,
  clampScore,
  containsNormalized,
  jaroWinklerSimilarity,
  normalizeText,
  parseNoticePeriodDays,
  parseYearBandFromCode,
  parseYearBandFromText,
  round1,
  roundScore,
  skillNamesEquivalent,
  splitCertList,
  strOrEmpty,
  titleSimilarityScore,
  tokenize,
  yearsBetween
} from './recApplicationMatchTextUtils.js';

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ynTrue(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  return s === 'Y' || s === 'YES' || s === 'TRUE' || s === '1';
}

function pick(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
    const found = Object.keys(obj).find((x) => String(x).toLowerCase() === String(k).toLowerCase());
    if (found && obj[found] != null && obj[found] !== '') return obj[found];
  }
  return undefined;
}

export function matchLevelFromScore(score) {
  const n = roundScore(score);
  if (n >= 90) return MATCH_LEVELS.EXCEPTIONAL;
  if (n >= 80) return MATCH_LEVELS.STRONG;
  if (n >= 70) return MATCH_LEVELS.GOOD;
  if (n >= 60) return MATCH_LEVELS.PARTIAL;
  if (n >= 40) return MATCH_LEVELS.WEAK;
  return MATCH_LEVELS.POOR;
}

export function recommendationFromScore(score) {
  const n = roundScore(score);
  if (n >= 90) return RECOMMENDATIONS.PRIORITY_SHORTLIST;
  if (n >= 80) return RECOMMENDATIONS.SHORTLIST;
  if (n >= 70) return RECOMMENDATIONS.RECRUITER_REVIEW;
  if (n >= 60) return RECOMMENDATIONS.REVIEW;
  return RECOMMENDATIONS.LOW_PRIORITY;
}

function educationRankFromText(text) {
  const n = normalizeText(text).replace(/\s+/g, '_').toUpperCase();
  if (!n) return null;
  for (const [code, rank] of Object.entries(EDUCATION_RANK_FALLBACKS)) {
    if (n.includes(code)) return rank;
  }
  return null;
}

export function resolveExperienceBand(code, lookupMeaning) {
  const fromMeaning = parseYearBandFromText(lookupMeaning);
  if (fromMeaning) return fromMeaning;
  const key = strOrEmpty(code).toUpperCase().replace(/[\s-]+/g, '_');
  if (EXPERIENCE_BAND_FALLBACKS[key]) return { ...EXPERIENCE_BAND_FALLBACKS[key] };
  const fromCode = parseYearBandFromCode(code);
  if (fromCode) return fromCode;
  return parseYearBandFromText(code);
}

function isRequiredSkillFlag(raw) {
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  const s = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!s) return null;
  if (['Y', 'YES', 'TRUE', '1', 'REQUIRED', 'MUST_HAVE', 'MANDATORY'].includes(s)) return true;
  if (['N', 'NO', 'FALSE', '0', 'PREFERRED', 'NICE_TO_HAVE', 'OPTIONAL'].includes(s)) return false;
  return null;
}

/**
 * Normalize requisition skills_json entries.
 * Supports strings and objects with skill_name / required_flag / years / proficiency.
 */
export function normalizeRequisitionSkills(skillsJson) {
  const items = asArray(skillsJson);
  const out = [];
  for (const item of items) {
    if (item == null || item === '') continue;
    if (typeof item === 'string' || typeof item === 'number') {
      const name = String(item).trim();
      if (name) out.push({ name, required: true, years: null, proficiency: null });
      continue;
    }
    if (typeof item !== 'object') continue;
    const name = strOrEmpty(
      pick(item, 'skill_name', 'skill', 'name', 'skill_code', 'code', 'label')
    );
    if (!name) continue;
    const typeRaw = pick(item, 'skill_type', 'type', 'requirement_type');
    let required = isRequiredSkillFlag(pick(item, 'required_flag', 'required', 'mandatory', 'is_required'));
    if (required == null && typeRaw != null) {
      required = isRequiredSkillFlag(typeRaw);
    }
    if (required == null) required = true;
    out.push({
      name,
      required,
      years: numOrNull(pick(item, 'years', 'years_experience', 'min_years', 'experience_years')),
      proficiency: strOrEmpty(pick(item, 'proficiency', 'proficiency_code', 'level')) || null
    });
  }
  return out;
}

function candidateSkillEvidence(candidate) {
  const structured = [];
  const blobs = [];

  for (const a of asArray(candidate.assessments)) {
    const skills = a?.skills_json ?? a?.skills ?? [];
    for (const s of asArray(skills)) {
      const name = typeof s === 'string' ? s.trim() : strOrEmpty(pick(s, 'skill_name', 'skill', 'name'));
      if (!name) continue;
      structured.push({
        name,
        years: numOrNull(pick(s, 'years', 'years_experience')),
        proficiency: strOrEmpty(pick(s, 'proficiency', 'proficiency_code')) || null,
        source: 'assessment'
      });
    }
  }

  for (const exp of asArray(candidate.experience)) {
    const title = strOrEmpty(pick(exp, 'job_title', 'title'));
    const desc = strOrEmpty(pick(exp, 'description'));
    const years = yearsBetween(
      pick(exp, 'start_date'),
      pick(exp, 'end_date'),
      pick(exp, 'current_job_flag')
    );
    if (title) blobs.push({ text: title, years, source: 'experience_title' });
    if (desc) blobs.push({ text: desc, years, source: 'experience_description' });
  }

  for (const edu of asArray(candidate.education)) {
    const field = strOrEmpty(pick(edu, 'field_of_study', 'degree_name', 'description'));
    if (field) blobs.push({ text: field, years: null, source: 'education' });
  }

  if (candidate.current_title) {
    blobs.push({ text: candidate.current_title, years: candidate.years_experience, source: 'current_title' });
  }

  return { structured, blobs, hasStructured: structured.length > 0, hasAny: structured.length > 0 || blobs.length > 0 };
}

function findCandidateSkill(reqSkill, evidence) {
  const structuredHit = evidence.structured.find((s) => skillNamesEquivalent(s.name, reqSkill.name));
  if (structuredHit) {
    let quality = 100;
    if (reqSkill.years != null && structuredHit.years != null) {
      if (structuredHit.years + 0.01 < reqSkill.years) {
        quality = clampScore((structuredHit.years / reqSkill.years) * 100);
      }
    }
    return { matched: true, name: reqSkill.name, quality, source: structuredHit.source };
  }

  if (evidence.hasStructured) {
    return { matched: false, name: reqSkill.name, quality: 0, source: null };
  }

  const blobHit = evidence.blobs.find((b) => containsNormalized(b.text, reqSkill.name));
  if (blobHit) {
    return { matched: true, name: reqSkill.name, quality: 80, source: blobHit.source };
  }
  return { matched: false, name: reqSkill.name, quality: 0, source: null };
}

export function scoreSkills(requisitionSkills, candidate) {
  const required = requisitionSkills.filter((s) => s.required);
  const preferred = requisitionSkills.filter((s) => !s.required);
  const evidence = candidateSkillEvidence(candidate);

  if (!requisitionSkills.length) {
    return {
      raw_score: UNKNOWN_COMPONENT_SCORE,
      unknown: true,
      matched_skills: [],
      missing_required_skills: [],
      matched_preferred_skills: [],
      required_total: 0,
      required_matched: 0
    };
  }

  if (!evidence.hasAny) {
    return {
      raw_score: UNKNOWN_COMPONENT_SCORE,
      unknown: true,
      matched_skills: [],
      missing_required_skills: [],
      matched_preferred_skills: [],
      required_total: required.length,
      required_matched: 0,
      missing_data: 'Candidate skill profile'
    };
  }

  const requiredHits = required.map((s) => findCandidateSkill(s, evidence));
  const preferredHits = preferred.map((s) => findCandidateSkill(s, evidence));

  const requiredScore = required.length
    ? requiredHits.reduce((sum, h) => sum + h.quality, 0) / required.length
    : 100;
  const preferredScore = preferred.length
    ? preferredHits.reduce((sum, h) => sum + h.quality, 0) / preferred.length
    : 100;

  let raw;
  if (required.length && preferred.length) {
    raw = requiredScore * SKILLS_REQUIRED_WEIGHT + preferredScore * SKILLS_PREFERRED_WEIGHT;
  } else if (required.length) {
    raw = requiredScore;
  } else {
    raw = preferredScore;
  }

  return {
    raw_score: roundScore(raw),
    unknown: false,
    matched_skills: requiredHits.filter((h) => h.matched).map((h) => h.name),
    missing_required_skills: requiredHits.filter((h) => !h.matched).map((h) => h.name),
    matched_preferred_skills: preferredHits.filter((h) => h.matched).map((h) => h.name),
    required_total: required.length,
    required_matched: requiredHits.filter((h) => h.matched).length
  };
}

function relevantExperienceYears(candidate, requisitionTitle, requiredSkills) {
  let relevant = 0;
  for (const exp of asArray(candidate.experience)) {
    const title = strOrEmpty(pick(exp, 'job_title', 'title'));
    const desc = strOrEmpty(pick(exp, 'description'));
    const years = yearsBetween(
      pick(exp, 'start_date'),
      pick(exp, 'end_date'),
      pick(exp, 'current_job_flag')
    );
    if (years == null || years <= 0) continue;
    const titleScore = titleSimilarityScore(title, requisitionTitle);
    const skillHit = requiredSkills.some(
      (s) => containsNormalized(title, s.name) || containsNormalized(desc, s.name)
    );
    if ((titleScore != null && titleScore >= 70) || skillHit) {
      relevant += years;
    }
  }
  return relevant > 0 ? Math.round(relevant * 10) / 10 : null;
}

export function scoreExperience(candidateYears, relevantYears, band) {
  const years = relevantYears != null ? relevantYears : candidateYears;
  if (!band) {
    if (years == null) {
      return {
        raw_score: UNKNOWN_COMPONENT_SCORE,
        unknown: true,
        experience_status: EXPERIENCE_STATUS.UNKNOWN,
        candidate_years_experience: candidateYears,
        required_experience: null
      };
    }
    return {
      raw_score: years > 0 ? 80 : 20,
      unknown: false,
      experience_status: years > 0 ? EXPERIENCE_STATUS.MEETS_REQUIREMENT : EXPERIENCE_STATUS.NO_EXPERIENCE,
      candidate_years_experience: candidateYears,
      required_experience: null
    };
  }

  const label = band.label || (band.max != null ? `${band.min}–${band.max} years` : `${band.min}+ years`);
  if (years == null) {
    return {
      raw_score: UNKNOWN_COMPONENT_SCORE,
      unknown: true,
      experience_status: EXPERIENCE_STATUS.UNKNOWN,
      candidate_years_experience: candidateYears,
      required_experience: label
    };
  }

  const min = band.min ?? 0;
  const max = band.max;
  let raw;
  let status;

  if (years <= 0) {
    raw = 0;
    status = EXPERIENCE_STATUS.NO_EXPERIENCE;
  } else if (years >= min && (max == null || years <= max)) {
    raw = 90;
    if (max != null && years >= min + (max - min) * 0.5) raw = 95;
    if (max != null && years === max) raw = 100;
    status = EXPERIENCE_STATUS.MEETS_REQUIREMENT;
  } else if (max != null && years > max) {
    const over = years - max;
    if (over <= 2) {
      raw = 88;
      status = EXPERIENCE_STATUS.EXCEEDS_REQUIREMENT;
    } else if (over <= max) {
      raw = 80;
      status = EXPERIENCE_STATUS.EXCEEDS_REQUIREMENT;
    } else {
      raw = 75;
      status = EXPERIENCE_STATUS.EXCEEDS_REQUIREMENT;
    }
  } else if (years >= min * 0.7 || years >= min - 1) {
    raw = 75;
    status = EXPERIENCE_STATUS.SLIGHTLY_BELOW;
  } else if (years >= min * 0.4) {
    raw = 50;
    status = EXPERIENCE_STATUS.BELOW_REQUIREMENT;
  } else {
    raw = 20;
    status = EXPERIENCE_STATUS.BELOW_REQUIREMENT;
  }

  return {
    raw_score: roundScore(raw),
    unknown: false,
    experience_status: status,
    candidate_years_experience: candidateYears,
    relevant_years: relevantYears,
    required_experience: label
  };
}

function bestEducationRank(education) {
  let best = null;
  for (const edu of asArray(education)) {
    const rank = educationRankFromText(
      [pick(edu, 'degree_name'), pick(edu, 'field_of_study')].filter(Boolean).join(' ')
    );
    if (rank != null && (best == null || rank > best)) best = rank;
  }
  return best;
}

function fieldOfStudyMatches(education, preferredField) {
  const wanted = strOrEmpty(preferredField);
  if (!wanted) return null;
  for (const edu of asArray(education)) {
    const field = strOrEmpty(pick(edu, 'field_of_study', 'degree_name', 'description'));
    if (!field) continue;
    if (containsNormalized(field, wanted) || jaroWinklerSimilarity(field, wanted) >= 86) {
      return true;
    }
    const wt = new Set(tokenize(wanted));
    const ft = new Set(tokenize(field));
    let hit = 0;
    for (const t of wt) {
      if (ft.has(t) && t.length > 2) hit += 1;
    }
    if (wt.size && hit / wt.size >= 0.5) return true;
  }
  return asArray(education).length ? false : null;
}

function certificationMet(certName, candidate) {
  const blobs = [];
  for (const edu of asArray(candidate.education)) {
    blobs.push(pick(edu, 'degree_name'), pick(edu, 'description'), pick(edu, 'field_of_study'));
  }
  for (const exp of asArray(candidate.experience)) {
    blobs.push(pick(exp, 'description'), pick(exp, 'job_title'));
  }
  for (const a of asArray(candidate.assessments)) {
    blobs.push(pick(a, 'assessment_type'), pick(a, 'instructions'));
    for (const s of asArray(a?.skills_json ?? a?.skills)) {
      blobs.push(typeof s === 'string' ? s : pick(s, 'skill_name', 'name'));
    }
  }
  return blobs.some((b) => containsNormalized(b, certName));
}

function evidenceOfAnyText(candidate) {
  return (
    asArray(candidate.education).length > 0 ||
    asArray(candidate.experience).length > 0 ||
    asArray(candidate.assessments).length > 0
  );
}

export function scoreQualification(candidate, req) {
  const minLevelCode = strOrEmpty(req.min_education_level_code);
  const minRank =
    educationRankFromText(minLevelCode) ?? educationRankFromText(req.min_education_level_meaning);
  const preferredField = strOrEmpty(req.preferred_field_of_study);
  const certs = splitCertList(req.required_certifications);
  const hasEducation = asArray(candidate.education).length > 0;
  const candRank = bestEducationRank(candidate.education);
  const fieldMatch = fieldOfStudyMatches(candidate.education, preferredField);

  const missing = [];
  let raw = 100;
  let educationMet = null;
  let certMet = certs.length ? true : null;
  let failedCerts = [];

  if (minRank != null) {
    if (!hasEducation) {
      missing.push('Candidate education');
      educationMet = null;
      raw -= 25;
    } else if (candRank == null) {
      missing.push('Candidate education level');
      educationMet = null;
      raw -= 15;
    } else if (candRank >= minRank) {
      educationMet = true;
    } else {
      educationMet = false;
      raw -= 40;
    }
  }

  if (preferredField) {
    if (fieldMatch === true) {
      raw = Math.min(100, raw + 5);
    } else if (fieldMatch === false) {
      raw -= 15;
    } else if (!hasEducation) {
      if (!missing.includes('Candidate education')) missing.push('Candidate education');
      raw -= 10;
    }
  }

  if (certs.length) {
    failedCerts = certs.filter((cert) => !certificationMet(cert, candidate));
    if (failedCerts.length) {
      certMet = false;
      if (!hasEducation && !evidenceOfAnyText(candidate)) {
        missing.push('Candidate certifications');
        certMet = null;
        raw -= 15;
      } else {
        raw -= Math.min(40, failedCerts.length * 20);
      }
    } else {
      certMet = true;
    }
  }

  if (!minRank && !preferredField && !certs.length) {
    return {
      raw_score: UNKNOWN_COMPONENT_SCORE,
      unknown: true,
      education_requirement_met: null,
      field_of_study_match: null,
      certification_requirement_met: null,
      missing_data: [],
      failed_certs: []
    };
  }

  const unknown = educationMet === null && minRank != null && !hasEducation;
  return {
    raw_score: roundScore(raw),
    unknown,
    education_requirement_met: educationMet,
    field_of_study_match: fieldMatch,
    certification_requirement_met: certMet,
    missing_data: missing,
    failed_certs: certMet === false ? failedCerts : []
  };
}

export function scoreTitle(candidateTitles, requisitionTitle, positionName) {
  const reqTitle = strOrEmpty(requisitionTitle) || strOrEmpty(positionName);
  const titles = asArray(candidateTitles).map(strOrEmpty).filter(Boolean);
  if (!reqTitle) {
    return { raw_score: UNKNOWN_COMPONENT_SCORE, unknown: true, best_title: titles[0] || null };
  }
  if (!titles.length) {
    return { raw_score: UNKNOWN_COMPONENT_SCORE, unknown: true, best_title: null };
  }
  let best = 0;
  let bestTitle = titles[0];
  for (const t of titles) {
    const s = titleSimilarityScore(t, reqTitle);
    if (s != null && s > best) {
      best = s;
      bestTitle = t;
    }
  }
  return { raw_score: roundScore(best), unknown: false, best_title: bestTitle };
}

export function scoreJobFamilyLevel(candidate, requisition) {
  const reqFamilyId = numOrNull(requisition.job_family_id);
  const reqLevelId = numOrNull(requisition.job_level_id);
  const reqFamilyName = strOrEmpty(requisition.job_family_name);
  const reqLevelName = strOrEmpty(requisition.job_level_name);
  const candFamilyId = numOrNull(candidate.job_family_id);
  const candLevelId = numOrNull(candidate.job_level_id);

  const missing = [];
  let familyScore = UNKNOWN_COMPONENT_SCORE;
  let levelScore = UNKNOWN_COMPONENT_SCORE;
  let familyMatch = null;
  let levelMatch = null;
  let familyUnknown = true;
  let levelUnknown = true;

  if (reqFamilyId != null || reqFamilyName) {
    if (candFamilyId != null && reqFamilyId != null) {
      familyMatch = candFamilyId === reqFamilyId;
      familyScore = familyMatch ? 100 : 35;
      familyUnknown = false;
    } else if (reqFamilyName && candidate.current_title) {
      const sim = titleSimilarityScore(candidate.current_title, reqFamilyName);
      familyScore = sim == null ? UNKNOWN_COMPONENT_SCORE : sim;
      familyMatch = familyScore >= 70;
      familyUnknown = sim == null;
    } else {
      missing.push('Candidate job family');
    }
  }

  if (reqLevelId != null || reqLevelName) {
    if (candLevelId != null && reqLevelId != null) {
      levelMatch = candLevelId === reqLevelId;
      levelScore = levelMatch ? 100 : 55;
      levelUnknown = false;
    } else {
      missing.push('Candidate job level');
    }
  }

  if (reqFamilyId == null && !reqFamilyName && reqLevelId == null && !reqLevelName) {
    return {
      raw_score: UNKNOWN_COMPONENT_SCORE,
      unknown: true,
      job_family_score: UNKNOWN_COMPONENT_SCORE,
      job_level_score: UNKNOWN_COMPONENT_SCORE,
      job_family_match: null,
      job_level_match: null,
      missing_data: []
    };
  }

  const raw = familyScore * JOB_FAMILY_SUBWEIGHT + levelScore * JOB_LEVEL_SUBWEIGHT;
  return {
    raw_score: roundScore(raw),
    unknown: familyUnknown && levelUnknown,
    job_family_score: roundScore(familyScore),
    job_level_score: roundScore(levelScore),
    job_family_match: familyMatch,
    job_level_match: levelMatch,
    missing_data: missing
  };
}

export function scoreScreening(screening) {
  const questions = asArray(screening?.questions);
  const answers = asArray(screening?.answers);
  if (!questions.length && !answers.length) {
    return {
      raw_score: UNKNOWN_COMPONENT_SCORE,
      unknown: true,
      knockout_failed: false,
      failed_screening_questions: [],
      missing_data: 'Application screening responses'
    };
  }

  const answerByQuestion = new Map();
  for (const a of answers) {
    const id = pick(a, 'question_id', 'question_guid', 'question_code');
    if (id != null) answerByQuestion.set(String(id), a);
  }

  const failed = [];
  let knockoutFailed = false;
  let scored = 0;
  let points = 0;

  for (const q of questions) {
    const id = pick(q, 'question_id', 'question_guid', 'question_code');
    const ans = (id != null ? answerByQuestion.get(String(id)) : null) || q.answer;
    const knockout = ynTrue(pick(q, 'knockout_flag', 'knockout', 'mandatory_flag'));
    const expected = pick(q, 'expected_answer', 'correct_answer', 'required_value');
    const value = pick(ans, 'answer_value', 'answer_text', 'value') ?? ans;
    scored += 1;
    const ok =
      expected == null ||
      expected === '' ||
      ynTrue(pick(ans, 'passed_flag', 'is_correct')) ||
      (value != null && normalizeText(value) === normalizeText(expected));
    if (ok) {
      points += 100;
    } else {
      const label = strOrEmpty(pick(q, 'question_text', 'question', 'question_code')) || String(id ?? 'question');
      failed.push(label);
      if (knockout) knockoutFailed = true;
    }
  }

  const raw = scored ? points / scored : UNKNOWN_COMPONENT_SCORE;
  return {
    raw_score: roundScore(raw),
    unknown: false,
    knockout_failed: knockoutFailed,
    failed_screening_questions: failed,
    missing_data: null
  };
}

/**
 * Map notice-period days to availability code/display (same vocabulary as
 * REC.V_REQUISITION_CANDIDATE_MATCH). Score boosts for target-start fit do not change the code.
 * @param {number|null} days
 * @returns {{ code: string, display: string }}
 */
export function availabilityCodeFromDays(days) {
  if (days == null || !Number.isFinite(days)) {
    return { code: AVAILABILITY_CODES.UNKNOWN, display: 'Availability unknown' };
  }
  if (days <= 0) {
    return { code: AVAILABILITY_CODES.IMMEDIATE, display: 'Immediate' };
  }
  if (days <= 15) {
    return { code: AVAILABILITY_CODES.WITHIN_2_WEEKS, display: 'Available in 2 weeks' };
  }
  if (days <= 30) {
    return { code: AVAILABILITY_CODES.WITHIN_1_MONTH, display: 'Available in 1 month' };
  }
  if (days <= 60) {
    return { code: AVAILABILITY_CODES.WITHIN_2_MONTHS, display: 'Available in 2 months' };
  }
  if (days <= 90) {
    return { code: AVAILABILITY_CODES.WITHIN_3_MONTHS, display: 'Available in 3 months' };
  }
  return {
    code: AVAILABILITY_CODES.MORE_THAN_3_MONTHS,
    display: 'Available in more than 3 months'
  };
}

export function scoreAvailability(noticePeriodRaw, targetStartDate, now = new Date()) {
  const days = parseNoticePeriodDays(noticePeriodRaw);
  const estimated = days == null ? null : addDaysIso(now, days);
  const { code, display } = availabilityCodeFromDays(days);
  let raw;
  if (days == null) {
    raw = UNKNOWN_COMPONENT_SCORE;
  } else if (days <= 0) {
    raw = 100;
  } else if (days <= 15) {
    raw = 90;
  } else if (days <= 30) {
    raw = 80;
  } else if (days <= 60) {
    raw = 60;
  } else if (days <= 90) {
    raw = 40;
  } else {
    raw = 20;
  }

  const target = targetStartDate ? new Date(targetStartDate) : null;
  const targetValid = target && Number.isFinite(target.getTime());
  const targetInFuture = targetValid && target.getTime() > now.getTime();
  if (targetInFuture && estimated && days != null) {
    const available = new Date(estimated);
    if (available.getTime() <= target.getTime()) {
      raw = Math.max(raw, 90);
    }
  }

  return {
    raw_score: roundScore(raw),
    score: roundScore(raw),
    code,
    display,
    unknown: days == null,
    notice_period_days: days,
    estimated_available_date: estimated
  };
}

export function scoreLocation(candidate, requisition) {
  const workMode = strOrEmpty(requisition.work_mode_code).toUpperCase();
  const reqLocation = strOrEmpty(requisition.location_name);
  const candLocation = strOrEmpty(candidate.current_location);
  const willing = ynTrue(candidate.willing_to_relocate);
  const locationMatch =
    reqLocation && candLocation
      ? normalizeText(candLocation) === normalizeText(reqLocation) ||
        containsNormalized(candLocation, reqLocation) ||
        containsNormalized(reqLocation, candLocation) ||
        jaroWinklerSimilarity(candLocation, reqLocation) >= 90
      : null;

  if (workMode === 'REMOTE') {
    return {
      raw_score: 100,
      unknown: false,
      location_match: locationMatch === true,
      relocation_required: false,
      willing_to_relocate: willing
    };
  }

  if (locationMatch === true) {
    return {
      raw_score: 100,
      unknown: false,
      location_match: true,
      relocation_required: false,
      willing_to_relocate: willing
    };
  }

  if (!reqLocation && !workMode) {
    return {
      raw_score: UNKNOWN_COMPONENT_SCORE,
      unknown: true,
      location_match: null,
      relocation_required: false,
      willing_to_relocate: willing,
      missing_data: 'Requisition location'
    };
  }

  if (!candLocation) {
    return {
      raw_score: UNKNOWN_COMPONENT_SCORE,
      unknown: true,
      location_match: false,
      relocation_required: workMode === 'ONSITE',
      willing_to_relocate: willing,
      missing_data: 'Candidate current location'
    };
  }

  if (willing) {
    const raw = workMode === 'ONSITE' ? 80 : 88;
    return {
      raw_score: raw,
      unknown: false,
      location_match: false,
      relocation_required: true,
      willing_to_relocate: true
    };
  }

  if (workMode === 'HYBRID') {
    return {
      raw_score: 55,
      unknown: false,
      location_match: false,
      relocation_required: true,
      willing_to_relocate: false
    };
  }

  return {
    raw_score: 30,
    unknown: false,
    location_match: false,
    relocation_required: true,
    willing_to_relocate: false
  };
}

export function scoreCompensation(candidate, requisition) {
  const expected = numOrNull(candidate.expected_salary);
  const candCcy = strOrEmpty(candidate.salary_currency).toUpperCase();
  const min = numOrNull(requisition.minimum_salary);
  const max = numOrNull(requisition.maximum_salary);
  const reqCcy = strOrEmpty(requisition.currency_code).toUpperCase();

  if (expected == null || (min == null && max == null)) {
    return {
      raw_score: UNKNOWN_COMPONENT_SCORE,
      unknown: true,
      compensation_status: COMPENSATION_STATUS.UNKNOWN
    };
  }

  if (candCcy && reqCcy && candCcy !== reqCcy) {
    return {
      raw_score: UNKNOWN_COMPONENT_SCORE,
      unknown: true,
      compensation_status: COMPENSATION_STATUS.NOT_COMPARABLE
    };
  }
  if ((candCcy && !reqCcy) || (!candCcy && reqCcy)) {
    return {
      raw_score: UNKNOWN_COMPONENT_SCORE,
      unknown: true,
      compensation_status: COMPENSATION_STATUS.NOT_COMPARABLE
    };
  }

  const lo = min ?? 0;
  const hi = max ?? min;
  if (expected >= lo && expected <= hi) {
    return { raw_score: 100, unknown: false, compensation_status: COMPENSATION_STATUS.WITHIN_RANGE };
  }
  if (expected < lo) {
    return { raw_score: 85, unknown: false, compensation_status: COMPENSATION_STATUS.BELOW_RANGE };
  }
  const ceiling = hi ?? lo;
  if (expected <= ceiling * (1 + COMPENSATION_SLIGHTLY_ABOVE_PCT)) {
    return { raw_score: 70, unknown: false, compensation_status: COMPENSATION_STATUS.SLIGHTLY_ABOVE };
  }
  return { raw_score: 40, unknown: false, compensation_status: COMPENSATION_STATUS.ABOVE_RANGE };
}

function profileCompleteness(candidate) {
  const fields = [
    candidate.full_name || candidate.current_title,
    candidate.email,
    candidate.current_title,
    candidate.current_employer,
    candidate.years_experience,
    candidate.current_location,
    candidate.expected_salary,
    candidate.notice_period,
    asArray(candidate.education).length ? 'y' : null,
    asArray(candidate.experience).length ? 'y' : null,
    asArray(candidate.assessments).some((a) => asArray(a.skills_json ?? a.skills).length) ? 'y' : null
  ];
  const filled = fields.filter((v) => v != null && v !== '').length;
  return roundScore((filled / fields.length) * 100);
}

function buildBreakdown(rawScores) {
  return [
    ['SKILLS', MATCH_WEIGHTS.SKILLS, rawScores.skills],
    ['EXPERIENCE', MATCH_WEIGHTS.EXPERIENCE, rawScores.experience],
    ['QUALIFICATION', MATCH_WEIGHTS.QUALIFICATION, rawScores.qualification],
    ['TITLE', MATCH_WEIGHTS.TITLE, rawScores.title],
    ['JOB_FAMILY_LEVEL', MATCH_WEIGHTS.JOB_FAMILY_LEVEL, rawScores.job_family_level],
    ['SCREENING', MATCH_WEIGHTS.SCREENING, rawScores.screening],
    ['AVAILABILITY', MATCH_WEIGHTS.AVAILABILITY, rawScores.availability],
    ['LOCATION', MATCH_WEIGHTS.LOCATION, rawScores.location],
    ['COMPENSATION', MATCH_WEIGHTS.COMPENSATION, rawScores.compensation]
  ].map(([criterion, weight, raw]) => ({
    criterion,
    weight,
    raw_score: roundScore(raw),
    weighted_score: round1((roundScore(raw) * weight) / 100)
  }));
}

function resolveEligibility({ knockoutFailed, mandatoryFailures, insufficientMandatory }) {
  if (knockoutFailed) return ELIGIBILITY_STATUS.KNOCKOUT_FAILED;
  if (mandatoryFailures.length) return ELIGIBILITY_STATUS.MANDATORY_REQUIREMENT_FAILED;
  if (insufficientMandatory.length) return ELIGIBILITY_STATUS.INSUFFICIENT_DATA;
  return ELIGIBILITY_STATUS.ELIGIBLE;
}

/**
 * Deterministic application match. Does not call an LLM.
 *
 * @param {{
 *   candidate: object,
 *   requisition: object,
 *   application?: object,
 *   screening?: object,
 *   now?: Date
 * }} input
 */
export function calculateApplicationMatch(input) {
  const candidate = input.candidate || {};
  const requisition = input.requisition || {};
  const application = input.application || {};
  const now = input.now || new Date();

  const reqSkills = normalizeRequisitionSkills(requisition.skills);
  const skills = scoreSkills(reqSkills, candidate);
  const band = resolveExperienceBand(
    requisition.experience_required_code,
    requisition.experience_required_meaning
  );
  const relevantYears = relevantExperienceYears(candidate, requisition.requisition_title, reqSkills);
  const experience = scoreExperience(numOrNull(candidate.years_experience), relevantYears, band);
  const qualification = scoreQualification(candidate, requisition);

  const previousTitles = asArray(candidate.experience)
    .map((e) => pick(e, 'job_title', 'title'))
    .filter(Boolean);
  const title = scoreTitle(
    [candidate.current_title, ...previousTitles],
    requisition.requisition_title,
    requisition.position_name
  );
  const family = scoreJobFamilyLevel(candidate, requisition);
  const screening = scoreScreening(input.screening);
  const availability = scoreAvailability(candidate.notice_period, requisition.target_start_date, now);
  const location = scoreLocation(candidate, requisition);
  const compensation = scoreCompensation(candidate, requisition);

  const rawScores = {
    skills: skills.raw_score,
    experience: experience.raw_score,
    qualification: qualification.raw_score,
    title: title.raw_score,
    job_family_level: family.raw_score,
    screening: screening.raw_score,
    availability: availability.raw_score,
    location: location.raw_score,
    compensation: compensation.raw_score
  };

  const breakdown = buildBreakdown(rawScores);
  const weightedTotal = breakdown.reduce((sum, b) => sum + b.weighted_score, 0);
  const match_score = roundScore(weightedTotal);
  const match_level = matchLevelFromScore(match_score);
  const recommendation = recommendationFromScore(match_score);

  const missing_data = [];
  if (skills.missing_data) missing_data.push(skills.missing_data);
  if (experience.unknown && band) missing_data.push('Candidate years of experience');
  for (const m of qualification.missing_data || []) missing_data.push(m);
  if (title.unknown) missing_data.push('Candidate job title');
  for (const m of family.missing_data || []) missing_data.push(m);
  if (screening.missing_data) missing_data.push(screening.missing_data);
  if (availability.unknown) missing_data.push('Candidate notice period');
  if (location.missing_data) missing_data.push(location.missing_data);
  if (compensation.compensation_status === COMPENSATION_STATUS.UNKNOWN) {
    missing_data.push('Candidate expected salary');
  }

  const mandatoryFailures = [];
  const insufficientMandatory = [];

  if (qualification.education_requirement_met === false && requisition.min_education_level_code) {
    mandatoryFailures.push({
      type: 'EDUCATION',
      requirement: requisition.min_education_level_code,
      candidate_value: asArray(candidate.education)[0]?.degree_name ?? null
    });
  } else if (qualification.education_requirement_met == null && requisition.min_education_level_code) {
    insufficientMandatory.push('EDUCATION');
  }

  if (qualification.certification_requirement_met === false) {
    for (const cert of qualification.failed_certs || []) {
      mandatoryFailures.push({
        type: 'CERTIFICATION',
        requirement: cert,
        candidate_value: null
      });
    }
  } else if (qualification.certification_requirement_met == null && splitCertList(requisition.required_certifications).length) {
    insufficientMandatory.push('CERTIFICATION');
  }

  if (
    location.relocation_required &&
    location.willing_to_relocate === false &&
    strOrEmpty(requisition.work_mode_code).toUpperCase() === 'ONSITE' &&
    ynTrue(requisition.relocation_prohibited)
  ) {
    mandatoryFailures.push({
      type: 'LOCATION',
      requirement: requisition.location_name || requisition.work_mode_code,
      candidate_value: candidate.current_location ?? null
    });
  }

  if (screening.knockout_failed) {
    for (const q of screening.failed_screening_questions) {
      mandatoryFailures.push({
        type: 'SCREENING',
        requirement: q,
        candidate_value: null
      });
    }
  }

  const eligibility_status = resolveEligibility({
    knockoutFailed: screening.knockout_failed,
    mandatoryFailures,
    insufficientMandatory
  });

  const match_reasons = [];
  const concerns = [];
  const matched_requirements = [];
  const missing_requirements = [];

  if (!skills.unknown && skills.required_total) {
    match_reasons.push(
      `${skills.required_matched} of ${skills.required_total} required skills matched`
    );
    for (const s of skills.matched_skills) {
      matched_requirements.push({ type: 'SKILL', requirement: s, status: 'MATCHED' });
    }
    for (const s of skills.missing_required_skills) {
      missing_requirements.push({ type: 'SKILL', requirement: s, status: 'NOT_MATCHED' });
      concerns.push(`${s} skill not found`);
    }
  } else if (skills.unknown && skills.missing_data) {
    missing_requirements.push({ type: 'SKILL', requirement: 'Skill profile', status: 'UNKNOWN' });
  }

  if (experience.required_experience && experience.candidate_years_experience != null) {
    if (
      experience.experience_status === EXPERIENCE_STATUS.MEETS_REQUIREMENT ||
      experience.experience_status === EXPERIENCE_STATUS.EXCEEDS_REQUIREMENT
    ) {
      match_reasons.push(
        `Candidate has ${experience.candidate_years_experience} years experience against a ${experience.required_experience} requirement`
      );
      matched_requirements.push({
        type: 'EXPERIENCE',
        requirement: experience.required_experience,
        status: 'MATCHED'
      });
    } else if (experience.unknown) {
      missing_requirements.push({
        type: 'EXPERIENCE',
        requirement: experience.required_experience,
        status: 'UNKNOWN'
      });
    } else {
      missing_requirements.push({
        type: 'EXPERIENCE',
        requirement: experience.required_experience,
        status: 'NOT_MATCHED'
      });
      concerns.push(
        `Experience (${experience.candidate_years_experience} years) is below ${experience.required_experience}`
      );
    }
  }

  if (qualification.education_requirement_met === true) {
    match_reasons.push('Education requirement satisfied');
    matched_requirements.push({
      type: 'EDUCATION',
      requirement: requisition.min_education_level_code,
      status: 'MATCHED'
    });
  } else if (qualification.education_requirement_met === false) {
    missing_requirements.push({
      type: 'EDUCATION',
      requirement: requisition.min_education_level_code,
      status: 'NOT_MATCHED'
    });
    concerns.push('Minimum education level not met');
  } else if (requisition.min_education_level_code) {
    missing_requirements.push({
      type: 'EDUCATION',
      requirement: requisition.min_education_level_code,
      status: 'UNKNOWN'
    });
  }

  if (qualification.field_of_study_match === true && requisition.preferred_field_of_study) {
    match_reasons.push(`${requisition.preferred_field_of_study} education requirement satisfied`);
  }

  if (title.raw_score >= 80 && title.best_title && requisition.requisition_title) {
    match_reasons.push(
      `Current ${title.best_title} role closely matches ${requisition.requisition_title}`
    );
  }

  if (family.job_family_match) {
    match_reasons.push('Job family matches');
    matched_requirements.push({ type: 'JOB_FAMILY', requirement: requisition.job_family_name, status: 'MATCHED' });
  }

  if (availability.notice_period_days != null && availability.notice_period_days >= 16) {
    concerns.push(`${availability.notice_period_days}-day notice period`);
  }

  if (location.relocation_required && location.willing_to_relocate) {
    concerns.push('Candidate requires relocation');
  } else if (location.relocation_required && location.willing_to_relocate === false) {
    concerns.push('Candidate is not in the required location and is not willing to relocate');
  }

  if (compensation.compensation_status === COMPENSATION_STATUS.ABOVE_RANGE) {
    concerns.push('Expected salary is above requisition range');
  } else if (compensation.compensation_status === COMPENSATION_STATUS.SLIGHTLY_ABOVE) {
    concerns.push('Expected salary is slightly above requisition range');
  } else if (compensation.compensation_status === COMPENSATION_STATUS.NOT_COMPARABLE) {
    missing_data.push('Comparable salary currency');
  }

  return {
    match_score,
    match_level,
    recommendation,
    eligibility_status,
    scores: rawScores,
    score_breakdown: breakdown,
    skills_score: skills.raw_score,
    skills_contribution: round1((skills.raw_score * MATCH_WEIGHTS.SKILLS) / 100),
    matched_skills: skills.matched_skills,
    missing_required_skills: skills.missing_required_skills,
    matched_preferred_skills: skills.matched_preferred_skills,
    experience,
    qualification,
    title: {
      title_score: title.raw_score,
      candidate_current_title: candidate.current_title || title.best_title || null,
      requisition_title: requisition.requisition_title || null
    },
    job_family: {
      job_family_score: family.job_family_score,
      job_level_score: family.job_level_score,
      job_family_match: family.job_family_match,
      job_level_match: family.job_level_match
    },
    screening: {
      screening_score: screening.raw_score,
      knockout_failed: screening.knockout_failed,
      failed_screening_questions: screening.failed_screening_questions
    },
    availability,
    location,
    compensation,
    matched_requirements,
    missing_requirements,
    mandatory_failures: mandatoryFailures,
    match_reasons,
    concerns,
    missing_data: [...new Set(missing_data)],
    profile_completeness: profileCompleteness(candidate),
    application_guid: application.application_guid || null,
    calculated_at: now.toISOString()
  };
}
