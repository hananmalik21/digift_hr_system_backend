import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPayElementRelRuleViewRow } from '../model/payElementRelRulesViewModel.js';
import { buildPayElementRelRuleListWhereClause } from '../utils/payElementRelRulesFilterBuilder.js';
import {
  ALL_ORG_UNITS_DISPLAY,
  isNullOrgUnitId,
  parseOrgUnitHierarchyJson,
  resolveOrgUnitApiFields,
  resolveOrgUnitDisplay
} from '../utils/payElementRelRulesOrgUnitUtils.js';

const SAMPLE_HIERARCHY = Object.freeze([
  { name: 'Digify Solutions', level_code: 'COMPANY' },
  { name: 'Technology Business Unit', level_code: 'BUSINESS_UNIT' },
  { name: 'Software Development', level_code: 'DEPARTMENT' }
]);

const ORG_UNIT_HEX = '4c7f674da954f58fe0633519000ab699';

function baseRuleRow(overrides = {}) {
  return {
    RULE_ID: 10,
    RULE_GUID: '4C7F674DA954F58FE0633519000AB699',
    ELEMENT_ID: 3,
    ELEMENT_GUID: '4C7F674DA954F58FE0633519000A2706',
    ELEMENT_CODE: 'BASIC_SALARY',
    ELEMENT_NAME: 'Basic Salary',
    ENTERPRISE_ID: 1,
    SCOPE_CONFIGURATION_CODE: 'ASSIGNMENT_LEVEL',
    PAYROLL_DISPLAY: 'All',
    GRADE_DISPLAY: 'All',
    POSITION_DISPLAY: 'All',
    ACTIVE_FLAG: 'Y',
    ...overrides
  };
}

test('parseOrgUnitHierarchyJson returns parsed array with name and level_code only', () => {
  const out = parseOrgUnitHierarchyJson(
    JSON.stringify([
      { name: 'Digify Solutions', level_code: 'COMPANY', extra: 'x' },
      { name: 'Technology Business Unit', level_code: 'BUSINESS_UNIT' },
      { NAME: 'Software Development', LEVEL_CODE: 'DEPARTMENT' }
    ])
  );
  assert.deepEqual(out, [...SAMPLE_HIERARCHY]);
});

test('parseOrgUnitHierarchyJson returns [] for null, empty, or invalid JSON', () => {
  assert.deepEqual(parseOrgUnitHierarchyJson(null), []);
  assert.deepEqual(parseOrgUnitHierarchyJson(''), []);
  assert.deepEqual(parseOrgUnitHierarchyJson('[]'), []);
  assert.deepEqual(parseOrgUnitHierarchyJson('{not-json'), []);
  assert.deepEqual(parseOrgUnitHierarchyJson('{"a":1}'), []);
});

test('parseOrgUnitHierarchyJson accepts an already-parsed array', () => {
  assert.deepEqual(parseOrgUnitHierarchyJson([{ name: 'A', level_code: 'COMPANY' }]), [
    { name: 'A', level_code: 'COMPANY' }
  ]);
});

test('isNullOrgUnitId detects null / empty RAW values', () => {
  assert.equal(isNullOrgUnitId(null), true);
  assert.equal(isNullOrgUnitId(undefined), true);
  assert.equal(isNullOrgUnitId(''), true);
  assert.equal(isNullOrgUnitId(Buffer.alloc(0)), true);
  assert.equal(isNullOrgUnitId(Buffer.from(ORG_UNIT_HEX, 'hex')), false);
});

test('resolveOrgUnitDisplay falls back to hierarchy leaf when display is a hex GUID', () => {
  assert.equal(
    resolveOrgUnitDisplay(ORG_UNIT_HEX, SAMPLE_HIERARCHY),
    'Software Development'
  );
  assert.equal(resolveOrgUnitDisplay('Software Development', SAMPLE_HIERARCHY), 'Software Development');
});

test('resolveOrgUnitApiFields maps selected org unit', async () => {
  const fields = await resolveOrgUnitApiFields({
    orgUnitId: Buffer.from(ORG_UNIT_HEX, 'hex'),
    orgUnitGuid: ORG_UNIT_HEX.toUpperCase(),
    orgUnitDisplay: 'Software Development',
    hierarchyJson: JSON.stringify(SAMPLE_HIERARCHY)
  });

  assert.deepEqual(fields, {
    org_unit_guid: ORG_UNIT_HEX,
    org_unit_display: 'Software Development',
    org_unit_hierarchy: [...SAMPLE_HIERARCHY]
  });
});

test('resolveOrgUnitApiFields replaces GUID display with hierarchy leaf name', async () => {
  const fields = await resolveOrgUnitApiFields({
    orgUnitId: Buffer.from(ORG_UNIT_HEX, 'hex'),
    orgUnitGuid: ORG_UNIT_HEX.toUpperCase(),
    orgUnitDisplay: ORG_UNIT_HEX,
    hierarchyJson: JSON.stringify(SAMPLE_HIERARCHY)
  });

  assert.equal(fields.org_unit_display, 'Software Development');
  assert.equal(fields.org_unit_hierarchy.length, 3);
});

