import { AppError } from '../../../../utils/errors/index.js';
import {
  DEFAULT_PROBATION_DAYS,
  DEFAULT_SEND_NOTIFICATION,
  DEFAULT_TRIGGER_ONBOARDING,
  EMPLOYEE_CREATED_IN_HR_NOTE,
  NOTIFICATION_STATUS_FAILED,
  NOTIFICATION_STATUS_SENT,
  ONBOARDING_STATUS_FAILED,
  ONBOARDING_STATUS_TRIGGERED,
  TRANSFER_LOG_TAG,
  VALIDATE_SUCCESS_MESSAGE
} from '../utils/recCandidateConversionConstants.js';
import { createLoggedOp } from '../utils/recCandidateConversionLog.js';
import { mapTransferOracleError } from '../utils/recCandidateConversionOracleErrors.js';
import {
  mapTransferSuccessData,
  transferSuccessMessage
} from '../utils/recCandidateConversionResponses.js';
import { listConfiguredHrContacts } from '../utils/recCandidateTransferHrContacts.js';
import {
  candidateExistsByGuid,
  getTransferContextForCandidate,
  listTransferHistoryForCandidate,
  loadTransferDetailsSource,
  transferToHrViaPackage,
  updateTransferActionStatusViaPackage,
  validateConversionViaPackage
} from '../model/recCandidateConversionModel.js';
import {
  requireAcceptedOfferGuid,
  requireCandidateExists
} from './recCandidateConversionService.js';
import {
  sanitizeTransferSideEffectMessage,
  sendTransferNotification
} from './recCandidateTransferNotification.js';
import { triggerCandidateOnboarding } from './recCandidateTransferOnboarding.js';

const { log: logTransfer, runLoggedOp } = createLoggedOp(
  TRANSFER_LOG_TAG,
  mapTransferOracleError
);

async function persistActionStatus(updateStatus, params) {
  try {
    await updateStatus(params);
  } catch (err) {
    const mapped = err instanceof AppError ? err : mapTransferOracleError(err);
    logTransfer('UPDATE_TRANSFER_ACTION_STATUS', {
      success: false,
      transfer_id: params.transfer_id,
      actor: params.actor,
      code: mapped.code
    });
  }
}

async function runPostCommitAction({
  requested,
  successStatus,
  failureStatus,
  run,
  after
}) {
  if (!requested) {
    return { status: null, reference: null, success: null };
  }

  let result;
  try {
    result = await run();
  } catch (err) {
    result = { success: false, error: sanitizeTransferSideEffectMessage(err) };
  }

  const status = result.success ? successStatus : failureStatus;
  const reference = result.reference ?? null;
  await after(result, status, reference);
  return { status, reference, success: result.success, error: result.error };
}

function mapValidation(pkg) {
  return {
    can_transfer: pkg.can_convert,
    message: pkg.message || (pkg.can_convert ? VALIDATE_SUCCESS_MESSAGE : '')
  };
}

async function resolveTransferDetails(candidateGuidHex, deps) {
  if (deps.getContext || deps.validate) {
    const context = await (deps.getContext ?? getTransferContextForCandidate)(candidateGuidHex);
    const offerGuid = requireAcceptedOfferGuid(context);
    const pkg = await (deps.validate ?? validateConversionViaPackage)(offerGuid);
    return { context, offerGuid, pkg };
  }

  const loaded = await loadTransferDetailsSource(candidateGuidHex);
  const offerGuid = requireAcceptedOfferGuid(loaded);
  return { context: loaded, offerGuid, pkg: loaded.validation };
}

/**
 * GET Transfer to HR modal payload: candidate, offer, VALIDATE_CONVERSION, defaults, HR contacts.
 *
 * @param {string} candidateGuidHex
 * @param {string} actor
 * @param {{
 *   getContext?: typeof getTransferContextForCandidate,
 *   validate?: typeof validateConversionViaPackage,
 *   listHrContacts?: typeof listConfiguredHrContacts
 * }} [deps]
 */
export async function getTransferToHrDetails(candidateGuidHex, actor, deps = {}) {
  const listHrContacts = deps.listHrContacts ?? listConfiguredHrContacts;

  return runLoggedOp(
    'TRANSFER_TO_HR_DETAILS',
    { candidate_guid: candidateGuidHex, actor },
    async () => {
      const { context, offerGuid, pkg } = await resolveTransferDetails(candidateGuidHex, deps);
      return {
        result: {
          candidate_guid: candidateGuidHex,
          offer_guid: offerGuid,
          candidate: { name: context.candidateName || null },
          offer: context.offer,
          validation: mapValidation(pkg),
          defaults: {
            probation_days: DEFAULT_PROBATION_DAYS,
            send_notification: DEFAULT_SEND_NOTIFICATION,
            trigger_onboarding: DEFAULT_TRIGGER_ONBOARDING
          },
          hr_contacts: listHrContacts(),
          note: EMPLOYEE_CREATED_IN_HR_NOTE
        },
        extraLog: { offer_guid: offerGuid, can_transfer: pkg.can_convert }
      };
    }
  );
}

/**
 * POST Transfer to HR: package write, then optional email/onboarding status updates.
 *
 * @param {string} candidateGuidHex
 * @param {string} actor
 * @param {{
 *   probation_days: number,
 *   hr_contact_id: string|null,
 *   transfer_notes: string|null,
 *   send_notification: boolean,
 *   trigger_onboarding: boolean
 * }} payload
 * @param {{
 *   getContext?: typeof getTransferContextForCandidate,
 *   transfer?: typeof transferToHrViaPackage,
 *   sendNotification?: typeof sendTransferNotification,
 *   triggerOnboarding?: typeof triggerCandidateOnboarding,
 *   updateStatus?: typeof updateTransferActionStatusViaPackage
 * }} [deps]
 */
