import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

import OrgUnitModel from '../model/orgUnitModel.js';
import {
  validateCompanyLegalEmployerCurrencyOnCreate,
  validateCompanyLegalEmployerCurrencyOnUpdate
} from '../service/orgUnitValidator.js';
import { buildOrgUnitsExcelBuffer } from '../service/orgUnitExportService.js';

test('COMPANY create normalizes lowercase legal_employer/currency_code', () => {
  const data = {
    level_code: 'company',
    legal_employer: 'y',
    currency_code: 'kwd',
    org_unit_code: 'COMP001',
    org_unit_name_en: 'Company One',
    is_active: 'Y'
  };

  validateCompanyLegalEmployerCurrencyOnCreate({ levelCode: data.level_code, data });

  assert.equal(data.legal_employer, 'Y');
  assert.equal(data.currency_code, 'KWD');

  const payload = OrgUnitModel.toPackagePayload('4B0B5A4B9BD74430E0633519000AC30E', 3, data, 'ADMIN');
  const serialized = JSON.parse(JSON.stringify(payload));

  assert.equal(serialized.legal_employer, 'Y');
  assert.equal(serialized.currency_code, 'KWD');
});

test('COMPANY create rejects invalid legal_employer', () => {
  const data = {
    level_code: 'COMPANY',
    legal_employer: 'YES'
  };

  assert.throws(() => {
    validateCompanyLegalEmployerCurrencyOnCreate({ levelCode: data.level_code, data });
  }, (err) => err?.code === 'VALIDATION_ERROR' && err?.message === 'legal_employer must be Y or N');
});

test('COMPANY create rejects invalid currency_code format', () => {
  const data = {
    level_code: 'COMPANY',
    currency_code: 'KW'
  };

  assert.throws(() => {
    validateCompanyLegalEmployerCurrencyOnCreate({ levelCode: data.level_code, data });
  }, (err) => err?.code === 'VALIDATION_ERROR' && err?.message === 'currency_code must be a 3-letter currency code');
});

test('Non-COMPANY create rejects legal_employer/currency_code non-null values', () => {
  const data = {
    level_code: 'DEPARTMENT',
    legal_employer: 'Y',
    currency_code: 'KWD'
  };

  assert.throws(() => {
    validateCompanyLegalEmployerCurrencyOnCreate({ levelCode: data.level_code, data });
  }, (err) => err?.code === 'VALIDATION_ERROR' && err?.message === 'legal_employer and currency_code are allowed only for COMPANY level');
});

test('Partial COMPANY update normalizes currency_code without touching legal_employer', () => {
  const existingOrgUnit = { level_code: 'COMPANY' };
  const data = { currency_code: 'usd' };

  validateCompanyLegalEmployerCurrencyOnUpdate({ existingOrgUnit, data });

  assert.equal(data.currency_code, 'USD');
  assert.equal(Object.prototype.hasOwnProperty.call(data, 'legal_employer'), false);

  const payload = OrgUnitModel.toPackagePayload('4B0B5A4B9BD74430E0633519000AC30E', null, data, 'ADMIN');
  const serialized = JSON.parse(JSON.stringify(payload));

  assert.equal(serialized.currency_code, 'USD');
  assert.equal(Object.prototype.hasOwnProperty.call(serialized, 'legal_employer'), false);
});

test('Switching COMPANY -> non-COMPANY forces both fields to null', () => {
  const existingOrgUnit = { level_code: 'COMPANY' };
  const data = { level_code: 'DEPARTMENT' }; // omit both COMPANY-only fields

  validateCompanyLegalEmployerCurrencyOnUpdate({ existingOrgUnit, data });

  assert.equal(data.legal_employer, null);
  assert.equal(data.currency_code, null);

  const payload = OrgUnitModel.toPackagePayload('4B0B5A4B9BD74430E0633519000AC30E', null, data, 'ADMIN');
  const serialized = JSON.parse(JSON.stringify(payload));

  assert.equal(serialized.legal_employer, null);
  assert.equal(serialized.currency_code, null);
});

test('toMinimalData includes legal_employer/currency_code (null for non-company)', () => {
  const row = {
    org_unit_id: 'ID1',
    org_unit_code: 'FIN',
    org_unit_name_en: 'Finance',
    level_code: 'DEPARTMENT',
    legal_employer: null,
    currency_code: null,
    parent_org_unit_id: null,
    is_active: 'Y'
  };

  const minimal = OrgUnitModel.toMinimalData(row);
  assert.equal(minimal.legal_employer, null);
  assert.equal(minimal.currency_code, null);
});

test('EXPORT includes Legal Employer and Currency Code columns', async () => {
  const { buffer } = await buildOrgUnitsExcelBuffer({
    levelCode: 'COMPANY',
    structureName: 'STRUCT',
    sheets: [
      {
        name: 'COMPANY',
        orgUnits: [
          {
            org_structure_name: 'ORG',
            level_code: 'COMPANY',
            org_unit_code: 'COMP001',
            org_unit_name_en: 'Company One',
            org_unit_name_ar: '',
            parent_unit: null,
            is_active: 'Y',
            location: '',
            city: '',
            address: '',
            description: '',
            legal_employer: 'Y',
            currency_code: 'KWD'
          },
          {
            org_structure_name: 'ORG',
            level_code: 'DEPARTMENT',
            org_unit_code: 'DEPT001',
            org_unit_name_en: 'Department One',
            org_unit_name_ar: '',
            parent_unit: null,
            is_active: 'Y',
            location: '',
            city: '',
            address: '',
            description: '',
            legal_employer: null,
            currency_code: null
          }
        ]
      }
    ]
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.getWorksheet('COMPANY') ?? workbook.worksheets[0];
  const headers = worksheet.getRow(1).values.slice(1);
  const legalIdx = headers.indexOf('Legal Employer');
  const currencyIdx = headers.indexOf('Currency Code');

  assert.ok(legalIdx >= 0, 'Missing Legal Employer column');
  assert.ok(currencyIdx >= 0, 'Missing Currency Code column');

  const row1 = worksheet.getRow(2).values.slice(1);
  const row2 = worksheet.getRow(3).values.slice(1);

  assert.equal(row1[legalIdx], 'Y');
  assert.equal(row1[currencyIdx], 'KWD');

  // Non-COMPANY export blanks (NULL => '').
  assert.equal(row2[legalIdx], '');
  assert.equal(row2[currencyIdx], '');
});

