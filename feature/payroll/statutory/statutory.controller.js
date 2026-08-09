/**
 * Statutory processing controller.
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
  requirePositiveInt,
  requireString,
  resolveAuditActor,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../shared/index.js';
import * as statutoryService from './statutory.service.js';

// --- Regimes ----------------------------------------------------------------------------

export async function listRegimesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await statutoryService.listRegimes({
      enterpriseId,
      jurisdictionCode: optionalString(req.query.jurisdiction_code, 'jurisdiction_code'),
      taxYear: optionalPositiveInt(req.query.tax_year, 'tax_year'),
      statusCode: optionalString(req.query.status, 'status'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Statutory regimes retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getRegimeHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.regimeGuid, 'regimeGuid');
    const regime = await statutoryService.getRegimeByGuid(guid);
    if (!regime) return sendOutcome(res, notFoundOutcome('Statutory regime not found.'));
    assertEnterpriseAccess(req, regime.enterprise_id);
    return sendOutcome(res, okGet('Statutory regime retrieved successfully.', regime));
  });
}

export async function createRegimeHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    requireString(req.body.jurisdiction_code, 'jurisdiction_code', { max: 100 });
    requireString(req.body.regime_code, 'regime_code', { max: 100 });
    requireString(req.body.regime_name, 'regime_name', { max: 300 });
    requirePositiveInt(req.body.tax_year, 'tax_year');
    requireString(req.body.currency_code, 'currency_code', { max: 10 });
    const actor = resolveAuditActor(req);

    const result = await statutoryService.createRegime({ ...req.body, enterprise_id: enterpriseId }, actor);
    const regime = await statutoryService.getRegimeByGuid(result.statutory_regime_guid);
    return sendOutcome(res, okMutation('Statutory regime created successfully.', regime ?? result, 201));
  });
}

export async function updateRegimeHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.regimeGuid, 'regimeGuid');
    const existing = await statutoryService.getRegimeByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Statutory regime not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const actor = resolveAuditActor(req);

    const result = await statutoryService.updateRegime(guid, req.body, actor);
    if (!result.updated) return sendOutcome(res, notFoundOutcome('Statutory regime not found.'));
    const regime = await statutoryService.getRegimeByGuid(guid);
    return sendOutcome(res, okMutation('Statutory regime updated successfully.', regime));
  });
}

// --- Rules ------------------------------------------------------------------------------

export async function listRulesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await statutoryService.listRules({
      statutoryRegimeId: optionalPositiveInt(req.query.statutory_regime_id, 'statutory_regime_id'),
      ruleClassCode: optionalString(req.query.rule_class, 'rule_class'),
      activeFlag: optionalString(req.query.active_flag, 'active_flag'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Statutory rules retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getRuleHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.ruleGuid, 'ruleGuid');
    const rule = await statutoryService.getRuleByGuid(guid);
    if (!rule) return sendOutcome(res, notFoundOutcome('Statutory rule not found.'));
    return sendOutcome(res, okGet('Statutory rule retrieved successfully.', rule));
  });
}

export async function createRuleHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    requirePositiveInt(req.body.statutory_regime_id, 'statutory_regime_id');
    requireString(req.body.rule_code, 'rule_code', { max: 100 });
    requireString(req.body.rule_name, 'rule_name', { max: 300 });
    requireString(req.body.rule_class_code, 'rule_class_code', { max: 50 });
    requireString(req.body.source_element_code, 'source_element_code', { max: 100 });
    const actor = resolveAuditActor(req);

    const result = await statutoryService.createRule(req.body, actor);
    const rule = await statutoryService.getRuleByGuid(result.statutory_rule_guid);
    return sendOutcome(res, okMutation('Statutory rule created successfully.', rule ?? result, 201));
  });
}

export async function updateRuleHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.ruleGuid, 'ruleGuid');
    const existing = await statutoryService.getRuleByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Statutory rule not found.'));
    const actor = resolveAuditActor(req);

    const result = await statutoryService.updateRule(guid, req.body, actor);
    if (!result.updated) return sendOutcome(res, notFoundOutcome('Statutory rule not found.'));
    const rule = await statutoryService.getRuleByGuid(guid);
    return sendOutcome(res, okMutation('Statutory rule updated successfully.', rule));
  });
}

// --- Run processing / results ------------------------------------------------------------

export async function processRunHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const runId = requirePositiveInt(req.params.runId, 'runId');
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const regimeCode = requireString(req.body.regime_code, 'regime_code', { max: 100 });
    const actor = resolveAuditActor(req);

    const outcome = await statutoryService.processRun(enterpriseId, runId, regimeCode, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data, 201));
  });
}

export async function listRunResultsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await statutoryService.listRunResults({
      enterpriseId,
      runId: req.params.runId ? requirePositiveInt(req.params.runId, 'runId') : optionalPositiveInt(req.query.run_id, 'run_id'),
      employeeId: req.params.employeeId
        ? requirePositiveInt(req.params.employeeId, 'employeeId')
        : optionalPositiveInt(req.query.employee_id, 'employee_id'),
      statutoryRegimeId: optionalPositiveInt(req.query.statutory_regime_id, 'statutory_regime_id'),
      taxYear: optionalPositiveInt(req.query.tax_year, 'tax_year'),
      ruleClassCode: optionalString(req.query.rule_class, 'rule_class'),
      statusCode: optionalString(req.query.status, 'status'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Statutory results retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getRunResultHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const resultId = requirePositiveInt(req.params.resultId, 'resultId');
    const result = await statutoryService.getRunResultById(resultId);
    if (!result) return sendOutcome(res, notFoundOutcome('Statutory result not found.'));
    assertEnterpriseAccess(req, result.enterprise_id);
    return sendOutcome(res, okGet('Statutory result retrieved successfully.', result));
  });
}

// --- Filings ----------------------------------------------------------------------------

export async function createFilingHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const runId = requirePositiveInt(req.params.runId, 'runId');
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const regimeCode = requireString(req.body.regime_code, 'regime_code', { max: 100 });
    const actor = resolveAuditActor(req);

    const outcome = await statutoryService.createFiling(enterpriseId, runId, regimeCode, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));

    const filing = await statutoryService.getFilingById(outcome.data.statutory_filing_id);
    return sendOutcome(res, okMutation(outcome.message, filing ?? outcome.data, 201));
  });
}

export async function listFilingsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await statutoryService.listFilings({
      enterpriseId,
      runId: optionalPositiveInt(req.query.run_id, 'run_id'),
      statutoryRegimeId: optionalPositiveInt(req.query.statutory_regime_id, 'statutory_regime_id'),
      taxYear: optionalPositiveInt(req.query.tax_year, 'tax_year'),
      statusCode: optionalString(req.query.status, 'status'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Statutory filings retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getFilingHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const filingId = requirePositiveInt(req.params.filingId, 'filingId');
    const filing = await statutoryService.getFilingById(filingId);
    if (!filing) return sendOutcome(res, notFoundOutcome('Statutory filing not found.'));
    assertEnterpriseAccess(req, filing.enterprise_id);
    return sendOutcome(res, okGet('Statutory filing retrieved successfully.', filing));
  });
}

export async function validateFilingHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const filingId = requirePositiveInt(req.params.filingId, 'filingId');
    const filing = await statutoryService.getFilingById(filingId);
    if (!filing) return sendOutcome(res, notFoundOutcome('Statutory filing not found.'));
    assertEnterpriseAccess(req, filing.enterprise_id);
    const actor = resolveAuditActor(req);

    const outcome = await statutoryService.validateFiling(filing.enterprise_id, filingId, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    const updated = await statutoryService.getFilingById(filingId);
    return sendOutcome(res, okMutation(outcome.message, updated));
  });
}

export async function fileFilingHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const filingId = requirePositiveInt(req.params.filingId, 'filingId');
    const filing = await statutoryService.getFilingById(filingId);
    if (!filing) return sendOutcome(res, notFoundOutcome('Statutory filing not found.'));
    assertEnterpriseAccess(req, filing.enterprise_id);
    const filingReference = requireString(req.body.filing_reference, 'filing_reference', { max: 200 });
    const actor = resolveAuditActor(req);

    const outcome = await statutoryService.fileFiling(filing.enterprise_id, filingId, filingReference, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    const updated = await statutoryService.getFilingById(filingId);
    return sendOutcome(res, okMutation(outcome.message, updated));
  });
}

export async function acceptFilingHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const filingId = requirePositiveInt(req.params.filingId, 'filingId');
    const filing = await statutoryService.getFilingById(filingId);
    if (!filing) return sendOutcome(res, notFoundOutcome('Statutory filing not found.'));
    assertEnterpriseAccess(req, filing.enterprise_id);
    const acceptanceReference = requireString(req.body.acceptance_reference, 'acceptance_reference', { max: 200 });
    const actor = resolveAuditActor(req);

    const outcome = await statutoryService.acceptFiling(filing.enterprise_id, filingId, acceptanceReference, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    const updated = await statutoryService.getFilingById(filingId);
    return sendOutcome(res, okMutation(outcome.message, updated));
  });
}

// --- Certificates -------------------------------------------------------------------------

export async function generateCertificateHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    requireString(req.body.regime_code, 'regime_code', { max: 100 });
    requirePositiveInt(req.body.tax_year, 'tax_year');
    requirePositiveInt(req.body.employee_id, 'employee_id');
    const actor = resolveAuditActor(req);

    const outcome = await statutoryService.generateYearEndCertificate({ ...req.body, enterprise_id: enterpriseId }, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));

    const certificate = await statutoryService.getCertificateById(outcome.data.certificate_id);
    return sendOutcome(res, okMutation(outcome.message, certificate ?? outcome.data, 201));
  });
}

export async function listCertificatesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await statutoryService.listCertificates({
      enterpriseId,
      employeeId: req.params.employeeId
        ? requirePositiveInt(req.params.employeeId, 'employeeId')
        : optionalPositiveInt(req.query.employee_id, 'employee_id'),
      statutoryRegimeId: optionalPositiveInt(req.query.statutory_regime_id, 'statutory_regime_id'),
      taxYear: optionalPositiveInt(req.query.tax_year, 'tax_year'),
      statusCode: optionalString(req.query.status, 'status'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Statutory certificates retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getCertificateHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const certificateId = requirePositiveInt(req.params.certificateId, 'certificateId');
    const certificate = await statutoryService.getCertificateById(certificateId);
    if (!certificate) return sendOutcome(res, notFoundOutcome('Statutory certificate not found.'));
    assertEnterpriseAccess(req, certificate.enterprise_id);
    return sendOutcome(res, okGet('Statutory certificate retrieved successfully.', certificate));
  });
}

export async function publishCertificateHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const certificateId = requirePositiveInt(req.params.certificateId, 'certificateId');
    const certificate = await statutoryService.getCertificateById(certificateId);
    if (!certificate) return sendOutcome(res, notFoundOutcome('Statutory certificate not found.'));
    assertEnterpriseAccess(req, certificate.enterprise_id);
    const actor = resolveAuditActor(req);

    const outcome = await statutoryService.publishCertificate(certificate.enterprise_id, certificateId, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    const updated = await statutoryService.getCertificateById(certificateId);
    return sendOutcome(res, okMutation(outcome.message, updated));
  });
}

// --- Amendments ---------------------------------------------------------------------------

export async function createAmendmentHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    requirePositiveInt(req.body.statutory_result_id, 'statutory_result_id');
    if (req.body.adjustment_amount == null || Number.isNaN(Number(req.body.adjustment_amount))) {
      return sendOutcome(res, failOutcome('adjustment_amount is required and must be numeric.'));
    }
    requireString(req.body.reason, 'reason', { max: 4000 });
    const actor = resolveAuditActor(req);

    const outcome = await statutoryService.createAmendment({ ...req.body, enterprise_id: enterpriseId }, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));

    const amendment = await statutoryService.getAmendmentById(outcome.data.amendment_id);
    return sendOutcome(res, okMutation(outcome.message, amendment ?? outcome.data, 201));
  });
}

export async function listAmendmentsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await statutoryService.listAmendments({
      enterpriseId,
      runId: optionalPositiveInt(req.query.run_id, 'run_id'),
      employeeId: optionalPositiveInt(req.query.employee_id, 'employee_id'),
      statutoryResultId: optionalPositiveInt(req.query.statutory_result_id, 'statutory_result_id'),
      statusCode: optionalString(req.query.status, 'status'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Statutory amendments retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getAmendmentHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const amendmentId = requirePositiveInt(req.params.amendmentId, 'amendmentId');
    const amendment = await statutoryService.getAmendmentById(amendmentId);
    if (!amendment) return sendOutcome(res, notFoundOutcome('Statutory amendment not found.'));
    assertEnterpriseAccess(req, amendment.enterprise_id);
    return sendOutcome(res, okGet('Statutory amendment retrieved successfully.', amendment));
  });
}

export async function approveAmendmentHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const amendmentId = requirePositiveInt(req.params.amendmentId, 'amendmentId');
    const amendment = await statutoryService.getAmendmentById(amendmentId);
    if (!amendment) return sendOutcome(res, notFoundOutcome('Statutory amendment not found.'));
    assertEnterpriseAccess(req, amendment.enterprise_id);
    const actor = resolveAuditActor(req);

    const outcome = await statutoryService.approveAmendment(amendment.enterprise_id, amendmentId, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    const updated = await statutoryService.getAmendmentById(amendmentId);
    return sendOutcome(res, okMutation(outcome.message, updated));
  });
}

export async function reverseAmendmentHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const amendmentId = requirePositiveInt(req.params.amendmentId, 'amendmentId');
    const amendment = await statutoryService.getAmendmentById(amendmentId);
    if (!amendment) return sendOutcome(res, notFoundOutcome('Statutory amendment not found.'));
    assertEnterpriseAccess(req, amendment.enterprise_id);
    const reversalReason = requireString(req.body.reversal_reason, 'reversal_reason', { max: 4000 });
    const actor = resolveAuditActor(req);

    const outcome = await statutoryService.reverseAmendment(amendment.enterprise_id, amendmentId, reversalReason, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    const updated = await statutoryService.getAmendmentById(amendmentId);
    return sendOutcome(res, okMutation(outcome.message, updated));
  });
}

// --- Audit ----------------------------------------------------------------------------------

export async function listAuditHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await statutoryService.listAudit({
      enterpriseId,
      objectTypeCode: optionalString(req.query.object_type, 'object_type'),
      objectId: optionalPositiveInt(req.query.object_id, 'object_id'),
      actionCode: optionalString(req.query.action, 'action'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Statutory audit log retrieved successfully.', data, page, pageSize, total));
  });
}
