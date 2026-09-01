import {
  buildExcelExport,
  defineExcelColumns,
  mapToExcelRows
} from '@digifyhr/common/excel';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Position Code', key: 'position_code', width: 18 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Title (EN)', key: 'position_title_en', width: 28 },
  { header: 'Title (AR)', key: 'position_title_ar', width: 28 },
  { header: 'Org Structure', key: 'org_structure', width: 24 },
  { header: 'Org Unit (EN)', key: 'org_unit_en', width: 24 },
  { header: 'Org Unit (AR)', key: 'org_unit_ar', width: 24 },
  { header: 'Cost Center', key: 'cost_center', width: 16 },
  { header: 'Location', key: 'location', width: 20 },
  { header: 'Job Family', key: 'job_family', width: 20 },
  { header: 'Job Level', key: 'job_level', width: 18 },
  { header: 'Grade', key: 'grade', width: 10 },
  { header: 'Steps', key: 'steps', width: 12 },
  { header: 'Headcount', key: 'number_of_positions', width: 12 },
  { header: 'Filled', key: 'filled_positions', width: 10 },
  { header: 'Employment Type', key: 'employment_type', width: 18 },
  { header: 'Budget Min (KD)', key: 'budgeted_min_kd', width: 16 },
  { header: 'Budget Max (KD)', key: 'budgeted_max_kd', width: 16 },
  { header: 'Actual Avg (KD)', key: 'actual_avg_kd', width: 16 },
  { header: 'Reports To', key: 'reports_to', width: 22 }
]);

function formatSteps(position) {
  const steps = position?.step_nos;
  if (!Array.isArray(steps) || steps.length === 0) return '';
  return steps.join(', ');
}

function formatReportsTo(position) {
  const reportsTo = position?.reports_to;
  if (!reportsTo) return '';
  return reportsTo.position_code
    ?? reportsTo.position_title_en
    ?? '';
}

function formatNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

function mapPositionRow(position) {
  return {
    position_code: position.position_code ?? '',
    status: position.status ?? '',
    position_title_en: position.position_title_en ?? '',
    position_title_ar: position.position_title_ar ?? '',
    org_structure: position.org_structure?.structure_name
      ?? position.org_structure?.structure_code
      ?? '',
    org_unit_en: position.org_unit?.name_en ?? '',
    org_unit_ar: position.org_unit?.name_ar ?? '',
    cost_center: position.cost_center ?? '',
    location: position.location ?? '',
    job_family: position.job_family?.job_family_name_en
      ?? position.job_family?.job_family_code
      ?? '',
    job_level: position.job_level?.level_name_en
      ?? position.job_level?.level_code
      ?? '',
    grade: position.grade?.grade_number ?? '',
    steps: formatSteps(position),
    number_of_positions: formatNumber(position.number_of_positions),
    filled_positions: formatNumber(position.filled_positions),
    employment_type: position.employment_type ?? '',
    budgeted_min_kd: formatNumber(position.budgeted_min_kd),
    budgeted_max_kd: formatNumber(position.budgeted_max_kd),
    actual_avg_kd: formatNumber(position.actual_avg_kd),
    reports_to: formatReportsTo(position)
  };
}

/**
 * Build an Excel workbook buffer for positions export.
 * @param {{ positions: object[], tenantId?: number|string|null }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildPositionsExcelBuffer({ positions, tenantId = null }) {
  const rows = mapToExcelRows(positions, EXPORT_COLUMNS, mapPositionRow);

  return buildExcelExport({
    sheets: [{
      name: 'Positions',
      columns: EXPORT_COLUMNS,
      rows
    }],
    filenameParts: ['positions', tenantId ? `tenant_${tenantId}` : null],
    freezeHeader: true,
    autoFilter: true
  });
}

const REPORTING_EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Level', key: 'level', width: 8 },
  { header: 'Position Code', key: 'position_code', width: 18 },
  { header: 'Title (EN)', key: 'position_title_en', width: 32 },
  { header: 'Title (AR)', key: 'position_title_ar', width: 32 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Reports To Code', key: 'reports_to_code', width: 18 },
  { header: 'Reports To Title (EN)', key: 'reports_to_title_en', width: 28 },
  { header: 'Direct Reports', key: 'direct_reports_count', width: 14 }
]);

/**
 * Flatten a reporting-relationship tree into export rows (depth-first).
 * @param {object[]} nodes
 * @param {number} [level=0]
 * @returns {Array<{ node: object, level: number }>}
 */
export function flattenReportingRelationships(nodes, level = 0) {
  const flattened = [];

  for (const node of nodes ?? []) {
    flattened.push({ node, level });
    if (node.direct_reports?.length) {
      flattened.push(...flattenReportingRelationships(node.direct_reports, level + 1));
    }
  }

  return flattened;
}

function mapReportingRelationshipRow(entry) {
  const { node, level } = entry;
  const reportsTo = node.reports_to ?? null;

  return {
    level: level + 1,
    position_code: node.position_code ?? '',
    position_title_en: node.position_title_en ?? '',
    position_title_ar: node.position_title_ar ?? '',
    status: node.status ?? '',
    reports_to_code: reportsTo?.position_code ?? '',
    reports_to_title_en: reportsTo?.position_title_en ?? '',
    direct_reports_count: Array.isArray(node.direct_reports) ? node.direct_reports.length : 0
  };
}

/**
 * Build an Excel workbook buffer for position reporting relationships export.
 * @param {{
 *   relationships: object[],
 *   tenantId?: number|string|null,
 *   positionId?: string|null,
 *   includeHierarchy?: boolean
 * }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildReportingRelationshipsExcelBuffer({
  relationships,
  tenantId = null,
  positionId = null,
  includeHierarchy = true
}) {
  const flattened = flattenReportingRelationships(relationships);
  const rows = mapToExcelRows(flattened, REPORTING_EXPORT_COLUMNS, mapReportingRelationshipRow);

  return buildExcelExport({
    sheets: [{
      name: 'Reporting Relationships',
      columns: REPORTING_EXPORT_COLUMNS,
      rows
    }],
    filenameParts: [
      'position_reporting_relationships',
      tenantId ? `tenant_${tenantId}` : null,
      positionId ? `position_${positionId.slice(0, 8)}` : null,
      includeHierarchy ? null : 'flat'
    ],
    freezeHeader: true,
    autoFilter: true
  });
}
