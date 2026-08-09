/**
 * Payment methods & bank accounts controller.
 *
 * SECURITY: request bodies are never trusted with raw account numbers or IBANs — only
 * masked/token fields (masked_account_number, iban_masked, account_token) are read from the
 * client payload. Any unmasked fields the client sends (e.g. account_number, iban) are ignored.
 */

import {
  assertEnterpriseAccess,
  failOutcome,
  notFoundOutcome,
  okGet,
  okList,
  okMutation,
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
import * as paymentMethodsService from './paymentMethods.service.js';

// --- Payment methods ------------------------------------------------------------------------

export async function listPaymentMethodsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await paymentMethodsService.listPaymentMethods({
      enterpriseId,
      employeeId: req.params.employeeId ? requirePositiveInt(req.params.employeeId, 'employeeId') : null,
      paymentMethodTypeCode: optionalString(req.query.type, 'type'),
      statusCode: optionalString(req.query.status, 'status'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Payment methods retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getPaymentMethodHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.paymentMethodGuid, 'paymentMethodGuid');
    const method = await paymentMethodsService.getPaymentMethodByGuid(guid);
    if (!method) return sendOutcome(res, notFoundOutcome('Payment method not found.'));
    assertEnterpriseAccess(req, method.enterprise_id);
    return sendOutcome(res, okGet('Payment method retrieved successfully.', method));
  });
}

export async function createPaymentMethodHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const employeeId = req.params.employeeId
      ? requirePositiveInt(req.params.employeeId, 'employeeId')
      : requirePositiveInt(req.body.employee_id, 'employee_id');
    requireString(req.body.method_code, 'method_code', { max: 100 });
    requireString(req.body.method_name, 'method_name', { max: 200 });
    requireString(req.body.payment_method_type_code, 'payment_method_type_code', { max: 30 });
    const actor = resolveAuditActor(req);

    const result = await paymentMethodsService.createPaymentMethod(
      { ...req.body, enterprise_id: enterpriseId, employee_id: employeeId },
      actor
    );
    const method = await paymentMethodsService.getPaymentMethodByGuid(result.payment_method_guid);
    return sendOutcome(res, okMutation('Payment method created successfully.', method ?? result, 201));
  });
}

export async function updatePaymentMethodHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.paymentMethodGuid, 'paymentMethodGuid');
    const existing = await paymentMethodsService.getPaymentMethodByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Payment method not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const actor = resolveAuditActor(req);

    const result = await paymentMethodsService.updatePaymentMethod(guid, req.body, actor);
    if (!result.updated) return sendOutcome(res, notFoundOutcome('Payment method not found.'));
    const method = await paymentMethodsService.getPaymentMethodByGuid(guid);
    return sendOutcome(res, okMutation('Payment method updated successfully.', method));
  });
}

export async function deletePaymentMethodHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.paymentMethodGuid, 'paymentMethodGuid');
    const existing = await paymentMethodsService.getPaymentMethodByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Payment method not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);

    const result = await paymentMethodsService.deletePaymentMethod(guid);
    if (!result.deleted) return sendOutcome(res, notFoundOutcome('Payment method not found.'));
    return sendOutcome(res, okMutation('Payment method deleted successfully.', result));
  });
}

// --- Bank accounts --------------------------------------------------------------------------

export async function listBankAccountsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    let paymentMethodId = null;
    let employeeId = null;
    let enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);

    if (req.params.paymentMethodGuid) {
      const method = await paymentMethodsService.getPaymentMethodByGuid(
        parseGuidParam(req.params.paymentMethodGuid, 'paymentMethodGuid')
      );
      if (!method) return sendOutcome(res, notFoundOutcome('Payment method not found.'));
      assertEnterpriseAccess(req, method.enterprise_id);
      paymentMethodId = method.payment_method_id;
      enterpriseId = method.enterprise_id;
    }
    if (req.params.employeeId) {
      employeeId = requirePositiveInt(req.params.employeeId, 'employeeId');
    }
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await paymentMethodsService.listBankAccounts({
      paymentMethodId,
      employeeId,
      enterpriseId,
      statusCode: optionalString(req.query.status, 'status'),
      verificationStatusCode: optionalString(req.query.verification_status, 'verification_status'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Bank accounts retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getBankAccountHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.bankAccountGuid, 'bankAccountGuid');
    const account = await paymentMethodsService.getBankAccountByGuid(guid);
    if (!account) return sendOutcome(res, notFoundOutcome('Bank account not found.'));

    await assertBankAccountEnterpriseAccess(req, account);
    return sendOutcome(res, okGet('Bank account retrieved successfully.', account));
  });
}

/** Bank accounts have no direct enterprise_id column; scope access via their parent payment method. */
async function assertBankAccountEnterpriseAccess(req, account) {
  if (!account?.payment_method_id) return;
  const method = await paymentMethodsService.getPaymentMethodById(account.payment_method_id);
  if (method) assertEnterpriseAccess(req, method.enterprise_id);
}

