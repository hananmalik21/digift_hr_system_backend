/**
 * Map Oracle rows / plans_json CLOB to API response shape.
 */

import { normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import { pickSnakeCaseFields } from '../../utils/pickSnakeCaseFields.js';
import {
  oracleTextToString,
  parseJsonLoose
} from '../../employee_compensation/utils/oracleCompensationRead.js';
import { rowKeysUpper } from '../../salary_structures/utils/rowKeysUpper.js';

const PLAN_FIELDS = Object.freeze([
  'plan_id',
  'plan_code',
  'plan_name',
  'plan_type_code',
  'plan_guid'
]);

const COMPONENT_FIELDS = Object.freeze([
  'component_id',
  'component_code',
  'component_name',
  'frequency_code'
]);

/**
 * @param {unknown} raw
 * @returns {object[]}
 */
function normalizeComponents(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item != null && typeof item === 'object')
    .map((item) => pickSnakeCaseFields(item, COMPONENT_FIELDS));
}

/**
 * @param {unknown} raw
 * @returns {object[]}
 */
function normalizePlans(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item != null && typeof item === 'object')
    .map((plan) => {
      const base = pickSnakeCaseFields(plan, PLAN_FIELDS);
      const componentsRaw =
        plan.components ?? plan.COMPONENTS ?? plan.components_json ?? plan.COMPONENTS_JSON;
      return {
        ...base,
        components: normalizeComponents(componentsRaw)
      };
    })
    .sort((a, b) => Number(a.plan_id ?? 0) - Number(b.plan_id ?? 0));
}

/**
 * @param {unknown} plansJson
 * @returns {Promise<object[]>}
 */
export async function parsePlansJsonColumn(plansJson) {
  if (plansJson == null) return [];

  if (Array.isArray(plansJson)) {
    return normalizePlans(plansJson);
  }

  const text =
    typeof plansJson === 'string' ? plansJson : await oracleTextToString(plansJson);
  const parsed = parseJsonLoose(text);

  if (Array.isArray(parsed)) return normalizePlans(parsed);
  return [];
}

/**
 * @param {object} row - Oracle OUT_FORMAT_OBJECT row
 * @returns {Promise<object|null>}
 */
export async function mapEligiblePlansRow(row) {
  const r = rowKeysUpper(row);
  const employeeId = r.EMPLOYEE_ID;
  const enterpriseId = r.ENTERPRISE_ID;
  const guidHex = normalizeApiGuidString(r.EMPLOYEE_GUID);

  if (employeeId == null || !guidHex) return null;

  const plans = await parsePlansJsonColumn(r.PLANS_JSON);

  return {
    employee_id: employeeId,
    employee_guid: guidHex,
    enterprise_id: enterpriseId,
    plans
  };
}

/**
 * @param {object[]} rows
 * @returns {Promise<object[]>}
 */
export async function mapEligiblePlansRows(rows) {
  const mapped = await Promise.all(rows.map((row) => mapEligiblePlansRow(row)));
  return mapped.filter(Boolean);
}
