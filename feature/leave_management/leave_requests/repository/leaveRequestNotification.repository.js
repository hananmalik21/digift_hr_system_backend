import oracledb from 'oracledb';
import {
  bindInNumber,
  ROW_OPTS,
  withConnection
} from '../../../notifications/utils/notification.oracle.js';

const ADMIN_IDENTITY_VALUES = [
  'enterprise_admin',
  'enterpriseadmin',
  'tenant_admin',
  'tenantadmin',
  'super_admin',
  'superadmin',
  'platform_admin',
  'platformadmin'
];

function readUserId(row) {
  const userId = row?.USER_ID ?? row?.user_id;
  return userId != null ? Number(userId) : null;
}

function readEmployeeId(row) {
  const employeeId = row?.EMPLOYEE_ID ?? row?.employee_id;
  if (employeeId == null) return null;
  const n = Number(employeeId);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapUserRecipient(row) {
  const userId = readUserId(row);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  return {
    userId,
    employeeId: readEmployeeId(row)
  };
}

function normalizeIdentitySql(column) {
  return `LOWER(REPLACE(REPLACE(TRIM(NVL(${column}, '')), '-', '_'), ' ', ''))`;
}

export async function findUserIdByEmployeeId(enterpriseId, employeeId) {
  if (!enterpriseId || !employeeId) return null;

  const sql = `
SELECT USER_ID
FROM FNDSEC.FNDSEC_USERS
WHERE ENTERPRISE_ID = :enterprise_id
  AND EMPLOYEE_ID = :employee_id
FETCH FIRST 1 ROWS ONLY`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      sql,
      {
        enterprise_id: bindInNumber(Number(enterpriseId)),
        employee_id: bindInNumber(Number(employeeId))
      },
      ROW_OPTS
    );
    return readUserId(result.rows?.[0]);
  });
}

export async function findEnterpriseAdminUsers(enterpriseId) {
  if (!enterpriseId) return [];

  const userCodeExpr = normalizeIdentitySql('USER_CODE');
  const usernameExpr = normalizeIdentitySql('USERNAME');
  const adminList = ADMIN_IDENTITY_VALUES.map((value) => `'${value}'`).join(', ');

  const sql = `
SELECT USER_ID, EMPLOYEE_ID
FROM FNDSEC.FNDSEC_USERS
WHERE ENTERPRISE_ID = :enterprise_id
  AND (
        ${userCodeExpr} IN (${adminList})
     OR ${usernameExpr} IN (${adminList})
     OR LOWER(TRIM(NVL(PRIMARY_EMAIL, ''))) LIKE 'enterprise_admin%'
     OR ${userCodeExpr} LIKE '%enterprise_admin%'
     OR ${usernameExpr} LIKE '%enterprise_admin%'
      )`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      sql,
      { enterprise_id: bindInNumber(Number(enterpriseId)) },
      ROW_OPTS
    );

    return (result.rows ?? []).map(mapUserRecipient).filter(Boolean);
  });
}

export async function findReportingManagerUserId(enterpriseId, employeeId) {
  if (!enterpriseId || !employeeId) return null;

  const sql = `
SELECT mgr.USER_ID
FROM EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST v
JOIN FNDSEC.FNDSEC_USERS mgr
  ON mgr.ENTERPRISE_ID = v.ENTERPRISE_ID
 AND mgr.EMPLOYEE_ID = v.REPORTING_TO_EMP_ID
WHERE v.ENTERPRISE_ID = :enterprise_id
  AND v.EMPLOYEE_ID = :employee_id
  AND v.REPORTING_TO_EMP_ID IS NOT NULL
FETCH FIRST 1 ROWS ONLY`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      sql,
      {
        enterprise_id: bindInNumber(Number(enterpriseId)),
        employee_id: bindInNumber(Number(employeeId))
      },
      ROW_OPTS
    );
    return readUserId(result.rows?.[0]);
  });
}

export async function findLeaveNotificationContext({
  enterpriseId,
  employeeId,
  leaveTypeId
}) {
  if (!enterpriseId || !employeeId) return null;

  const sql = `
SELECT
    e.EMPLOYEE_ID,
    RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
    TRIM(
      NVL(e.FIRST_NAME_EN, '') || ' ' ||
      NVL(e.MIDDLE_NAME_EN, '') || ' ' ||
      NVL(e.LAST_NAME_EN, '')
    ) AS EMPLOYEE_NAME,
    lt.LEAVE_TYPE_ID,
    RAWTOHEX(lt.LEAVE_TYPE_GUID) AS LEAVE_TYPE_GUID,
    lt.LEAVE_NAME_EN,
    lt.LEAVE_CODE
FROM EMPL.EMPLOYEES e
LEFT JOIN ABS.ABS_LEAVE_TYPES lt
  ON lt.LEAVE_TYPE_ID = :leave_type_id
 AND lt.TENANT_ID = :enterprise_id
WHERE e.ENTERPRISE_ID = :enterprise_id
  AND e.EMPLOYEE_ID = :employee_id
FETCH FIRST 1 ROWS ONLY`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      sql,
      {
        enterprise_id: bindInNumber(Number(enterpriseId)),
        employee_id: bindInNumber(Number(employeeId)),
        leave_type_id:
          leaveTypeId != null
            ? bindInNumber(Number(leaveTypeId))
            : { val: null, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
      },
      ROW_OPTS
    );

    const row = result.rows?.[0];
    if (!row) return null;

    return {
      employeeId: row.EMPLOYEE_ID ?? row.employee_id,
      employeeGuid: row.EMPLOYEE_GUID ?? row.employee_guid ?? null,
      employeeNumber: null,
      employeeName: String(row.EMPLOYEE_NAME ?? row.employee_name ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      leaveTypeId: row.LEAVE_TYPE_ID ?? row.leave_type_id ?? leaveTypeId ?? null,
      leaveTypeGuid: row.LEAVE_TYPE_GUID ?? row.leave_type_guid ?? null,
      leaveTypeName: row.LEAVE_NAME_EN ?? row.leave_name_en ?? null,
      leaveTypeCode: row.LEAVE_CODE ?? row.leave_code ?? null
    };
  });
}
