/**
 * Nested element reads + status toggle service.
 */
import {
  getElementByGuid,
  updateElement
} from '../../../pay/elements/services/payElements.service.js';
import { assertEnterpriseAccess, notFoundOutcome, okGet, okList, okMutation } from '../../shared/index.js';
import {
  listElementBalanceFeeds,
  listElementDependencies,
  listElementEligibilityLinks,
  listElementFormulaLinks,
  listElementInputValues,
  listElementRecurringEntries,
  resolveElementByGuid
} from '../model/payElementsNestedModel.js';

/**
 * @param {string} elementGuidHex
 * @param {import('express').Request} req
 * @returns {Promise<{ element: {element_id:number, enterprise_id:number}|null, outcome: object|null }>}
 */
async function resolveElement(elementGuidHex, req) {
  const element = await resolveElementByGuid(elementGuidHex);
  if (!element) {
    return { element: null, outcome: notFoundOutcome('Element not found.') };
  }
  if (req) assertEnterpriseAccess(req, element.enterprise_id);
  return { element, outcome: null };
}

function makeListHandler(loader, successMessage) {
  return async function handler(elementGuidHex, filters, req) {
    const { element, outcome } = await resolveElement(elementGuidHex, req);
    if (!element) return outcome;

    const { data, total, page, pageSize } = await loader(element.element_id, filters);
    return okList(successMessage, data, page, pageSize, total);
  };
}

export const getElementInputValues = makeListHandler(
  listElementInputValues,
  'Element input values retrieved successfully.'
);

export const getElementFormulaLinks = makeListHandler(
  listElementFormulaLinks,
  'Element formula/processing links retrieved successfully.'
);

export const getElementBalanceFeeds = makeListHandler(
  listElementBalanceFeeds,
  'Element balance feeds retrieved successfully.'
);

export const getElementEligibilityLinks = makeListHandler(
  listElementEligibilityLinks,
  'Element eligibility links retrieved successfully.'
);

export const getElementDependencies = makeListHandler(
  listElementDependencies,
  'Element dependencies retrieved successfully.'
);

export const getElementRecurringEntries = makeListHandler(
  listElementRecurringEntries,
  'Element recurring entries retrieved successfully.'
);

/**
 * PATCH /:elementGuid/status
 * PAY.PAY_ELEMENTS has no STATUS column; "status" is modeled as active (no end date)
 * vs. inactive (effective_end_date set), matching the element's own effective dating.
 * @param {string} elementGuidHex
 * @param {{ status: 'ACTIVE'|'INACTIVE', effective_end_date?: string }} body
 * @param {string} actor
 */
export async function updateElementStatus(elementGuidHex, body, actor, req) {
  const existing = await getElementByGuid(elementGuidHex);
  const current = existing?.data;
  if (!current) return notFoundOutcome('Element not found.');
  if (req) assertEnterpriseAccess(req, current.enterprise_id);

  const status = String(body?.status || '').trim().toUpperCase();
  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    return okMutation('status must be ACTIVE or INACTIVE.', null, 400);
  }

  const effectiveEndDate =
    status === 'INACTIVE'
      ? body.effective_end_date || new Date().toISOString().slice(0, 10)
      : null;

  const payload = {
    enterprise_id: current.enterprise_id,
    element_code: current.element_code,
    element_name: current.element_name,
    description: current.description,
    category_code: current.category_code,
    classification_code: current.classification_code,
    secondary_classification: current.secondary_classification,
    legislative_data_group: current.legislative_data_group,
    effective_start_date: current.effective_start_date,
    effective_end_date: effectiveEndDate,
    recurring_flag: current.processing_controls?.recurring_flag,
    costable_flag: current.processing_controls?.costable_flag,
    taxable_flag: current.processing_controls?.taxable_flag,
    pensionable_flag: current.processing_controls?.pensionable_flag,
    retro_enabled_flag: current.processing_controls?.retro_enabled_flag,
    proration_enabled_flag: current.processing_controls?.proration_enabled_flag,
    priority: current.processing_controls?.priority,
    processing_frequency: current.processing_controls?.processing_frequency,
    costing_values: current.costing_values
  };

  const result = await updateElement(elementGuidHex, payload, actor);
  if (result.httpStatus === 404 || !result.success) {
    return okMutation(result.message || 'Unable to update element status.', null, result.httpStatus || 400);
  }

  return okMutation('Element status updated successfully.', {
    element_guid: elementGuidHex,
    status,
    effective_end_date: effectiveEndDate
  });
}
