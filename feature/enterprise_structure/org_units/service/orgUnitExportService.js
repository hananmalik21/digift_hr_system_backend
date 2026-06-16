import ExcelJS from 'exceljs';

const EXPORT_COLUMNS = [
  { header: 'Org Structure', key: 'org_structure', width: 24 },
  { header: 'Org Unit Code', key: 'org_unit_code', width: 18 },
  { header: 'Name (EN)', key: 'name_en', width: 28 },
  { header: 'Name (AR)', key: 'name_ar', width: 28 },
  { header: 'Parent', key: 'parent', width: 24 },
  { header: 'Manager', key: 'manager', width: 20 },
  { header: 'Active', key: 'active', width: 12 },
  { header: 'Manager Email', key: 'manager_email', width: 28 },
  { header: 'Manager Phone', key: 'manager_phone', width: 18 },
  { header: 'Location', key: 'location', width: 20 },
  { header: 'City', key: 'city', width: 16 },
  { header: 'Address', key: 'address', width: 32 },
  { header: 'Description', key: 'description', width: 32 }
];

function formatActiveFlag(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'Y' || normalized === 'TRUE' || normalized === '1') {
    return 'Active';
  }
  if (normalized === 'N' || normalized === 'FALSE' || normalized === '0') {
    return 'Inactive';
  }
  return value ?? '';
}

function mapOrgUnitRow(orgUnit) {
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
    manager: orgUnit.manager_name ?? '',
    active: formatActiveFlag(orgUnit.is_active),
    manager_email: orgUnit.manager_email ?? '',
    manager_phone: orgUnit.manager_phone ?? '',
    location: orgUnit.location ?? '',
    city: orgUnit.city ?? '',
    address: orgUnit.address ?? '',
    description: orgUnit.description ?? ''
  };
}

function sanitizeSheetName(name) {
  return String(name ?? 'Sheet')
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet';
}

function styleHeaderRow(worksheet) {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEF7' }
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFB8C4D9' } }
    };
  });
}

function addOrgUnitsSheet(workbook, sheetName, orgUnits) {
  const worksheet = workbook.addWorksheet(sanitizeSheetName(sheetName));
  worksheet.columns = EXPORT_COLUMNS;
  styleHeaderRow(worksheet);

  for (const orgUnit of orgUnits) {
    worksheet.addRow(mapOrgUnitRow(orgUnit));
  }

  return worksheet;
}

function buildExportFilename({ levelCode, structureName }) {
  const datePart = new Date().toISOString().slice(0, 10);
  const levelPart = (levelCode || 'org_units').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const structurePart = (structureName || 'structure')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 40);

  return `${levelPart}_${structurePart}_${datePart}.xlsx`;
}

/**
 * Build an Excel workbook buffer for org unit export.
 * @param {{ levelCode?: string|null, structureName?: string|null, sheets: Array<{ name: string, orgUnits: object[] }> }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildOrgUnitsExcelBuffer({ levelCode = null, structureName = null, sheets }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Digify ERP';
  workbook.created = new Date();

  let rowCount = 0;
  for (const sheet of sheets) {
    addOrgUnitsSheet(workbook, sheet.name, sheet.orgUnits ?? []);
    rowCount += (sheet.orgUnits ?? []).length;
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const filename = buildExportFilename({ levelCode, structureName });

  return { buffer, filename, rowCount };
}
