import oracledb from 'oracledb';
import {
  bindInNumber,
  bindInString,
  ROW_OPTS,
  withConnection
} from '../../../notifications/utils/notification.oracle.js';

function readUserId(row) {
  const userId = row?.USER_ID ?? row?.user_id;
  return userId != null ? Number(userId) : null;
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

export async function findEnterpriseAdminUserIds(enterpriseId) {
  if (!enterpriseId) return [];

  const sql = `
SELECT USER_ID
FROM FNDSEC.FNDSEC_USERS
WHERE ENTERPRISE_ID = :enterprise_id
  AND (
        LOWER(USER_CODE) = 'enterprise_admin'
     OR LOWER(USERNAME) = 'enterprise_admin'
      )`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      sql,
      {
        enterprise_id: bindInNumber(Number(enterpriseId))
      },
      ROW_OPTS
    );
    return (result.rows ?? [])
      .map((row) => readUserId(row))
      .filter((userId) => Number.isFinite(userId) && userId > 0);
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
  if (!enterpriseId || !employeeId) {
    return null;
  }

  const sql = `
SELECT
    e.EMPLOYEE_ID,
    RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
    e.EMPLOYEE_NUMBER,
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
        leave_type_id: leaveTypeId != null
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
      employeeNumber: row.EMPLOYEE_NUMBER ?? row.employee_number ?? null,
      employeeName: String(row.EMPLOYEE_NAME ?? row.employee_name ?? '').replace(/\s+/g, ' ').trim(),
      leaveTypeId: row.LEAVE_TYPE_ID ?? row.leave_type_id ?? leaveTypeId ?? null,
      leaveTypeGuid: row.LEAVE_TYPE_GUID ?? row.leave_type_guid ?? null,
      leaveTypeName: row.LEAVE_NAME_EN ?? row.leave_name_en ?? null,
      leaveTypeCode: row.LEAVE_CODE ?? row.leave_code ?? null
    };
  });
}

export async function findUserIdByUsername(enterpriseId, username) {
  if (!enterpriseId || !username) return null;

  const sql = `
SELECT USER_ID
FROM FNDSEC.FNDSEC_USERS
WHERE ENTERPRISE_ID = :enterprise_id
  AND LOWER(USERNAME) = LOWER(:username)
FETCH FIRST 1 ROWS ONLY`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      sql,
      {
        enterprise_id: bindInNumber(Number(enterpriseId)),
        username: bindInString(String(username).trim(), 500)
      },
      ROW_OPTS
    );
    return readUserId(result.rows?.[0]);
  });
}
