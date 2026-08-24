import {
  buildExcelExport,
  defineExcelColumns,
  formatYnActiveFlag,
  mapToExcelRows
} from '../../../../utils/excel/index.js';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Org Structure', key: 'org_structure', width: 24 },
  { header: 'Org Unit Code', key: 'org_unit_code', width: 18 },
  { header: 'Name (EN)', key: 'name_en', width: 28 },
  { header: 'Name (AR)', key: 'name_ar', width: 28 },
  { header: 'Parent', key: 'parent', width: 24 },
  { header: 'Active', key: 'active', width: 12 },
  { header: 'Location', key: 'location', width: 20 },
  { header: 'City', key: 'city', width: 16 },
  { header: 'Address', key: 'address', width: 32 },
  { header: 'Description', key: 'description', width: 32 },
  { header: 'Legal Employer', key: 'legal_employer', width: 16 },
  { header: 'Currency Code', key: 'currency_code', width: 14 }
]);

function mapOrgUnitRow(orgUnit) {
  const levelCodeRaw = orgUnit.level_code ?? orgUnit.LEVEL_CODE;
  const hasLevelCode = levelCodeRaw !== undefined && levelCodeRaw !== null && String(levelCodeRaw).trim() !== '';
  const isCompanyLevel = hasLevelCode && String(levelCodeRaw).trim().toUpperCase() === 'COMPANY';

  const parentName = orgUnit.parent_unit?.name
    ?? orgUnit.parent_org_unit_name_en
    ?? orgUnit.parent_org_unit_name_ar
    ?? '';

  return {
    org_structure: orgUnit.org_structure_name ?? '',
    org_unit_code: orgUnit.org_unit_code ?? '',
    name_en: orgUnit.org_unit_name_en ?? '',
    name_ar: orgUnit.org_unit_name_ar ?? '',
    parent: parentName,
    active: formatYnActiveFlag(orgUnit.is_active),
    location: orgUnit.location ?? '',
    city: orgUnit.city ?? '',
    address: orgUnit.address ?? '',
    description: orgUnit.description ?? '',
    // COMPANY-only fields — export blanks when Oracle returns NULL/undefined.
    legal_employer: isCompanyLevel
      ? (orgUnit.legal_employer ?? '')
      : (hasLevelCode ? '' : (orgUnit.legal_employer ?? '')),
    currency_code: isCompanyLevel
      ? (orgUnit.currency_code ?? '')
      : (hasLevelCode ? '' : (orgUnit.currency_code ?? ''))
  };
}

/**
 * Build an Excel workbook buffer for org unit export.
 * @param {{ levelCode?: string|null, structureName?: string|null, sheets: Array<{ name: string, orgUnits: object[] }> }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildOrgUnitsExcelBuffer({ levelCode = null, structureName = null, sheets }) {
  const excelSheets = (sheets ?? []).map((sheet) => ({
    name: sheet.name,
    columns: EXPORT_COLUMNS,
    rows: mapToExcelRows(sheet.orgUnits, EXPORT_COLUMNS, mapOrgUnitRow)
  }));

  return buildExcelExport({
    sheets: excelSheets,
    filenameParts: [levelCode || 'org_units', structureName || 'structure'],
    freezeHeader: true,
    autoFilter: true
  });
}
