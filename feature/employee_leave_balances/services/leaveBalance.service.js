import EmployeeLeaveBalanceModel from '../model/employeeLeaveBalanceModel.js';
import { ValidationError, NotFoundError, DatabaseError } from '../../../utils/errors/index.js';

/**
 * Adjust an employee's leave balances via ABS.ABS_LEAVE_BALANCE_PKG.ADJUST_LEAVE_BALANCE_ARRAY.
 * Resolves employeeId from employeeGuid if needed; runs inside a transaction. Returns adj_id, updated_balances, lines_count, warning.
 *
 * @param {Object} options
 * @param {number} options.tenantId - Tenant ID (required)
 * @param {string} [options.employeeGuid] - Employee GUID (32-char hex, preferred when no employeeId)
 * @param {number} [options.employeeId] - Employee ID (optional if employeeGuid provided)
 * @param {Array<{leave_code: string, new_days?: number, new_balance_days?: number}>} options.leaveItems - Items to adjust (required, non-empty; each must have new_days or new_balance_days)
 * @param {string} options.reason - Reason for adjustment (required)
 * @param {string} options.source - Source code (required)
 * @param {string} [options.createdBy] - Audit user (default ADMIN)
 * @returns {Promise<{ employeeId, tenantId, leave_items, reason, source, adj_id, adj_guid, updated_balances, lines_count, warning? }>}
 */
export async function adjustLeaveBalance({
  tenantId,
  employeeGuid,
  employeeId,
  leaveItems,
  reason,
  createdBy = 'ADMIN',
  source = 'MANUAL',
}) {
  if (!tenantId) throw new ValidationError('tenantId is required');
  if (!reason || (typeof reason === 'string' && !reason.trim())) {
    throw new ValidationError('reason is required');
  }
  if (typeof source !== 'string' || !source.trim()) {
    throw new ValidationError('source is required');
  }
  if (!Array.isArray(leaveItems) || leaveItems.length === 0) {
    throw new ValidationError('leave_items must be a non-empty array');
  }

  let empId = employeeId;
  if (empId == null && employeeGuid) {
    empId = await EmployeeLeaveBalanceModel.resolveEmployeeIdByGuid(tenantId, employeeGuid);
  }
  if (empId == null) throw new NotFoundError('Employee not found');

  const normalizedItems = leaveItems.map((item, i) => {
    const leaveCode = String(item.leave_code ?? item.leaveCode ?? '').trim().toUpperCase();
    const newDays = typeof item.new_balance_days !== 'undefined' ? Number(item.new_balance_days) : (typeof item.new_days !== 'undefined' ? Number(item.new_days) : (typeof item.newBalanceDays !== 'undefined' ? Number(item.newBalanceDays) : undefined));
    if (!leaveCode) throw new ValidationError(`leave_items[${i}]: leave_code is required`);
    if (newDays === undefined || Number.isNaN(newDays) || newDays < 0) {
      throw new ValidationError(`leave_items[${i}]: new_days or new_balance_days is required and must be a number >= 0`);
    }
    return { leave_code: leaveCode, new_days: newDays, new_balance_days: newDays };
  });

  let result;
  try {
    result = await EmployeeLeaveBalanceModel.executeWithTransaction(async (connection) => {
      return await EmployeeLeaveBalanceModel.adjustLeaveBalanceArrayWithConnection(connection, {
        tenantId,
        employeeId: empId,
        leaveItems: normalizedItems,
        reason,
        createdBy,
        source,
      });
    });
  } catch (err) {
    throw err instanceof DatabaseError ? err : new DatabaseError('Failed to adjust leave balance', err);
  }

  let updatedBalances = [];
  if (result.updatedBalancesJson != null && result.updatedBalancesJson !== '') {
    try {
      const parsed = JSON.parse(result.updatedBalancesJson);
      updatedBalances = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      updatedBalances = [];
    }
  }

  const adjLines = result.adjLines ?? [];
  updatedBalances = updatedBalances.map((item, i) => ({
    ...item,
    adj_line_id: adjLines[i]?.adj_line_id ?? null,
    adj_line_guid: adjLines[i]?.adj_line_guid ?? null,
  }));

  const echoItems = normalizedItems.map(({ leave_code, new_days }) => ({ leave_code, new_days }));

  return {
    employeeId: empId,
    tenantId,
    leave_items: echoItems,
    reason,
    source,
    adj_id: result.adjId ?? null,
    adj_guid: result.adjGuid ?? null,
    updated_balances: updatedBalances,
    lines_count: result.linesCount ?? 0,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}
