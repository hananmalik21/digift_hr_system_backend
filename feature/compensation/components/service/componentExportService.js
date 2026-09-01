import {
  buildExcelExport,
  defineExcelColumns,
  formatYnActiveFlag,
  mapToExcelRows
} from '@digifyhr/common/excel';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Component Code', key: 'component_code', width: 20 },
  { header: 'Component Name', key: 'component_name', width: 28 },
  { header: 'Description', key: 'description', width: 36 },
  { header: 'Category', key: 'comp_category_code', width: 16 },
  { header: 'Type', key: 'component_type_code', width: 16 },
  { header: 'Calculation Method', key: 'calculation_method_code', width: 20 },
  { header: 'Base Amount Source', key: 'base_amount_source', width: 20 },
  { header: 'Formula Name', key: 'formula_name', width: 20 },
  { header: 'Min Value', key: 'min_value', width: 12 },
  { header: 'Max Value', key: 'max_value', width: 12 },
  { header: 'Currency', key: 'currency_code', width: 10 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Active', key: 'component_active_flag', width: 10 },
  { header: 'Effective Start', key: 'effective_start_date', width: 14 },
  { header: 'Effective End', key: 'effective_end_date', width: 14 },
  { header: 'Location Codes', key: 'location_codes', width: 24 },
  { header: 'Plan Usage Count', key: 'plan_usage_count', width: 16 },
  { header: 'Recurring', key: 'recurring_flag', width: 10 },
  { header: 'Optional', key: 'optional_flag', width: 10 },
  { header: 'Pensionable', key: 'pensionable_flag', width: 12 },
  { header: 'Statutory', key: 'statutory_flag', width: 10 },
  { header: 'Include in CTC', key: 'include_in_ctc_flag', width: 14 },
  { header: 'Prorated', key: 'prorated_flag', width: 10 },
  { header: 'Taxable', key: 'taxable_flag', width: 10 },
  { header: 'Pay Basis', key: 'pay_basis', width: 16 },
  { header: 'Amortizable', key: 'amortizable_flag', width: 12 },
  { header: 'Created By', key: 'created_by', width: 18 },
  { header: 'Creation Date', key: 'creation_date', width: 18 },
  { header: 'Last Updated By', key: 'last_updated_by', width: 18 },
  { header: 'Last Update Date', key: 'last_update_date', width: 18 },
  { header: 'Component GUID', key: 'component_guid', width: 36 },
  { header: 'Component ID', key: 'component_id', width: 14 },
  { header: 'Tenant ID', key: 'tenant_id', width: 12 }
]);

function formatNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function formatDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return String(value);
}

function formatYnFlag(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'Y') return 'Y';
  if (normalized === 'N') return 'N';
  return '';
}

function formatLocationCodes(codes) {
  if (!Array.isArray(codes) || codes.length === 0) return '';
  return codes.map((c) => String(c).trim()).filter(Boolean).join(', ');
}

function mapComponentRow(component) {
  return {
    component_code: component.component_code ?? '',
    component_name: component.component_name ?? '',
    description: component.description ?? '',
    comp_category_code: component.comp_category_code ?? '',
    component_type_code: component.component_type_code ?? '',
    calculation_method_code: component.calculation_method_code ?? '',
    base_amount_source: component.base_amount_source ?? '',
    formula_name: component.formula_name ?? '',
    min_value: formatNumber(component.min_value),
    max_value: formatNumber(component.max_value),
    currency_code: component.currency_code ?? '',
    status: component.status ?? '',
    component_active_flag: formatYnActiveFlag(component.component_active_flag),
    effective_start_date: formatDate(component.effective_start_date),
    effective_end_date: formatDate(component.effective_end_date),
    location_codes: formatLocationCodes(component.location_codes),
    plan_usage_count: formatNumber(component.plan_usage_count),
    recurring_flag: formatYnFlag(component.recurring_flag),
    optional_flag: formatYnFlag(component.optional_flag),
    pensionable_flag: formatYnFlag(component.pensionable_flag),
    statutory_flag: formatYnFlag(component.statutory_flag),
    include_in_ctc_flag: formatYnFlag(component.include_in_ctc_flag),
    prorated_flag: formatYnFlag(component.prorated_flag),
    taxable_flag: formatYnFlag(component.taxable_flag),
    pay_basis: component.pay_basis ?? '',
    amortizable_flag: formatYnFlag(component.amortizable_flag),
    created_by: component.created_by ?? '',
    creation_date: formatDate(component.creation_date),
    last_updated_by: component.last_updated_by ?? '',
    last_update_date: formatDate(component.last_update_date),
    component_guid: component.component_guid ?? '',
    component_id: formatNumber(component.component_id),
    tenant_id: formatNumber(component.tenant_id)
  };
}

/**
 * Build an Excel workbook buffer for compensation components export.
 * @param {{ rows: object[], tenantId?: number|string|null }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildComponentsExcelBuffer({ rows, tenantId = null }) {
  const excelRows = mapToExcelRows(rows, EXPORT_COLUMNS, mapComponentRow);

  return buildExcelExport({
    sheets: [{
      name: 'Components',
      columns: EXPORT_COLUMNS,
      rows: excelRows
    }],
    filenameParts: ['comp_components', tenantId ? `tenant_${tenantId}` : null],
    freezeHeader: true,
    autoFilter: true
  });
}