export async function createBankAccountHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    let method = null;
    if (req.params.paymentMethodGuid) {
      method = await paymentMethodsService.getPaymentMethodByGuid(
        parseGuidParam(req.params.paymentMethodGuid, 'paymentMethodGuid')
      );
    } else if (req.body.payment_method_id || req.body.payment_method_guid) {
      method = req.body.payment_method_guid
        ? await paymentMethodsService.getPaymentMethodByGuid(
            parseGuidParam(req.body.payment_method_guid, 'payment_method_guid')
          )
        : await paymentMethodsService.getPaymentMethodById(
            requirePositiveInt(req.body.payment_method_id, 'payment_method_id')
          );
      if (method && req.params.employeeId) {
        const employeeId = requirePositiveInt(req.params.employeeId, 'employeeId');
        if (Number(method.employee_id) !== employeeId) {
          return sendOutcome(res, failOutcome('Payment method does not belong to this employee.'));
        }
      }
    }
    if (!method) return sendOutcome(res, notFoundOutcome('Payment method not found.'));
    assertEnterpriseAccess(req, method.enterprise_id);

    requireString(req.body.masked_account_number, 'masked_account_number', { max: 100 });
    requireString(req.body.account_holder_name, 'account_holder_name', { max: 200 });
    requireString(req.body.bank_name, 'bank_name', { max: 200 });
    const actor = resolveAuditActor(req);

    const result = await paymentMethodsService.createBankAccount(
      { ...req.body, payment_method_id: method.payment_method_id },
      actor
    );
    const account = await paymentMethodsService.getBankAccountByGuid(result.bank_account_guid);
    return sendOutcome(res, okMutation('Bank account created successfully.', account ?? result, 201));
  });
}

export async function setPrimaryPaymentMethodHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(
      req.params.paymentMethodGuid || req.params.paymentMethodId,
      'paymentMethodGuid'
    );
    const existing = await paymentMethodsService.getPaymentMethodByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Payment method not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const actor = resolveAuditActor(req);
    await paymentMethodsService.setPrimaryPaymentMethod(guid, actor);
    const method = await paymentMethodsService.getPaymentMethodByGuid(guid);
    return sendOutcome(res, okMutation('Primary payment method updated successfully.', method));
  });
}

export async function setBankAccountStatusHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(
      req.params.bankAccountGuid || req.params.bankAccountId,
      'bankAccountGuid'
    );
    const existing = await paymentMethodsService.getBankAccountByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Bank account not found.'));
    await assertBankAccountEnterpriseAccess(req, existing);
    const statusCode = requireString(req.body.status_code || req.body.status, 'status_code', {
      max: 30
    });
    const actor = resolveAuditActor(req);
    const result = await paymentMethodsService.updateBankAccount(guid, { status_code: statusCode }, actor);
    if (!result.updated) return sendOutcome(res, notFoundOutcome('Bank account not found.'));
    const account = await paymentMethodsService.getBankAccountByGuid(guid);
    return sendOutcome(res, okMutation('Bank account status updated successfully.', account));
  });
}

export async function updateBankAccountHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.bankAccountGuid, 'bankAccountGuid');
    const existing = await paymentMethodsService.getBankAccountByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Bank account not found.'));
    await assertBankAccountEnterpriseAccess(req, existing);
    const actor = resolveAuditActor(req);

    const result = await paymentMethodsService.updateBankAccount(guid, req.body, actor);
    if (!result.updated) return sendOutcome(res, notFoundOutcome('Bank account not found.'));
    const account = await paymentMethodsService.getBankAccountByGuid(guid);
    return sendOutcome(res, okMutation('Bank account updated successfully.', account));
  });
}

export async function setBankAccountVerificationHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.bankAccountGuid, 'bankAccountGuid');
    const existing = await paymentMethodsService.getBankAccountByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Bank account not found.'));
    await assertBankAccountEnterpriseAccess(req, existing);
    const verificationStatusCode = requireString(req.body.verification_status_code, 'verification_status_code', { max: 30 });
    const actor = resolveAuditActor(req);

    const result = await paymentMethodsService.setBankAccountVerificationStatus(guid, verificationStatusCode, actor);
    if (!result.updated) return sendOutcome(res, notFoundOutcome('Bank account not found.'));
    const account = await paymentMethodsService.getBankAccountByGuid(guid);
    return sendOutcome(res, okMutation('Bank account verification status updated successfully.', account));
  });
}

export async function deleteBankAccountHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.bankAccountGuid, 'bankAccountGuid');
    const existing = await paymentMethodsService.getBankAccountByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Bank account not found.'));
    await assertBankAccountEnterpriseAccess(req, existing);

    const result = await paymentMethodsService.deleteBankAccount(guid);
    if (!result.deleted) return sendOutcome(res, notFoundOutcome('Bank account not found.'));
    return sendOutcome(res, okMutation('Bank account deleted successfully.', result));
  });
}

// Reject any attempt to submit raw/unmasked financial fields explicitly, returning a clear error
// rather than silently dropping sensitive data the client believes was stored.
const FORBIDDEN_ACCOUNT_FIELDS = ['account_number', 'iban', 'full_account_number', 'card_number', 'cvv'];

export function rejectUnmaskedFieldsMiddleware(req, res, next) {
  const body = req.body || {};
  const offending = FORBIDDEN_ACCOUNT_FIELDS.filter((field) => body[field] != null);
  if (offending.length) {
    return sendOutcome(
      res,
      failOutcome(
        `Unmasked financial fields are not accepted: ${offending.join(', ')}. Provide masked_account_number, iban_masked, and/or account_token instead.`
      )
    );
  }
  return next();
}
