/**
 * Element dependencies controller.
 * No create/update/delete package exists — the dependency graph is (re)computed by
 * PAY_ELEMENT_DEPENDENCY_PKG.REFRESH_DEPENDENCIES, so direct CRUD is rejected.
 */

import {
  assertEnterpriseAccess,
  failOutcome,
  notFoundOutcome,
  okGet,
  okList,
  okMutation,
  optionalPositiveInt,
  optionalString,
  parseGuidParam,
  parsePaginationQuery,
  requireDate,
  resolveAuditActor,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../shared/index.js';
import * as dependenciesService from './elementDependencies.service.js';

const CRUD_NOT_SUPPORTED_MESSAGE =
  'Element dependencies are maintained by PAY_ELEMENT_DEPENDENCY_PKG.REFRESH_DEPENDENCIES; direct CRUD is not supported.';

export async function listDependenciesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await dependenciesService.listDependencies({
      enterpriseId,
      producerElementId: optionalPositiveInt(req.query.producer_element_id ?? req.query.element_id, 'element_id'),
      consumerElementId: optionalPositiveInt(req.query.consumer_element_id, 'consumer_element_id'),
      balanceId: optionalPositiveInt(req.query.balance_id, 'balance_id'),
      validationStatusCode: optionalString(req.query.status, 'status'),
      search: optionalString(req.query.search, 'search'),
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      page,
      pageSize
    });

    return sendOutcome(res, okList('Element dependencies retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getDependencyHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.dependencyGuid, 'dependencyGuid');
    const dependency = await dependenciesService.getDependencyByGuid(guid);
    if (!dependency) return sendOutcome(res, notFoundOutcome('Element dependency not found.'));
    assertEnterpriseAccess(req, dependency.enterprise_id);
    return sendOutcome(res, okGet('Element dependency retrieved successfully.', dependency));
  });
}

export async function rejectDependencyCrudHandler(req, res) {
  return sendOutcome(res, failOutcome(CRUD_NOT_SUPPORTED_MESSAGE, 400));
}

export async function validateDependenciesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const effectiveAsOfDate = req.body.effective_as_of_date
      ? requireDate(req.body.effective_as_of_date, 'effective_as_of_date')
      : new Date();
    const actor = resolveAuditActor(req);

    const outcome = await dependenciesService.validateDependencies(enterpriseId, effectiveAsOfDate, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message, 400, outcome.data));
    return sendOutcome(res, okMutation(outcome.message, outcome.data));
  });
}

export async function refreshDependenciesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const effectiveAsOfDate = req.body.effective_as_of_date
      ? requireDate(req.body.effective_as_of_date, 'effective_as_of_date')
      : new Date();
    const actor = resolveAuditActor(req);

    const outcome = await dependenciesService.refreshDependencies(enterpriseId, effectiveAsOfDate, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message, 400, outcome.data));
    return sendOutcome(res, okMutation(outcome.message, outcome.data));
  });
}
