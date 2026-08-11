/**
 * Compensation-to-Payroll Transfer model.
 * All writes go through PAY.PAY_COMPENSATION_TRANSFER_PKG.
 * Node.js never inserts/updates PAY_ELEMENT_ENTRIES directly.
 * The package does not COMMIT — this layer owns commit/rollback.
 */

import {
  auditInBind,
  normalizeOutNumber,
  normalizeOutString,
  numberInBind,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import {
  AVAILABLE_FOR_TRANSFER_SQL,
  mapAvailableForTransferPayrollDefinitionRow
} from '../../payroll_definitions/utils/payPayrollDefinitionsAvailableForTransferSql.js';
import {
  GENERIC_ERROR_MESSAGE,
  INVALID_PAYROLL_DEFINITION_ORACLE_MESSAGE,
  MESSAGES
} from '../constants/payCompensationTransfer.constants.js';
import {
  logOracleError,
  numberOut,
  raiseOracleAppError,
  ROW_OBJECT,
  stringOut,
  withOracleConnection,
  withTransferTransaction
} from '../utils/payCompensationTransferDb.js';
import {
  inferPayRunTransferStatus,
  isRetroEntry,
  mapAvailablePayrollDefinitionRow,
  mapEntryResultSummary,
  mapPayrollResponseSummary,
  mapTransferredEntryRow,
  resolveLineTransferMessage,
  resolvePayRunPeriod,
  toNumberField,
  toStringField,
  upperRow
} from '../utils/payCompensationTransferMappers.js';
import {
  GET_PAY_RUN_TRANSFER_STATUS_PLSQL,
  PAY_RUN_SELECT_SQL,
  PAYROLL_DEFINITION_LOOKUP_SQL,
  TRANSFER_LINE_PLSQL,
  TRANSFER_PAY_RUN_PLSQL,
  TRANSFERRED_ENTRIES_SELECT
} from '../utils/payCompensationTransferSql.js';

export { GENERIC_ERROR_MESSAGE };
export {
  mapAvailablePayrollDefinitionRow,
  mapPayrollResponseSummary,
  mapTransferredEntryRow,
  resolvePayRunPeriod
};

async function fetchPayrollDefinitionOnConnection(connection, enterpriseId, payrollId) {
  if (payrollId == null) return null;
  const result = await connection.execute(
    PAYROLL_DEFINITION_LOOKUP_SQL,
    {
      payroll_id: numberInBind(payrollId),
      enterprise_id: numberInBind(enterpriseId)
    },
    ROW_OBJECT
  );
  const row = result.rows?.[0];
  return row ? mapAvailableForTransferPayrollDefinitionRow(row) : null;
}

async function fetchAvailablePayrollsOnConnection(
  connection,
  { enterprise_id, period_start_date, period_end_date, status = 'ACTIVE' }
) {
  const result = await connection.execute(
    AVAILABLE_FOR_TRANSFER_SQL,
    {
      enterprise_id: numberInBind(enterprise_id),
      period_start_date: varcharInBind(period_start_date, 10),
      period_end_date: varcharInBind(period_end_date, 10),
      status: varcharInBind(status || 'ACTIVE', 30)
    },
    ROW_OBJECT
  );
  return (result.rows || []).map(mapAvailableForTransferPayrollDefinitionRow);
}

async function fetchPayRunOnConnection(connection, enterpriseId, payRunId) {
  const result = await connection.execute(
    PAY_RUN_SELECT_SQL,
    {
      enterprise_id: numberInBind(enterpriseId),
      pay_run_id: numberInBind(payRunId)
    },
    ROW_OBJECT
  );
  return result.rows?.[0] ? upperRow(result.rows[0]) : null;
}

async function fetchEntriesByIdsOnConnection(connection, enterpriseId, entryIds) {
  const ids = [...new Set((entryIds || []).filter((id) => id != null))];
  if (ids.length === 0) return [];

  const binds = { enterprise_id: numberInBind(enterpriseId) };
  const placeholders = ids.map((id, idx) => {
    const key = `entry_id_${idx}`;
    binds[key] = numberInBind(id);
    return `:${key}`;
  });

  const sql = `
${TRANSFERRED_ENTRIES_SELECT}
  AND E.ELEMENT_ENTRY_ID IN (${placeholders.join(', ')})
ORDER BY E.ELEMENT_ENTRY_ID
`.trim();

  const result = await connection.execute(sql, binds, ROW_OBJECT);
  return (result.rows || []).map(mapTransferredEntryRow);
}

async function assertPayrollDefinitionExists(
  connection,
  { enterprise_id, payroll_id, details, action }
) {
  if (payroll_id == null) return null;
  const payroll = await fetchPayrollDefinitionOnConnection(connection, enterprise_id, payroll_id);
  if (!payroll) {
    raiseOracleAppError(20037, INVALID_PAYROLL_DEFINITION_ORACLE_MESSAGE, {
      action,
      details: { enterprise_id, payroll_id, ...details }
    });
  }
  return payroll;
}

async function assertPayrollEffectiveForPayRun(
  connection,
  { enterprise_id, pay_run_id, payroll_id }
) {
  const payRun = await fetchPayRunOnConnection(connection, enterprise_id, pay_run_id);
  if (!payRun) return;

  const period = resolvePayRunPeriod(payRun);
  const available = await fetchAvailablePayrollsOnConnection(connection, {
    enterprise_id,
    period_start_date: period.period_start_date,
    period_end_date: period.period_end_date,
    status: 'ACTIVE'
  });

  if (!available.some((p) => p.payroll_id === payroll_id)) {
    raiseOracleAppError(20037, INVALID_PAYROLL_DEFINITION_ORACLE_MESSAGE, {
      action: 'assertPayrollEffectiveForPayRun',
      details: { enterprise_id, payroll_id, pay_run_id }
    });
  }
}

function splitRegularAndRetroEntries(entries, regularEntryId, retroEntryId) {
  const regularEntry =
    entries.find((e) => e.element_entry_id === regularEntryId) ||
    entries.find((e) => !isRetroEntry(e)) ||
    null;
  const retroEntry =
    entries.find((e) => e.element_entry_id === retroEntryId) ||
    entries.find((e) => isRetroEntry(e)) ||
    null;
  return { regularEntry, retroEntry };
}

/**
 * List Payroll Definitions available for compensation transfer.
 */
export async function listAvailablePayrollDefinitionsForTransfer(filters) {
  return withOracleConnection(
    'listAvailablePayrollDefinitionsForTransfer',
    { enterprise_id: filters.enterprise_id },
    (connection) => fetchAvailablePayrollsOnConnection(connection, filters)
  );
}

/**
 * Compensation transfer setup: pay-run period + available payroll definitions.
 */
export async function getCompensationTransferSetup({ enterprise_id, pay_run_id }) {
  return withOracleConnection(
    'getCompensationTransferSetup',
    { enterprise_id, pay_run_id },
    async (connection) => {
      const payRun = await fetchPayRunOnConnection(connection, enterprise_id, pay_run_id);
      if (!payRun) {
        raiseOracleAppError(20021, MESSAGES.PAY_RUN_NOT_FOUND, {
          action: 'getCompensationTransferSetup',
          details: { enterprise_id, pay_run_id }
        });
      }

      const period = resolvePayRunPeriod(payRun);
      const available = await fetchAvailablePayrollsOnConnection(connection, {
        enterprise_id,
        period_start_date: period.period_start_date,
        period_end_date: period.period_end_date,
        status: 'ACTIVE'
      });

      return {
        enterprise_id,
        pay_run_id: toNumberField(payRun.PAY_RUN_ID),
        period_start_date: period.period_start_date,
        period_end_date: period.period_end_date,
        run_status: toStringField(payRun.RUN_STATUS),
        run_type: toStringField(payRun.RUN_TYPE),
        available_payroll_definitions: available.map((p) => ({
          payroll_id: p.payroll_id,
          payroll_guid: p.payroll_guid,
          payroll_name: p.payroll_name,
          payroll_code: p.payroll_code,
          status: p.status
        }))
      };
    }
  );
}

/**
 * Transfer one compensation pay-run line via Oracle package.
 */
export async function transferPayRunLineDetail(payload) {
  const { enterprise_id, pay_run_id, pay_run_line_id, payroll_id, created_by } = payload;
  const details = {
    enterprise_id,
    pay_run_id,
    pay_run_line_id,
    requested_payroll_id: payroll_id
  };

  return withTransferTransaction('transferPayRunLineDetail', details, async (connection) => {
    await assertPayrollDefinitionExists(connection, {
      enterprise_id,
      payroll_id,
      details: { pay_run_id, pay_run_line_id },
      action: 'transferPayRunLineDetail.prevalidate'
    });

    const result = await connection.execute(
      TRANSFER_LINE_PLSQL,
      {
        enterprise_id: numberInBind(enterprise_id),
        pay_run_id: numberInBind(pay_run_id),
        pay_run_line_id: numberInBind(pay_run_line_id),
        payroll_id: numberInBind(payroll_id),
        created_by: auditInBind(created_by),
        regular_entry_id: numberOut(),
        regular_entry_guid: stringOut(100),
        retro_entry_id: numberOut(),
        retro_entry_guid: stringOut(100),
        transfer_status: stringOut(50),
        message: stringOut(4000)
      },
      { autoCommit: false }
    );

    const out = result?.outBinds || {};
    const transferStatus = normalizeOutString(out.transfer_status);
    const packageMessage = normalizeOutString(out.message);
    const regularEntryId = normalizeOutNumber(out.regular_entry_id);
    const retroEntryId = normalizeOutNumber(out.retro_entry_id);

    const entries = await fetchEntriesByIdsOnConnection(connection, enterprise_id, [
      regularEntryId,
      retroEntryId
    ]);
    const { regularEntry, retroEntry } = splitRegularAndRetroEntries(
      entries,
      regularEntryId,
      retroEntryId
    );

    const payroll =
      (await fetchPayrollDefinitionOnConnection(connection, enterprise_id, payroll_id)) ||
      (regularEntry
        ? {
            payroll_id: regularEntry.payroll_id,
            payroll_guid: regularEntry.payroll_guid,
            payroll_name: regularEntry.payroll_name,
            payroll_code: regularEntry.payroll_code
          }
        : null);

    const regularSummary = mapEntryResultSummary(regularEntry);
    const retroSummary = mapEntryResultSummary(retroEntry);

    return {
      success: true,
      transfer_status: transferStatus,
      message: resolveLineTransferMessage(
        transferStatus,
        packageMessage,
        regularSummary,
        retroSummary
      ),
      data: {
        enterprise_id,
        pay_run_id,
        pay_run_line_id,
        payroll: mapPayrollResponseSummary(payroll),
        transfer_status: transferStatus,
        regular_entry: regularSummary,
        retro_entry: retroSummary,
        total_pay_value: (regularSummary?.pay_value || 0) + (retroSummary?.pay_value || 0)
      }
    };
  });
}

/**
 * Transfer a complete compensation pay run via Oracle package.
 */
export async function transferPayRun(payload) {
  const {
    enterprise_id,
    pay_run_id,
    payroll_id,
    created_by,
    stop_on_error = 'N'
  } = payload;
  const details = {
    enterprise_id,
    pay_run_id,
    requested_payroll_id: payroll_id
  };

  return withTransferTransaction('transferPayRun', details, async (connection) => {
    if (payroll_id != null) {
      await assertPayrollDefinitionExists(connection, {
        enterprise_id,
        payroll_id,
        details: { pay_run_id },
        action: 'transferPayRun.prevalidate'
      });
      await assertPayrollEffectiveForPayRun(connection, {
        enterprise_id,
        pay_run_id,
        payroll_id
      });
    }

    const result = await connection.execute(
      TRANSFER_PAY_RUN_PLSQL,
      {
        enterprise_id: numberInBind(enterprise_id),
        pay_run_id: numberInBind(pay_run_id),
        payroll_id: numberInBind(payroll_id),
        created_by: auditInBind(created_by),
        stop_on_error: ynInBind(stop_on_error, 'N'),
        transferred_count: numberOut(),
        skipped_count: numberOut(),
        failed_count: numberOut(),
        last_error: stringOut(4000),
        message: stringOut(4000)
      },
      { autoCommit: false }
    );

    const out = result?.outBinds || {};
    const transferredCount = normalizeOutNumber(out.transferred_count) ?? 0;
    const skippedCount = normalizeOutNumber(out.skipped_count) ?? 0;
    const failedCount = normalizeOutNumber(out.failed_count) ?? 0;
    const lastError = normalizeOutString(out.last_error);
    const packageMessage = normalizeOutString(out.message);

    let transferStatus = null;
    try {
      const statusResult = await connection.execute(
        GET_PAY_RUN_TRANSFER_STATUS_PLSQL,
        {
          enterprise_id: numberInBind(enterprise_id),
          pay_run_id: numberInBind(pay_run_id),
          transfer_status: stringOut(50),
          message: stringOut(4000)
        },
        { autoCommit: false }
      );
      transferStatus = normalizeOutString(statusResult?.outBinds?.transfer_status);
    } catch (statusErr) {
      logOracleError(statusErr, 'GET_PAY_RUN_TRANSFER_STATUS');
      transferStatus = inferPayRunTransferStatus({
        failedCount,
        transferredCount,
        skippedCount
      });
    }

    const payroll = await fetchPayrollDefinitionOnConnection(
      connection,
      enterprise_id,
      payroll_id
    );

    return {
      success: true,
      message: packageMessage || MESSAGES.PAY_RUN_TRANSFER,
      data: {
        enterprise_id,
        pay_run_id,
        payroll: mapPayrollResponseSummary(payroll),
        transferred_count: transferredCount,
        skipped_count: skippedCount,
        failed_count: failedCount,
        last_error: lastError,
        transfer_status: transferStatus
      }
    };
  });
}

/**
 * Transferred entries for one compensation pay-run line.
 */
export async function getTransferredEntriesForPayRunLine({ enterprise_id, pay_run_line_id }) {
  const sql = `
${TRANSFERRED_ENTRIES_SELECT}
  AND (
        E.SOURCE_REFERENCE LIKE :source_ref_pattern
     OR E.SOURCE_REFERENCE = :source_ref_regular
     OR E.SOURCE_REFERENCE = :source_ref_retro
  )
ORDER BY E.ELEMENT_ENTRY_ID
`.trim();

  return withOracleConnection(
    'getTransferredEntriesForPayRunLine',
    { enterprise_id, pay_run_line_id },
    async (connection) => {
      const result = await connection.execute(
        sql,
        {
          enterprise_id: numberInBind(enterprise_id),
          source_ref_pattern: varcharInBind(`COMP_PAY_RUN_LINE:${pay_run_line_id}:%`, 200),
          source_ref_regular: varcharInBind(
            `COMP_PAY_RUN_LINE:${pay_run_line_id}:REGULAR`,
            200
          ),
          source_ref_retro: varcharInBind(`COMP_PAY_RUN_LINE:${pay_run_line_id}:RETRO`, 200)
        },
        ROW_OBJECT
      );
      return (result.rows || []).map(mapTransferredEntryRow);
    }
  );
}

/**
 * Transferred entries for one compensation pay run (BATCH_ID = pay_run_id).
 */
export async function getTransferredEntriesForPayRun({ enterprise_id, pay_run_id }) {
  const sql = `
${TRANSFERRED_ENTRIES_SELECT}
  AND E.BATCH_ID = :pay_run_id
ORDER BY E.ELEMENT_ENTRY_ID
`.trim();

  return withOracleConnection(
    'getTransferredEntriesForPayRun',
    { enterprise_id, pay_run_id },
    async (connection) => {
      const result = await connection.execute(
        sql,
        {
          enterprise_id: numberInBind(enterprise_id),
          pay_run_id: numberInBind(pay_run_id)
        },
        ROW_OBJECT
      );
      return (result.rows || []).map(mapTransferredEntryRow);
    }
  );
}
