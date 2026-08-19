import {
  NOTIFICATION_DEVICE_FIELD_LIMITS as LIMITS,
  NOTIFICATION_TABLES
} from '../constants/notification.constants.js';
import { DatabaseError } from '../../../utils/errors/index.js';
import {
  bindInBuffer,
  bindInNumber,
  bindInString,
  commitConnection,
  rollbackConnection,
  ROW_OPTS,
  withConnection
} from '../utils/notification.oracle.js';
import { mapActiveNotificationTarget, mapDeviceRow } from '../utils/notification.mapper.js';

const LOG_TAG = 'notification.device.repository';
const TABLE = NOTIFICATION_TABLES.DEVICES;

const DEVICE_SELECT_COLUMNS = `
    DEVICE_ID,
    RAWTOHEX(DEVICE_GUID) AS DEVICE_GUID,
    ENTERPRISE_ID,
    USER_ID,
    TARGET_TYPE,
    TARGET_VALUE,
    DEVICE_TYPE,
    DEVICE_NAME,
    BROWSER_NAME,
    BROWSER_VERSION,
    OPERATING_SYSTEM,
    ACTIVE_FLAG,
    LAST_REGISTERED_DATE,
    LAST_USED_DATE,
    CREATION_DATE,
    LAST_UPDATE_DATE`;

function rethrowDbError(err, context) {
  console.error(
    `[${LOG_TAG}] ${context}`,
    err?.errorNum != null ? `ORA-${err.errorNum}` : '',
    err?.message || err
  );
  throw new DatabaseError(err?.message || 'Database error', err, null);
}

function bindTarget({ enterpriseId, userId, targetType, targetValue }) {
  return {
    enterprise_id: bindInNumber(enterpriseId),
    user_id: bindInNumber(userId),
    target_type: bindInString(targetType, LIMITS.TARGET_TYPE),
    target_value: bindInString(targetValue, LIMITS.TARGET_VALUE)
  };
}

function bindRegistration(payload) {
  return {
    ...bindTarget(payload),
    device_type: bindInString(payload.deviceType, LIMITS.DEVICE_TYPE),
    device_name: bindInString(payload.deviceName, LIMITS.DEVICE_NAME),
    browser_name: bindInString(payload.browserName, LIMITS.BROWSER_NAME),
    browser_version: bindInString(payload.browserVersion, LIMITS.BROWSER_VERSION),
    operating_system: bindInString(payload.operatingSystem, LIMITS.OPERATING_SYSTEM)
  };
}

export async function getActiveNotificationTargets({ enterpriseId, userId }) {
  const sql = `
SELECT
    DEVICE_ID,
    RAWTOHEX(DEVICE_GUID) AS DEVICE_GUID,
    TARGET_TYPE,
    TARGET_VALUE,
    DEVICE_TYPE,
    DEVICE_NAME,
    BROWSER_NAME,
    BROWSER_VERSION,
    OPERATING_SYSTEM,
    LAST_REGISTERED_DATE
FROM ${TABLE}
WHERE ENTERPRISE_ID = :enterprise_id
  AND USER_ID = :user_id
  AND ACTIVE_FLAG = 'Y'`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        sql,
        {
          enterprise_id: bindInNumber(enterpriseId),
          user_id: bindInNumber(userId)
        },
        ROW_OPTS
      );
      return (result.rows ?? []).map(mapActiveNotificationTarget).filter(Boolean);
    });
  } catch (err) {
    rethrowDbError(err, 'getActiveNotificationTargets');
  }
}

