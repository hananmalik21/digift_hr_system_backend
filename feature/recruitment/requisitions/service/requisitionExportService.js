import { buildDynamicApiExcelBuffer } from '../../../../utils/excel/index.js';

const KEY_ORDER = [
  'requisition_id',
  'requisition_guid',
  'enterprise_id',
  'requisition_number',
  'requisition_title',
  'approval_status_code',
  'open_status_code',
  'submitted_by',
  'submitted_date',
  'approved_by',
  'approved_date',
  'opened_by',
  'opened_date',
  'closed_by',
  'closed_date',
  'rejected_by',
  'rejected_date',
  'rejection_reason',
  'position',
  'org_unit',
  'org_hierarchy',
  'job_family',
  'job_level',
  'grade',
  'requisition_detail',
  'status',
  'justification',
  'justification_org_hierarchy',
  'position_detail',
  'education_experience',
  'hiring_team',
  'interview_panel',
  'skills',
  'budget',
  'audit'
];

/** @param {{ rows: object[], enterpriseId?: number|string|null }} params */
export function buildRequisitionsExcelBuffer({ rows, enterpriseId = null }) {
  return buildDynamicApiExcelBuffer({
    rows,
    sheetName: 'Requisitions',
    filenameParts: ['requisitions', enterpriseId ? `enterprise_${enterpriseId}` : null],
    keyOrder: KEY_ORDER
  });
}
