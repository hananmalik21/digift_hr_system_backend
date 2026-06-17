/**
 * Parse shared list/export query filters for GET /api/abs/leave-balances.
 * @param {import('express').Request['query']} query
 * @returns {{ search: string|null, name: string|null, employeeNumber: string|null }}
 */
export function parseLeaveBalanceListQuery(query) {
  const trimOrNull = (value) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
  };

  return {
    search: trimOrNull(query?.search),
    name: trimOrNull(query?.name),
    employeeNumber: trimOrNull(query?.employeeNumber ?? query?.employee_number)
  };
}
