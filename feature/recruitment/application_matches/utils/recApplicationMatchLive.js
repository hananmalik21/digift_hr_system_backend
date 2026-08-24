import {
  ELIGIBILITY_STATUS,
  RECOMMENDATIONS
} from './recApplicationMatchConstants.js';
import {
  parseApplicationStageFilter,
  parseEligibilityStatusFilter,
  parseMatchLevelFilter,
  parseMatchSortKey,
  parseMatchSortOrder,
  parseMinMatchScore
} from './recApplicationMatchValidators.js';
import { isNonEmptyTrimmed } from '../../shared/recViewModelUtils.js';

function levelKey(code) {
  return String(code || '').toLowerCase();
}

function candidateCard(cand) {
  return {
    candidate_guid: cand.candidate_guid ?? null,
    full_name: cand.full_name ?? null,
    email: cand.email ?? null,
    current_title: cand.current_title ?? null,
    current_employer: cand.current_employer ?? null,
    years_experience: cand.years_experience ?? null,
    current_location: cand.current_location ?? null
  };
}

/**
 * Build API 5 summary from live scoring results.
 * @param {Array<{ result: { match_score?: number, match_level?: string, eligibility_status?: string, recommendation?: string } }>} items
 */
export function summarizeLiveResults(items) {
  const match_distribution = {
    exceptional: 0,
    strong: 0,
    good: 0,
    partial: 0,
    weak: 0,
    poor: 0
  };
  const eligibility = {
    eligible: 0,
    mandatory_requirement_failed: 0,
    knockout_failed: 0,
    insufficient_data: 0
  };

  let scoreSum = 0;
  let scoreCount = 0;
  let top = null;
  let shortlist_recommended = 0;

  for (const item of items) {
    const r = item.result || {};
    const level = levelKey(r.match_level);
    if (level in match_distribution) match_distribution[level] += 1;

    if (r.eligibility_status === ELIGIBILITY_STATUS.ELIGIBLE) eligibility.eligible += 1;
    else if (r.eligibility_status === ELIGIBILITY_STATUS.MANDATORY_REQUIREMENT_FAILED) {
      eligibility.mandatory_requirement_failed += 1;
    } else if (r.eligibility_status === ELIGIBILITY_STATUS.KNOCKOUT_FAILED) {
      eligibility.knockout_failed += 1;
    } else if (r.eligibility_status === ELIGIBILITY_STATUS.INSUFFICIENT_DATA) {
      eligibility.insufficient_data += 1;
    }

    const score = Number(r.match_score);
    if (Number.isFinite(score)) {
      scoreSum += score;
      scoreCount += 1;
      if (top == null || score > top) top = score;
    }

    if (
      r.recommendation === RECOMMENDATIONS.PRIORITY_SHORTLIST ||
      r.recommendation === RECOMMENDATIONS.SHORTLIST
    ) {
      shortlist_recommended += 1;
    }
  }

  return {
    total_applications: items.length,
    match_distribution,
    eligibility,
    average_match_score: scoreCount ? Math.round((scoreSum / scoreCount) * 10) / 10 : null,
    top_match_score: top,
    shortlist_recommended
  };
}

/** Compact summary embedded on the requisition match list. */
export function toListSummary(full) {
  return {
    total_applications: full.total_applications,
    exceptional: full.match_distribution.exceptional,
    strong: full.match_distribution.strong,
    good: full.match_distribution.good,
    partial: full.match_distribution.partial,
    weak: full.match_distribution.weak,
    poor: full.match_distribution.poor,
    eligible: full.eligibility.eligible,
    mandatory_failed: full.eligibility.mandatory_requirement_failed
  };
}

function matchDisplayFromScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  return `${Math.round(n)}% Match`;
}

function availabilityCard(availability) {
  if (!availability || typeof availability !== 'object') {
    return {
      score: null,
      code: null,
      notice_period_days: null,
      estimated_available_date: null,
      display: null
    };
  }
  return {
    score: availability.score ?? availability.raw_score ?? null,
    code: availability.code ?? null,
    notice_period_days: availability.notice_period_days ?? null,
    estimated_available_date: availability.estimated_available_date ?? null,
    display: availability.display ?? null
  };
}

/** Nested + flat availability/match fields shared by list and detail responses. */
function availabilityAndMatchFields(result) {
  const availability = availabilityCard(result.availability);
  const match_display = matchDisplayFromScore(result.match_score);
  return {
    availability,
    match_display,
    match_score: result.match_score ?? null,
    match_level: result.match_level ?? null,
    recommendation_code: result.recommendation ?? null,
    availability_score: availability.score,
    availability_code: availability.code,
    availability_text: availability.display,
    notice_period_days: availability.notice_period_days,
    estimated_available_date: availability.estimated_available_date
  };
}