export async function transferCandidateToHr(candidateGuidHex, actor, payload, deps = {}) {
  const getContext = deps.getContext ?? getTransferContextForCandidate;
  const transfer = deps.transfer ?? transferToHrViaPackage;
  const sendNotification = deps.sendNotification ?? sendTransferNotification;
  const triggerOnboarding = deps.triggerOnboarding ?? triggerCandidateOnboarding;
  const updateStatus = deps.updateStatus ?? updateTransferActionStatusViaPackage;

  const context = await runLoggedOp(
    'TRANSFER_TO_HR_LOOKUP',
    { candidate_guid: candidateGuidHex, actor },
    async () => {
      const resolved = await getContext(candidateGuidHex);
      return {
        result: { context: resolved, offerGuid: requireAcceptedOfferGuid(resolved) }
      };
    }
  );
  const { offerGuid } = context;
  const offerContext = context.context;

  const pkg = await runLoggedOp(
    'TRANSFER_TO_HR',
    { candidate_guid: candidateGuidHex, offer_guid: offerGuid, actor },
    async () => {
      const out = await transfer({
        offer_guid: offerGuid,
        actor,
        probation_days: payload.probation_days,
        hr_contact_id: payload.hr_contact_id,
        transfer_notes: payload.transfer_notes,
        send_notification: payload.send_notification,
        trigger_onboarding: payload.trigger_onboarding
      });
      return {
        result: out,
        extraLog: {
          employee_id: out.employee_id,
          assignment_id: out.assignment_id,
          transfer_id: out.transfer_id
        }
      };
    }
  );

  const audit = {
    candidate_guid: candidateGuidHex,
    offer_guid: offerGuid,
    transfer_id: pkg.transfer_id,
    employee_id: pkg.employee_id,
    assignment_id: pkg.assignment_id,
    actor
  };

  const notification = await runPostCommitAction({
    requested: payload.send_notification,
    successStatus: NOTIFICATION_STATUS_SENT,
    failureStatus: NOTIFICATION_STATUS_FAILED,
    run: () =>
      sendNotification({
        hrContactId: payload.hr_contact_id,
        candidateGuid: candidateGuidHex,
        candidateName: offerContext.candidateName,
        offerGuid,
        offerNumber: offerContext.offer?.offer_number,
        jobTitle: offerContext.offer?.job_title,
        startDate: offerContext.offer?.start_date,
        employeeNumber: pkg.employee_number,
        transferNotes: payload.transfer_notes
      }),
    after: async (result, status) => {
      logTransfer('TRANSFER_NOTIFICATION', {
        ...audit,
        success: result.success,
        notification_status: status
      });
      await persistActionStatus(updateStatus, {
        transfer_id: pkg.transfer_id,
        actor,
        notification_status: status,
        notification_message: result.success
          ? null
          : sanitizeTransferSideEffectMessage(result.error)
      });
    }
  });

  const onboarding = await runPostCommitAction({
    requested: payload.trigger_onboarding,
    successStatus: ONBOARDING_STATUS_TRIGGERED,
    failureStatus: ONBOARDING_STATUS_FAILED,
    run: () =>
      triggerOnboarding({
        candidate_guid: candidateGuidHex,
        offer_guid: offerGuid,
        employee_id: pkg.employee_id,
        employee_guid: pkg.employee_guid,
        assignment_id: pkg.assignment_id,
        assignment_guid: pkg.assignment_guid,
        transfer_id: pkg.transfer_id,
        actor
      }),
    after: async (result, status, reference) => {
      logTransfer('TRANSFER_ONBOARDING', {
        ...audit,
        success: result.success,
        onboarding_status: status,
        onboarding_reference: reference
      });
      await persistActionStatus(updateStatus, {
        transfer_id: pkg.transfer_id,
        actor,
        onboarding_status: status,
        onboarding_reference: reference
      });
    }
  });

  logTransfer('TRANSFER_TO_HR_COMPLETE', {
    ...audit,
    notification_status: notification.status,
    onboarding_status: onboarding.status
  });

  const sideEffects = {
    send_notification: payload.send_notification,
    trigger_onboarding: payload.trigger_onboarding,
    notification_status: notification.status,
    onboarding_status: onboarding.status,
    onboarding_reference: onboarding.reference
  };

  return {
    message: transferSuccessMessage(sideEffects),
    data: mapTransferSuccessData(candidateGuidHex, offerGuid, pkg, sideEffects)
  };
}

/**
 * @param {string} candidateGuidHex
 * @param {string} actor
 * @param {{
 *   getContext?: (guid: string) => Promise<{ candidateExists: boolean }>,
 *   listHistory?: typeof listTransferHistoryForCandidate
 * }} [deps]
 */
export async function getCandidateTransferHistory(candidateGuidHex, actor, deps = {}) {
  const listHistory = deps.listHistory ?? listTransferHistoryForCandidate;

  return runLoggedOp(
    'TRANSFER_HISTORY',
    { candidate_guid: candidateGuidHex, actor },
    async () => {
      if (deps.getContext) {
        requireCandidateExists(await deps.getContext(candidateGuidHex));
      } else if (!(await candidateExistsByGuid(candidateGuidHex))) {
        requireCandidateExists({ candidateExists: false });
      }
      const rows = await listHistory(candidateGuidHex);
      return { result: rows, extraLog: { count: rows.length } };
    }
  );
}
