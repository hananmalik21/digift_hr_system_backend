/** Oracle views for recruitment dashboard stats. Do not recalculate these values in Node. */
export const REC_CANDIDATE_STATS_VIEW =
  process.env.REC_CANDIDATE_STATS_V || 'REC.V_CANDIDATE_STATS';
export const REC_APPLICATION_STATS_VIEW =
  process.env.REC_APPLICATION_STATS_V || 'REC.V_APPLICATION_STATS';
export const REC_INTERVIEW_STATS_VIEW =
  process.env.REC_INTERVIEW_STATS_V || 'REC.V_INTERVIEW_STATS';
export const REC_OFFER_STATS_VIEW = process.env.REC_OFFER_STATS_V || 'REC.V_OFFER_STATS';
export const REC_REQUISITION_STATS_VIEW =
  process.env.REC_REQUISITION_STATS_V || 'REC.V_REQUISITION_STATS';

export const LOG_TAG = 'recDashboardViewModel';

export const READ_ERROR_MESSAGE = 'Unable to fetch recruitment dashboard stats. Please try again.';

export const MESSAGES = {
  CANDIDATE_STATS: 'Candidate stats retrieved successfully.',
  APPLICATION_STATS: 'Application stats retrieved successfully.',
  INTERVIEW_STATS: 'Interview stats retrieved successfully.',
  OFFER_STATS: 'Offer stats retrieved successfully.',
  REQUISITION_STATS: 'Requisition stats retrieved successfully.',
  COMBINED_STATS: 'Recruitment dashboard stats retrieved successfully.'
};

/** @typedef {'number'|'string'} StatsColumnType */

/**
 * @typedef {{ name: string, type: StatsColumnType }} StatsColumn
 */

/** @param {string} name @returns {StatsColumn} */
function num(name) {
  return { name, type: 'number' };
}

/** @param {string} name @returns {StatsColumn} */
function str(name) {
  return { name, type: 'string' };
}

/**
 * Shared month series + trend columns used by all four dashboard views.
 * @param {string} monthMetric e.g. CANDIDATES
 * @param {string} trendPrefix e.g. CANDIDATE
 */
function monthAndTrendColumns(monthMetric, trendPrefix) {
  return [
    num(`MONTH_0_${monthMetric}`),
    num(`MONTH_1_${monthMetric}`),
    num(`MONTH_2_${monthMetric}`),
    str('MONTH_0_LABEL'),
    str('MONTH_1_LABEL'),
    str('MONTH_2_LABEL'),
    num(`LAST_3_MONTHS_${monthMetric}`),
    num(`${trendPrefix}_CHANGE_PCT`),
    str(`${trendPrefix}_TREND`),
    str(`${trendPrefix}_CHANGE_LABEL`)
  ];
}

/** Columns from REC.V_CANDIDATE_STATS. */
export const CANDIDATE_STATS_COLUMNS = [
  num('ENTERPRISE_ID'),
  num('TOTAL_CANDIDATES'),
  num('SHORTLISTED'),
  num('INTERVIEWED'),
  num('HIRED'),
  ...monthAndTrendColumns('CANDIDATES', 'CANDIDATE')
];

/** Columns from REC.V_APPLICATION_STATS. */
export const APPLICATION_STATS_COLUMNS = [
  num('ENTERPRISE_ID'),
  num('TOTAL_APPLICATIONS'),
  num('NEW_APPLICATIONS'),
  num('IN_INTERVIEW'),
  num('CAREER_SITE_APPLICATIONS'),
  num('CURRENT_WEEK_APPLICATIONS'),
  num('PREVIOUS_WEEK_APPLICATIONS'),
  ...monthAndTrendColumns('APPLICATIONS', 'APPLICATION')
];

/** Columns from REC.V_INTERVIEW_STATS. */
export const INTERVIEW_STATS_COLUMNS = [
  num('ENTERPRISE_ID'),
  num('TOTAL_INTERVIEWS'),
  num('SCHEDULED'),
  num('COMPLETED'),
  num('RESCHEDULED'),
  ...monthAndTrendColumns('INTERVIEWS', 'INTERVIEW')
];

/** Columns from REC.V_OFFER_STATS. */
export const OFFER_STATS_COLUMNS = [
  num('ENTERPRISE_ID'),
  num('TOTAL_OFFERS'),
  num('PENDING_APPROVAL'),
  num('SENT_TO_CANDIDATES'),
  num('ACCEPTED'),
  num('AVG_OFFER_VALUE'),
  num('DRAFT_OFFERS'),
  num('EXPIRED_OFFERS'),
  num('WITHDRAWN_OFFERS'),
  ...monthAndTrendColumns('OFFERS', 'OFFER')
];

/** Columns from REC.V_REQUISITION_STATS. */
export const REQUISITION_STATS_COLUMNS = [
  num('ENTERPRISE_ID'),
  num('TOTAL_REQUISITIONS'),
  num('TOTAL_OPENINGS'),
  num('PENDING_APPROVAL'),
  num('HIGH_PRIORITY'),
  ...monthAndTrendColumns('REQUISITIONS', 'REQUISITION')
];

/**
 * Single source of truth for dashboard section routes, views, and columns.
 * Combined `/stats` uses COMBINED_DASHBOARD_SECTIONS (excludes requisitions).
 * @type {ReadonlyArray<{
 *   key: 'candidates'|'applications'|'interviews'|'offers'|'requisitions',
 *   path: string,
 *   view: string,
 *   columns: StatsColumn[],
 *   message: string
 * }>}
 */
export const DASHBOARD_SECTIONS = [
  {
    key: 'candidates',
    path: '/candidate-stats',
    view: REC_CANDIDATE_STATS_VIEW,
    columns: CANDIDATE_STATS_COLUMNS,
    message: MESSAGES.CANDIDATE_STATS
  },
  {
    key: 'applications',
    path: '/application-stats',
    view: REC_APPLICATION_STATS_VIEW,
    columns: APPLICATION_STATS_COLUMNS,
    message: MESSAGES.APPLICATION_STATS
  },
  {
    key: 'interviews',
    path: '/interview-stats',
    view: REC_INTERVIEW_STATS_VIEW,
    columns: INTERVIEW_STATS_COLUMNS,
    message: MESSAGES.INTERVIEW_STATS
  },
  {
    key: 'offers',
    path: '/offer-stats',
    view: REC_OFFER_STATS_VIEW,
    columns: OFFER_STATS_COLUMNS,
    message: MESSAGES.OFFER_STATS
  },
  {
    key: 'requisitions',
    path: '/requisition-stats',
    view: REC_REQUISITION_STATS_VIEW,
    columns: REQUISITION_STATS_COLUMNS,
    message: MESSAGES.REQUISITION_STATS
  }
];

/** Sections returned by GET /api/recruitment/dashboard/stats */
export const COMBINED_DASHBOARD_SECTIONS = DASHBOARD_SECTIONS.filter(
  (section) => section.key !== 'requisitions'
);

/** @param {StatsColumn[]} columns */
export function selectSqlFromColumns(columns) {
  return columns.map((c) => `v.${c.name}`).join(', ');
}