test('resolveOrgUnitApiFields treats null ORG_UNIT_ID as All', async () => {
  const fields = await resolveOrgUnitApiFields({
    orgUnitId: null,
    orgUnitGuid: ORG_UNIT_HEX,
    orgUnitDisplay: 'Ignored',
    hierarchyJson: JSON.stringify(SAMPLE_HIERARCHY)
  });

  assert.deepEqual(fields, {
    org_unit_guid: null,
    org_unit_display: ALL_ORG_UNITS_DISPLAY,
    org_unit_hierarchy: []
  });
});

test('mapPayElementRelRuleViewRow maps selected org unit with parsed hierarchy', async () => {
  const mapped = await mapPayElementRelRuleViewRow(
    baseRuleRow({
      ELEMENT_DESCRIPTION: 'Basic salary payroll element',
      CATEGORY_CODE: 'EARNINGS',
      CLASSIFICATION_CODE: 'STANDARD_EARNINGS',
      SCOPE_CONFIGURATION_NAME: 'Assignment Level',
      ORG_UNIT_ID: Buffer.from(ORG_UNIT_HEX, 'hex'),
      ORG_UNIT_GUID: ORG_UNIT_HEX.toUpperCase(),
      ORG_UNIT_DISPLAY: 'Software Development',
      ORG_UNIT_HIERARCHY_JSON: JSON.stringify(SAMPLE_HIERARCHY),
      POSITION_GUID: null,
      CREATED_BY: 'ADMIN',
      CREATION_DATE: new Date('2026-07-14T10:00:00Z'),
      LAST_UPDATED_BY: 'ADMIN',
      LAST_UPDATE_DATE: new Date('2026-07-14T10:00:00Z')
    })
  );

  assert.equal(mapped.org_unit_guid, ORG_UNIT_HEX);
  assert.equal(mapped.org_unit_display, 'Software Development');
  assert.deepEqual(mapped.org_unit_hierarchy, [...SAMPLE_HIERARCHY]);
  assert.equal(mapped.position_guid, null);
  assert.equal(mapped.rule_guid, '4c7f674da954f58fe0633519000ab699');
  assert.equal(Object.hasOwn(mapped, 'org_unit_id'), false);
  assert.equal(Object.hasOwn(mapped, 'org_unit_hierarchy_json'), false);
  assert.ok(Array.isArray(mapped.org_unit_hierarchy));
});

test('mapPayElementRelRuleViewRow treats null ORG_UNIT_ID as All with empty hierarchy', async () => {
  const mapped = await mapPayElementRelRuleViewRow(
    baseRuleRow({
      RULE_ID: 11,
      ORG_UNIT_ID: null,
      ORG_UNIT_GUID: null,
      ORG_UNIT_DISPLAY: null,
      ORG_UNIT_HIERARCHY_JSON: JSON.stringify(SAMPLE_HIERARCHY)
    })
  );

  assert.equal(mapped.org_unit_guid, null);
  assert.equal(mapped.org_unit_display, ALL_ORG_UNITS_DISPLAY);
  assert.deepEqual(mapped.org_unit_hierarchy, []);
});

test('mapPayElementRelRuleViewRow returns [] for invalid hierarchy CLOB without throwing', async () => {
  const mapped = await mapPayElementRelRuleViewRow(
    baseRuleRow({
      RULE_ID: 12,
      ORG_UNIT_ID: Buffer.from(ORG_UNIT_HEX, 'hex'),
      ORG_UNIT_GUID: ORG_UNIT_HEX.toUpperCase(),
      ORG_UNIT_DISPLAY: 'Software Development',
      ORG_UNIT_HIERARCHY_JSON: '{invalid-json'
    })
  );

  assert.equal(mapped.org_unit_guid, ORG_UNIT_HEX);
  assert.deepEqual(mapped.org_unit_hierarchy, []);
});

test('list filter builder still supports enterprise_id, element_id, and active_flag', () => {
  const { whereSql, binds } = buildPayElementRelRuleListWhereClause({
    enterprise_id: 1,
    element_id: 3,
    active_flag: 'Y',
    sort_by: 'element_code',
    sort_order: 'ASC'
  });

  assert.match(whereSql, /v\.ENTERPRISE_ID = :enterprise_id/);
  assert.match(whereSql, /v\.ELEMENT_ID = :element_id/);
  assert.match(whereSql, /UPPER\(v\.ACTIVE_FLAG\) = :active_flag/);
  assert.equal(binds.enterprise_id, 1);
  assert.equal(binds.element_id, 3);
  assert.equal(binds.active_flag, 'Y');
});