export async function registerNotificationDevice(payload) {
  const deactivateOtherUsersSql = `
UPDATE ${TABLE}
   SET ACTIVE_FLAG = 'N',
       LAST_UPDATE_DATE = SYSTIMESTAMP
 WHERE TARGET_TYPE = :target_type
   AND TARGET_VALUE = :target_value
   AND ACTIVE_FLAG = 'Y'
   AND (
        ENTERPRISE_ID <> :enterprise_id
        OR USER_ID <> :user_id
       )`;

  const mergeSql = `
MERGE INTO ${TABLE} d
USING (
  SELECT :enterprise_id AS enterprise_id,
         :user_id AS user_id,
         :target_type AS target_type,
         :target_value AS target_value
    FROM dual
) s
ON (
  d.ENTERPRISE_ID = s.enterprise_id
  AND d.USER_ID = s.user_id
  AND d.TARGET_TYPE = s.target_type
  AND d.TARGET_VALUE = s.target_value
)
WHEN MATCHED THEN
  UPDATE SET
    d.ACTIVE_FLAG = 'Y',
    d.DEVICE_TYPE = :device_type,
    d.DEVICE_NAME = :device_name,
    d.BROWSER_NAME = :browser_name,
    d.BROWSER_VERSION = :browser_version,
    d.OPERATING_SYSTEM = :operating_system,
    d.LAST_REGISTERED_DATE = SYSTIMESTAMP,
    d.LAST_USED_DATE = SYSTIMESTAMP,
    d.LAST_UPDATE_DATE = SYSTIMESTAMP
WHEN NOT MATCHED THEN
  INSERT (
    DEVICE_GUID,
    ENTERPRISE_ID,
    USER_ID,
    TARGET_TYPE,
    TARGET_VALUE,
    DEVICE_TYPE,
    DEVICE_NAME,
    BROWSER_NAME,
    BROWSER_VERSION,
    OPERATING_SYSTEM,
    ACTIVE_FLAG,
    LAST_REGISTERED_DATE,
    LAST_USED_DATE,
    CREATION_DATE,
    LAST_UPDATE_DATE
  ) VALUES (
    SYS_GUID(),
    :enterprise_id,
    :user_id,
    :target_type,
    :target_value,
    :device_type,
    :device_name,
    :browser_name,
    :browser_version,
    :operating_system,
    'Y',
    SYSTIMESTAMP,
    SYSTIMESTAMP,
    SYSTIMESTAMP,
    SYSTIMESTAMP
  )`;

  const selectSql = `
SELECT ${DEVICE_SELECT_COLUMNS}
FROM ${TABLE}
WHERE ENTERPRISE_ID = :enterprise_id
  AND USER_ID = :user_id
  AND TARGET_TYPE = :target_type
  AND TARGET_VALUE = :target_value
FETCH FIRST 1 ROWS ONLY`;

  const targetBinds = bindTarget(payload);
  const registerBinds = bindRegistration(payload);

  try {
    return await withConnection(async (connection) => {
      await connection.execute(deactivateOtherUsersSql, targetBinds, { autoCommit: false });
      await connection.execute(mergeSql, registerBinds, { autoCommit: false });
      const result = await connection.execute(selectSql, targetBinds, ROW_OPTS);
      await commitConnection(connection);
      return mapDeviceRow(result.rows?.[0]);
    });
  } catch (err) {
    rethrowDbError(err, 'registerNotificationDevice');
  }
}

export async function deactivateNotificationDeviceByTarget({
  enterpriseId,
  userId,
  targetType,
  targetValue
}) {
  const sql = `
UPDATE ${TABLE}
   SET ACTIVE_FLAG = 'N',
       LAST_UPDATE_DATE = SYSTIMESTAMP
 WHERE ENTERPRISE_ID = :enterprise_id
   AND USER_ID = :user_id
   AND TARGET_TYPE = :target_type
   AND TARGET_VALUE = :target_value`;

  try {
    return await withConnection(async (connection) => {
      await connection.execute(sql, bindTarget({
        enterpriseId,
        userId,
        targetType,
        targetValue
      }), { autoCommit: false });
      await commitConnection(connection);
      return { deactivated: true };
    });
  } catch (err) {
    rethrowDbError(err, 'deactivateNotificationDeviceByTarget');
  }
}

export async function deactivateNotificationDevice({
  enterpriseId,
  userId,
  deviceGuidBuffer
}) {
  const sql = `
UPDATE ${TABLE}
   SET ACTIVE_FLAG = 'N',
       LAST_UPDATE_DATE = SYSTIMESTAMP
 WHERE DEVICE_GUID = :device_guid
   AND ENTERPRISE_ID = :enterprise_id
   AND USER_ID = :user_id`;

  const binds = {
    device_guid: bindInBuffer(deviceGuidBuffer),
    enterprise_id: bindInNumber(enterpriseId),
    user_id: bindInNumber(userId)
  };

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(sql, binds, { autoCommit: false });

      if ((result.rowsAffected ?? 0) > 0) {
        await commitConnection(connection);
        return { deactivated: true, notFound: false };
      }

      await rollbackConnection(connection);
      return { deactivated: false, notFound: true };
    });
  } catch (err) {
    rethrowDbError(err, 'deactivateNotificationDevice');
  }
}