export function toListItemFromLive(source, result) {
  const app = source.application || {};
  const fields = availabilityAndMatchFields(result);
  return {
    application_id: app.application_id ?? null,
    application_guid: app.application_guid ?? null,
    application_stage: app.application_stage ?? null,
    applied_date: app.applied_date ?? null,
    candidate: candidateCard(source.candidate || {}),
    match: {
      match_score: result.match_score,
      match_display: fields.match_display,
      match_level: result.match_level,
      recommendation: result.recommendation,
      eligibility_status: result.eligibility_status,
      scores: result.scores
    },
    availability: fields.availability,
    match_score: fields.match_score,
    match_display: fields.match_display,
    match_level: fields.match_level,
    recommendation_code: fields.recommendation_code,
    availability_score: fields.availability_score,
    availability_code: fields.availability_code,
    availability_text: fields.availability_text,
    notice_period_days: fields.notice_period_days,
    estimated_available_date: fields.estimated_available_date,
    matched_skills: result.matched_skills || [],
    missing_required_skills: result.missing_required_skills || [],
    match_reasons: result.match_reasons || [],
    concerns: result.concerns || [],
    mandatory_failures: result.mandatory_failures || []
  };
}

export function toDetailFromLive(source, requisition, result) {
  const app = source.application || {};
  const fields = availabilityAndMatchFields(result);
  return {
    application_guid: app.application_guid ?? null,
    application_id: app.application_id ?? null,
    application_stage: app.application_stage ?? null,
    requisition: {
      requisition_guid: requisition.requisition_guid ?? app.requisition_guid ?? null,
      requisition_number: requisition.requisition_number ?? app.requisition_number ?? null,
      requisition_title: requisition.requisition_title ?? null
    },
    candidate: candidateCard(source.candidate || {}),
    match_score: fields.match_score,
    match_display: fields.match_display,
    match_level: fields.match_level,
    recommendation: result.recommendation,
    recommendation_code: fields.recommendation_code,
    eligibility_status: result.eligibility_status,
    profile_completeness: result.profile_completeness ?? null,
    score_breakdown: result.score_breakdown || [],
    scores: result.scores,
    skills: {
      skills_score: result.skills_score,
      skills_contribution: result.skills_contribution,
      matched_skills: result.matched_skills || [],
      missing_required_skills: result.missing_required_skills || [],
      matched_preferred_skills: result.matched_preferred_skills || []
    },
    experience: result.experience || null,
    qualification: result.qualification || null,
    title: result.title || null,
    job_family: result.job_family || null,
    screening: result.screening || null,
    availability: fields.availability,
    availability_score: fields.availability_score,
    availability_code: fields.availability_code,
    availability_text: fields.availability_text,
    notice_period_days: fields.notice_period_days,
    estimated_available_date: fields.estimated_available_date,
    location: result.location || null,
    compensation: result.compensation || null,
    matched_requirements: result.matched_requirements || [],
    missing_requirements: result.missing_requirements || [],
    mandatory_failures: result.mandatory_failures || [],
    match_reasons: result.match_reasons || [],
    concerns: result.concerns || [],
    missing_data: result.missing_data || [],
    calculated_at: result.calculated_at || null
  };
}

function haystack(row) {
  const c = row.item?.candidate || {};
  return [c.full_name, c.email, c.current_title, row.source?.application?.application_number]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function sortValue(row, sortBy) {
  const item = row.item || {};
  switch (sortBy) {
    case 'applied_date':
    case 'application_date':
      return String(item.applied_date || '');
    case 'candidate_name':
      return String(item.candidate?.full_name || '');
    case 'years_experience':
      return Number(item.candidate?.years_experience) || 0;
    case 'application_stage':
      return String(item.application_stage || '');
    case 'eligibility_status':
      return String(item.match?.eligibility_status || '');
    case 'match_level':
      return String(item.match?.match_level || '');
    default:
      return Number(item.match?.match_score) || 0;
  }
}

function compareSortValues(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

/**
 * @param {Array<{ item: object, source: object, result: object }>} rows
 * @param {Record<string, unknown>} query
 * @param {{ page: number, limit: number }} paging
 */
export function filterSortPageLiveItems(rows, query, paging) {
  const minScore = parseMinMatchScore(query?.min_match_score);
  const matchLevel = parseMatchLevelFilter(query?.match_level);
  const eligibility = parseEligibilityStatusFilter(query?.eligibility_status);
  const stage = parseApplicationStageFilter(query?.application_stage ?? query?.current_stage_code);
  const search = isNonEmptyTrimmed(query?.search) ? String(query.search).trim().toLowerCase() : null;
  const sortBy = parseMatchSortKey(query);
  const dir = parseMatchSortOrder(query) === 'asc' ? 1 : -1;

  const filtered = rows.filter((row) => {
    const item = row.item;
    const score = item.match?.match_score;
    if (minScore != null && !(Number.isFinite(score) && score >= minScore)) return false;
    if (matchLevel && item.match?.match_level !== matchLevel) return false;
    if (eligibility && item.match?.eligibility_status !== eligibility) return false;
    if (stage && item.application_stage !== stage) return false;
    if (search && !haystack(row).includes(search)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const cmp = compareSortValues(sortValue(a, sortBy), sortValue(b, sortBy));
    if (cmp !== 0) return cmp * dir;
    return String(a.item.applied_date || '').localeCompare(String(b.item.applied_date || ''));
  });

  const total = filtered.length;
  const start = (paging.page - 1) * paging.limit;
  const paged = filtered.slice(start, start + paging.limit).map((row) => {
    const { applied_date, ...rest } = row.item;
    return rest;
  });

  return { rows: paged, total };
}
