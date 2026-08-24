/**
 * Unit tests for requisition company-info validators, mapper, SQL binds, and error mapping.
 * No live Oracle required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import oracledb from 'oracledb';
import {
  DatabaseError,
  NotFoundError,
  ValidationError
} from '../../../../utils/errors/index.js';
import { handleReadError } from '../../shared/recControllerHelpers.js';
import { buildCompanyInfoBinds } from '../model/recRequisitionCompanyInfoModel.js';
import { MESSAGES } from '../utils/recRequisitionCompanyInfoConstants.js';
import { mapRequisitionCompanyInfoRow } from '../utils/recRequisitionCompanyInfoMapper.js';
import { SELECT_BY_GUID_AND_ENTERPRISE } from '../utils/recRequisitionCompanyInfoSql.js';
import { parseRequisitionGuidParam } from '../utils/recRequisitionCompanyInfoValidators.js';

const REQ_GUID = '501D19D3B5CF219CE0633519000AF268';
const ORG_UNIT_ID = '4C7F674DA959F58FE0633519000AB699';
const COMPANY_ID = '4CFC35A5FBCEFD23E0633519000A31ED';

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function baseRow(overrides = {}) {
  return {
    REQUISITION_ID: 123,
    REQUISITION_GUID: REQ_GUID,
    ENTERPRISE_ID: 3,
    REQUISITION_NUMBER: 'REQ-000123',
    REQUISITION_TITLE: 'Software Engineer',
    REQUISITION_ORG_UNIT_ID: ORG_UNIT_ID,
    REQUISITION_ORG_LEVEL_CODE: 'DEPARTMENT',
    REQUISITION_ORG_UNIT_CODE: 'IT',
    REQUISITION_ORG_UNIT_NAME_EN: 'Information Technology',
    REQUISITION_ORG_UNIT_NAME_AR: 'تقنية المعلومات',
    COMPANY_ID,
    COMPANY_CODE: 'COMP01',
    COMPANY_NAME_EN: 'Company Name',
    COMPANY_NAME_AR: 'اسم الشركة',
    COMPANY_LEVEL_CODE: 'COMPANY',
    COMPANY_STATUS: 'ACTIVE',
    COMPANY_IS_ACTIVE: 'Y',
    LEGAL_EMPLOYER: 'Y',
    CURRENCY_CODE: 'KWD',
    COMPANY_MANAGER_NAME: 'Jane Manager',
    COMPANY_MANAGER_EMAIL: 'jane@example.com',
    COMPANY_MANAGER_PHONE: '+96500000000',
    COMPANY_LOCATION: 'HQ',
    COMPANY_CITY: 'Kuwait City',
    COMPANY_ADDRESS: 'Block 1',
    COMPANY_DESCRIPTION: 'Top-level company',
    ...overrides
  };
}

test('parseRequisitionGuidParam accepts 32-char hex (hyphens optional)', () => {
  assert.equal(parseRequisitionGuidParam(REQ_GUID.toLowerCase()), REQ_GUID);
  assert.equal(
    parseRequisitionGuidParam('501D19D3-B5CF-219C-E063-3519000AF268'),
    REQ_GUID
  );
});

test('parseRequisitionGuidParam rejects invalid values', () => {
  assert.throws(() => parseRequisitionGuidParam(''), ValidationError);
  assert.throws(() => parseRequisitionGuidParam(null), ValidationError);
  assert.throws(() => parseRequisitionGuidParam(undefined), ValidationError);
  assert.throws(() => parseRequisitionGuidParam('123'), ValidationError);
  assert.throws(() => parseRequisitionGuidParam('abc'), ValidationError);
  assert.throws(() => parseRequisitionGuidParam('ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'), ValidationError);
});

test('SQL uses GUID + enterprise bind variables — no concatenation', () => {
  assert.match(SELECT_BY_GUID_AND_ENTERPRISE, /REQUISITION_GUID = :p_requisition_guid/);
  assert.match(SELECT_BY_GUID_AND_ENTERPRISE, /ENTERPRISE_ID = :p_enterprise_id/);
  assert.doesNotMatch(SELECT_BY_GUID_AND_ENTERPRISE, /REQUISITION_GUID\s*=\s*'[^']+'/);
  assert.match(SELECT_BY_GUID_AND_ENTERPRISE, /V_REQUISITION_COMPANY_INFO/);
  assert.doesNotMatch(SELECT_BY_GUID_AND_ENTERPRISE, /SELECT\s+\*\s+FROM/i);
  assert.doesNotMatch(SELECT_BY_GUID_AND_ENTERPRISE, /CONNECT BY/i);
  assert.doesNotMatch(SELECT_BY_GUID_AND_ENTERPRISE, /ORG_UNITS/i);
});

test('buildCompanyInfoBinds uses RAW GUID + NUMBER enterprise binds', () => {
  const binds = buildCompanyInfoBinds(REQ_GUID, 3);
  assert.ok(Buffer.isBuffer(binds.p_requisition_guid.val));
  assert.equal(binds.p_requisition_guid.val.length, 16);
  assert.equal(binds.p_requisition_guid.type, oracledb.BUFFER);
  assert.equal(binds.p_enterprise_id.val, 3);
  assert.equal(binds.p_enterprise_id.type, oracledb.NUMBER);
});

test('mapper resolves company when requisition assigned directly to COMPANY', () => {
  const data = mapRequisitionCompanyInfoRow(
    baseRow({ REQUISITION_ORG_LEVEL_CODE: 'COMPANY', REQUISITION_ORG_UNIT_ID: COMPANY_ID })
  );
  assert.equal(data.requisition.org_unit.level_code, 'COMPANY');
  assert.equal(data.company.company_id, COMPANY_ID);
  assert.equal(data.company.level_code, 'COMPANY');
  assert.equal(data.company.company_code, 'COMP01');
});

test('mapper resolves top-level company when requisition assigned to BUSINESS_UNIT', () => {
  const data = mapRequisitionCompanyInfoRow(
    baseRow({
      REQUISITION_ORG_LEVEL_CODE: 'BUSINESS_UNIT',
      REQUISITION_ORG_UNIT_CODE: 'BU-NORTH',
      REQUISITION_ORG_UNIT_NAME_EN: 'North BU'
    })
  );
  assert.equal(data.requisition.org_unit.level_code, 'BUSINESS_UNIT');
  assert.equal(data.requisition.org_unit.code, 'BU-NORTH');
  assert.equal(data.company.company_id, COMPANY_ID);
  assert.equal(data.company.level_code, 'COMPANY');
});

test('mapper resolves top-level company when requisition assigned to DEPARTMENT', () => {
  const data = mapRequisitionCompanyInfoRow(baseRow());
  assert.equal(data.requisition.org_unit.level_code, 'DEPARTMENT');
  assert.equal(data.company.company_id, COMPANY_ID);
  assert.equal(data.company.company_name_en, 'Company Name');
});

test('mapper resolves top-level company several hierarchy levels below company', () => {
  const data = mapRequisitionCompanyInfoRow(
    baseRow({
      REQUISITION_ORG_LEVEL_CODE: 'TEAM',
      REQUISITION_ORG_UNIT_CODE: 'TEAM-A',
      REQUISITION_ORG_UNIT_NAME_EN: 'Platform Team'
    })
  );
  assert.equal(data.requisition.org_unit.level_code, 'TEAM');
  assert.equal(data.company.company_id, COMPANY_ID);
  assert.equal(data.company.level_code, 'COMPANY');
  assert.equal(data.company.is_active, 'Y');
});

test('valid requisition row maps to expected nested API shape', () => {
  const data = mapRequisitionCompanyInfoRow(baseRow());
  assert.equal(data.requisition.requisition_id, 123);
  assert.equal(data.requisition.requisition_guid, REQ_GUID);
  assert.equal(data.requisition.requisition_number, 'REQ-000123');
  assert.equal(data.requisition.enterprise_id, 3);
  assert.equal(data.requisition.org_unit.org_unit_id, ORG_UNIT_ID);
  assert.equal(data.company.manager.name, 'Jane Manager');
  assert.equal(data.company.location.city, 'Kuwait City');
  assert.equal(data.company.description, 'Top-level company');
});

test('optional company fields being null do not break the response', () => {
  const data = mapRequisitionCompanyInfoRow(
    baseRow({
      COMPANY_NAME_AR: null,
      COMPANY_MANAGER_NAME: null,
      COMPANY_MANAGER_EMAIL: null,
      COMPANY_MANAGER_PHONE: null,
      COMPANY_LOCATION: null,
      COMPANY_CITY: null,
      COMPANY_ADDRESS: null,
      COMPANY_DESCRIPTION: null
    })
  );
  assert.equal(data.company.company_name_ar, null);
  assert.equal(data.company.manager.name, null);
  assert.equal(data.company.manager.email, null);
  assert.equal(data.company.manager.phone, null);
  assert.equal(data.company.location.location, null);
  assert.equal(data.company.location.city, null);
  assert.equal(data.company.location.address, null);
  assert.equal(data.company.description, null);
  assert.equal(data.company.company_name_en, 'Company Name');
});

test('enterprise mismatch path: SQL always requires enterprise_id bind', () => {
  const binds = buildCompanyInfoBinds(REQ_GUID, 7);
  assert.equal(binds.p_enterprise_id.val, 7);
  assert.notEqual(binds.p_enterprise_id.val, 3);
  assert.match(SELECT_BY_GUID_AND_ENTERPRISE, /AND v\.ENTERPRISE_ID = :p_enterprise_id/);
});

test('handleReadError maps NotFoundError to 404 with project message', () => {
  const res = mockRes();
  handleReadError(res, new NotFoundError(MESSAGES.NOT_FOUND), MESSAGES.READ_ERROR);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, MESSAGES.NOT_FOUND);
});

test('handleReadError maps ValidationError to 400', () => {
  const res = mockRes();
  handleReadError(
    res,
    new ValidationError('Validation failed', [MESSAGES.REQUISITION_GUID_INVALID]),
    MESSAGES.READ_ERROR
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, MESSAGES.REQUISITION_GUID_INVALID);
});

test('handleReadError maps DatabaseError through centralized handler without exposing internals', () => {
  const res = mockRes();
  const err = new DatabaseError(
    MESSAGES.READ_ERROR,
    new Error('ORA-00942: table or view does not exist'),
    MESSAGES.READ_ERROR
  );
  handleReadError(res, err, MESSAGES.READ_ERROR);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, MESSAGES.READ_ERROR);
  assert.equal(JSON.stringify(res.body).includes('ORA-00942'), false);
  assert.equal(JSON.stringify(res.body).includes('SELECT'), false);
});
