/**
 * Map known PAY Oracle application errors to clear API messages.
 */

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
  [/duplicate.*batch/i, 'Duplicate payment batch for this payroll run.'],
  [/duplicate.*journal/i, 'Duplicate journal for this source.'],
  [/duplicate.*payslip/i, 'Duplicate payslip for this employee and run.'],
  [/duplicate.*request/i, 'Duplicate approval request.'],
  [/circular dependenc/i, 'Circular element dependency detected.'],
  [/child record found/i, 'Cannot delete: this record is referenced by other payroll GL data.'],
  [/unique constraint.*violated/i, 'A record with the same code already exists.']
];

export function mapPayrollOracleError(err) {
  const databaseMessage = err?.message || String(err || '');
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : null;

  for (const [pattern, message] of MESSAGE_MAP) {
    if (pattern.test(databaseMessage)) {
      return { code, message, databaseMessage };
    }
  }

  // Strip ORA-#####: prefix when present for a cleaner default message
  const cleaned = databaseMessage.replace(/^ORA-\d+:\s*/i, '').trim();
  return {
    code,
    message: cleaned || 'Unable to process payroll request. Please try again.',
    databaseMessage
  };
}
