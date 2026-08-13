/**
 * Map known PAY Oracle application errors to clear API messages.
 */

export const TRANSFER_BATCH_PERIOD_CONFLICT_MESSAGE =
  'A transfer batch already exists for this enterprise, payroll, and period.';

const MESSAGE_MAP = [
  [/duplicate.*payroll run/i, 'Duplicate payroll run.'],
  [/duplicate.*recurring/i, 'Duplicate recurring entry generation.'],
  [/not eligible/i, 'Employee is not eligible.'],
  [/already finalized/i, 'Payroll run is already finalized.'],
  [/cannot be rolled back.*payment/i, 'Payroll run cannot be rolled back after payment issue.'],
  [/requires approval/i, 'Payment batch requires approval.'],
  [/not balanced/i, 'Journal is not balanced.'],
  [/GL approval/i, 'Journal requires GL approval.'],
  [/cannot close|validation failed/i, 'Payroll period cannot close because validation failed.'],
  [/cannot approve their own|maker.?checker|same actor/i, 'Requester cannot approve their own request.'],
  [/approval limit/i, 'Approval limit exceeded.'],
  [/does not reconcile|filing.*reconcil/i, 'Statutory filing does not reconcile.'],
  [/filed.*locked|result is locked/i, 'Filed statutory result is locked.'],
  [/published certificate|certificate.*immutable/i, 'Published certificate is immutable.'],
  [/cannot retry|unless failed/i, 'Operation cannot retry unless failed.'],
  // TM transfer batch period conflict (before generic payment-batch duplicate mapping)
  [
    /transfer\s+batch.*(already\s+exists|exist|active|in\s+progress|not\s+reversed)/i,
    TRANSFER_BATCH_PERIOD_CONFLICT_MESSAGE
  ],
  [/(already\s+exists|exists).{0,80}transfer\s+batch/i, TRANSFER_BATCH_PERIOD_CONFLICT_MESSAGE],
  [/duplicate.*payment\s+batch|duplicate.*batch.*payroll\s+run/i, 'Duplicate payment batch for this payroll run.'],
  [/duplicate.*journal/i, 'Duplicate journal for this source.'],
  [/duplicate.*payslip/i, 'Duplicate payslip for this employee and run.'],
  [/duplicate.*request/i, 'Duplicate approval request.'],
  [/circular dependenc/i, 'Circular element dependency detected.'],
  [/child record found/i, 'Cannot delete: this record is referenced by other payroll GL data.'],
  [/unique constraint.*TM_PAYROLL_TRANSFER_BATCH/i, TRANSFER_BATCH_PERIOD_CONFLICT_MESSAGE],
  [/unique constraint.*violated/i, 'A record with the same code already exists.']
];

/**
 * Oracle business conflict for TM transfer-batch period identity.
 * Used for HTTP 409 mapping. REVERSED reopen is handled inside CREATE_TRANSFER_BATCH
 * and must not be treated as a conflict by the API.
 */
export function isTransferBatchPeriodConflict(message) {
  const upper = String(message || '').toUpperCase();
  if (!upper) return false;

  // Unique index/constraint on transfer batches period identity
  if (
    /TM_PAYROLL_TRANSFER_BATCH/.test(upper) &&
    (upper.includes('UNIQUE') || upper.includes('ORA-00001') || /_U\d*\b/.test(upper))
  ) {
    return true;
  }

  const mentionsBatch = upper.includes('TRANSFER') && upper.includes('BATCH');
  if (!mentionsBatch) return false;

  return (
    upper.includes('ALREADY') ||
    /\bEXISTS?\b/.test(upper) ||
    upper.includes('IN PROGRESS') ||
    upper.includes('NOT REVERSED') ||
    upper.includes('ACTIVE BATCH') ||
    upper.includes('CONFLICT')
  );
}

function conflictHttpStatus(...messages) {
  return messages.some((m) => isTransferBatchPeriodConflict(m)) ? 409 : null;
}

export function mapPayrollOracleError(err) {
  const databaseMessage = err?.message || String(err || '');
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : null;

  for (const [pattern, message] of MESSAGE_MAP) {
    if (pattern.test(databaseMessage)) {
      return {
        code,
        message,
        databaseMessage,
        httpStatus: conflictHttpStatus(databaseMessage, message)
      };
    }
  }

  // Strip ORA-#####: prefix when present for a cleaner default message
  const cleaned = databaseMessage.replace(/^ORA-\d+:\s*/i, '').trim();
  const message = cleaned || 'Unable to process payroll request. Please try again.';
  return {
    code,
    message,
    databaseMessage,
    httpStatus: conflictHttpStatus(databaseMessage, message)
  };
}
