import oracledb from 'oracledb';
import {
  CLEAR_NOTIFICATIONS_PROC,
  CREATE_FOR_USER_PROC,
  NOTIFICATION_TABLES
} from '../constants/notification.constants.js';
import {
  bindInBuffer,
  bindInNumber,
  bindInString,
  bindOutClob,
  bindOutNumber,
  commitConnection,
  numOrNull,
  readClobOut,
  rollbackConnection,
  ROW_OPTS,
  strOrNull,
  withConnection,
  ynFlag
} from '../utils/notification.oracle.js';
import { mapNotificationRow } from '../utils/notification.mapper.js';
import { DatabaseError } from '../../../utils/errors/index.js';

const LOG_TAG = 'notification.repository';

function rethrowDbError(err, context) {
  console.error(
    `[${LOG_TAG}] ${context}`,
    err?.errorNum != null ? `ORA-${err.errorNum}` : '',
    err?.message || err
  );
  throw new DatabaseError(err?.message || 'Database error', err, null);
}

function buildListFilters({ status, module, type, priority }) {
  const clauses = [
    'R.ENTERPRISE_ID = :enterprise_id',
    'R.USER_ID = :user_id',
    "R.DISMISSED_FLAG = 'N'"
  ];
  const binds = {};

  if (status === 'READ') {
    clauses.push("R.READ_FLAG = 'Y'");
  } else if (status === 'UNREAD') {
    clauses.push("R.READ_FLAG = 'N'");
  }

  if (module) {
    clauses.push('N.MODULE_CODE = :module_code');
    binds.module_code = bindInString(module, 100);
  }

  if (type) {
    clauses.push('N.NOTIFICATION_TYPE = :notification_type');
    binds.notification_type = bindInString(type, 100);
  }

  if (priority) {
    clauses.push('N.PRIORITY = :priority');
    binds.priority = bindInString(priority, 30);
  }

  return { whereSql: clauses.join('\n  AND '), binds };
}

const LIST_SELECT_SQL = `
SELECT
    R.RECIPIENT_ID,
    RAWTOHEX(R.RECIPIENT_GUID) AS RECIPIENT_GUID,
    N.NOTIFICATION_ID,
    RAWTOHEX(N.NOTIFICATION_GUID) AS NOTIFICATION_GUID,
    N.ENTERPRISE_ID,
    N.MODULE_CODE,
    N.NOTIFICATION_TYPE,
    N.TITLE,
    N.MESSAGE,
    N.PRIORITY,
    N.ENTITY_TYPE,
    N.ENTITY_ID,
    RAWTOHEX(N.ENTITY_GUID) AS ENTITY_GUID,
    N.ENTITY_DATA_JSON,
    N.ACTION_URL,
    N.ICON_CODE,
    N.METADATA_JSON,
    N.SOURCE_SYSTEM,
    R.READ_FLAG,
    R.READ_DATE,
    R.DISMISSED_FLAG,
    R.DELIVERY_STATUS,
    R.PUSH_REQUIRED_FLAG,
    R.PUSH_STATUS,
    R.PUSH_SENT_DATE,
    N.CREATION_DATE
FROM ${NOTIFICATION_TABLES.NOTIFICATIONS} N
JOIN ${NOTIFICATION_TABLES.RECIPIENTS} R
  ON R.NOTIFICATION_ID = N.NOTIFICATION_ID`;

export async function countNotifications(filters) {
  const { whereSql, binds: filterBinds } = buildListFilters(filters);

  const sql = `
SELECT COUNT(*) AS TOTAL_COUNT
FROM ${NOTIFICATION_TABLES.NOTIFICATIONS} N
JOIN ${NOTIFICATION_TABLES.RECIPIENTS} R
  ON R.NOTIFICATION_ID = N.NOTIFICATION_ID
WHERE ${whereSql}`;

  const binds = {
    enterprise_id: bindInNumber(filters.enterpriseId),
    user_id: bindInNumber(filters.userId),
    ...filterBinds
  };

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(sql, binds, ROW_OPTS);
      const row = result.rows?.[0] ?? {};
      return Number(row.TOTAL_COUNT ?? row.total_count ?? 0);
    });
  } catch (err) {
    rethrowDbError(err, 'countNotifications');
  }
}

export async function listNotifications(filters, pagination) {
  const { whereSql, binds: filterBinds } = buildListFilters(filters);
  const offset = (pagination.page - 1) * pagination.limit;

  const sql = `
${LIST_SELECT_SQL}
WHERE ${whereSql}
ORDER BY N.CREATION_DATE DESC
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

  const binds = {
    enterprise_id: bindInNumber(filters.enterpriseId),
    user_id: bindInNumber(filters.userId),
    offset: bindInNumber(offset),
    limit: bindInNumber(pagination.limit),
    ...filterBinds
  };

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(sql, binds, ROW_OPTS);
      return (result.rows ?? []).map(mapNotificationRow).filter(Boolean);
    });
  } catch (err) {
    rethrowDbError(err, 'listNotifications');
  }
}

export async function getUnreadCount({ enterpriseId, userId }) {
  const sql = `
SELECT COUNT(*) AS UNREAD_COUNT
FROM ${NOTIFICATION_TABLES.RECIPIENTS}
WHERE ENTERPRISE_ID = :enterprise_id
  AND USER_ID = :user_id
  AND READ_FLAG = 'N'
  AND DISMISSED_FLAG = 'N'`;

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
      const row = result.rows?.[0] ?? {};
      return Number(row.UNREAD_COUNT ?? row.unread_count ?? 0);
    });
  } catch (err) {
    rethrowDbError(err, 'getUnreadCount');
  }
}

export async function findRecipientByGuid({ enterpriseId, userId, recipientGuidBuffer }) {
  const sql = `
SELECT
    R.RECIPIENT_ID,
    RAWTOHEX(R.RECIPIENT_GUID) AS RECIPIENT_GUID,
    R.READ_FLAG,
    R.DISMISSED_FLAG
FROM ${NOTIFICATION_TABLES.RECIPIENTS} R
WHERE R.RECIPIENT_GUID = :recipient_guid
  AND R.ENTERPRISE_ID = :enterprise_id
  AND R.USER_ID = :user_id
FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        sql,
        {
          recipient_guid: bindInBuffer(recipientGuidBuffer),
          enterprise_id: bindInNumber(enterpriseId),
          user_id: bindInNumber(userId)
        },
        ROW_OPTS
      );
      return result.rows?.[0] ?? null;
    });
  } catch (err) {
    rethrowDbError(err, 'findRecipientByGuid');
  }
}

export async function markRecipientRead({ enterpriseId, userId, recipientGuidBuffer }) {
  const sql = `
UPDATE ${NOTIFICATION_TABLES.RECIPIENTS}
   SET READ_FLAG = 'Y',
       READ_DATE = SYSTIMESTAMP,
       LAST_UPDATE_DATE = SYSTIMESTAMP
 WHERE RECIPIENT_GUID = :recipient_guid
   AND ENTERPRISE_ID = :enterprise_id
   AND USER_ID = :user_id
   AND DISMISSED_FLAG = 'N'`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        sql,
        {
          recipient_guid: bindInBuffer(recipientGuidBuffer),
          enterprise_id: bindInNumber(enterpriseId),
          user_id: bindInNumber(userId)
        },
        { autoCommit: false }
      );

      if ((result.rowsAffected ?? 0) > 0) {
        await commitConnection(connection);
        return { updated: true, alreadyRead: false };
      }

      const existing = await connection.execute(
        `SELECT READ_FLAG
           FROM ${NOTIFICATION_TABLES.RECIPIENTS}
          WHERE RECIPIENT_GUID = :recipient_guid
            AND ENTERPRISE_ID = :enterprise_id
            AND USER_ID = :user_id
            AND DISMISSED_FLAG = 'N'
          FETCH FIRST 1 ROWS ONLY`,
        {
          recipient_guid: bindInBuffer(recipientGuidBuffer),
          enterprise_id: bindInNumber(enterpriseId),
          user_id: bindInNumber(userId)
        },
        ROW_OPTS
      );

      const row = existing.rows?.[0];
      if (!row) {
        await rollbackConnection(connection);
        return { updated: false, notFound: true };
      }

      const alreadyRead = String(row.READ_FLAG ?? row.read_flag ?? 'N').toUpperCase() === 'Y';
      await commitConnection(connection);
      return { updated: false, alreadyRead, notFound: false };
    });
  } catch (err) {
    rethrowDbError(err, 'markRecipientRead');
  }
}

export async function markAllRecipientsRead({ enterpriseId, userId }) {
  const sql = `
UPDATE ${NOTIFICATION_TABLES.RECIPIENTS}
   SET READ_FLAG = 'Y',
       READ_DATE = SYSTIMESTAMP,
       LAST_UPDATE_DATE = SYSTIMESTAMP
 WHERE ENTERPRISE_ID = :enterprise_id
   AND USER_ID = :user_id
   AND READ_FLAG = 'N'
   AND DISMISSED_FLAG = 'N'`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        sql,
        {
          enterprise_id: bindInNumber(enterpriseId),
          user_id: bindInNumber(userId)
        },
        { autoCommit: false }
      );
      await commitConnection(connection);
      return Number(result.rowsAffected ?? 0);
    });
  } catch (err) {
    rethrowDbError(err, 'markAllRecipientsRead');
  }
}

export async function dismissRecipient({ enterpriseId, userId, recipientGuidBuffer }) {
  const sql = `
UPDATE ${NOTIFICATION_TABLES.RECIPIENTS}
   SET DISMISSED_FLAG = 'Y',
       DISMISSED_DATE = SYSTIMESTAMP,
       LAST_UPDATE_DATE = SYSTIMESTAMP
 WHERE RECIPIENT_GUID = :recipient_guid
   AND ENTERPRISE_ID = :enterprise_id
   AND USER_ID = :user_id
   AND DISMISSED_FLAG = 'N'`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        sql,
        {
          recipient_guid: bindInBuffer(recipientGuidBuffer),
          enterprise_id: bindInNumber(enterpriseId),
          user_id: bindInNumber(userId)
        },
        { autoCommit: false }
      );

      if ((result.rowsAffected ?? 0) > 0) {
        await commitConnection(connection);
        return { cleared: true, notFound: false };
      }

      const existing = await connection.execute(
        `SELECT DISMISSED_FLAG
           FROM ${NOTIFICATION_TABLES.RECIPIENTS}
          WHERE RECIPIENT_GUID = :recipient_guid
            AND ENTERPRISE_ID = :enterprise_id
            AND USER_ID = :user_id
          FETCH FIRST 1 ROWS ONLY`,
        {
          recipient_guid: bindInBuffer(recipientGuidBuffer),
          enterprise_id: bindInNumber(enterpriseId),
          user_id: bindInNumber(userId)
        },
        ROW_OPTS
      );

      const row = existing.rows?.[0];
      if (!row) {
        await rollbackConnection(connection);
        return { cleared: false, notFound: true };
      }

      await commitConnection(connection);
      return { cleared: false, notFound: false, alreadyDismissed: true };
    });
  } catch (err) {
    rethrowDbError(err, 'dismissRecipient');
  }
}

export async function clearNotificationsViaPackage({ enterpriseId, userId, clearType }) {
  const plsql = `
BEGIN
  ${CLEAR_NOTIFICATIONS_PROC}(
    P_ENTERPRISE_ID  => :p_enterprise_id,
    P_USER_ID        => :p_user_id,
    P_CLEAR_TYPE     => :p_clear_type,
    O_ROWS_CLEARED   => :o_rows_cleared
  );
END;`;

  const binds = {
    p_enterprise_id: bindInNumber(enterpriseId),
    p_user_id: bindInNumber(userId),
    p_clear_type: bindInString(clearType, 20),
    o_rows_cleared: bindOutNumber()
  };

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(plsql, binds, { autoCommit: false });
      await commitConnection(connection);
      return Number(result.outBinds?.o_rows_cleared ?? 0);
    });
  } catch (err) {
    rethrowDbError(err, 'clearNotificationsViaPackage');
  }
}

export async function userExistsInEnterprise({ enterpriseId, userId }) {
  const sql = `
SELECT USER_ID
FROM ${NOTIFICATION_TABLES.USERS}
WHERE ENTERPRISE_ID = :enterprise_id
  AND USER_ID = :user_id
FETCH FIRST 1 ROWS ONLY`;

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
      return Boolean(result.rows?.[0]);
    });
  } catch (err) {
    rethrowDbError(err, 'userExistsInEnterprise');
  }
}

export async function createNotificationForUser(payload) {
  const plsql = `
BEGIN
  ${CREATE_FOR_USER_PROC}(
    P_ENTERPRISE_ID        => :p_enterprise_id,
    P_USER_ID              => :p_user_id,
    P_EMPLOYEE_ID          => :p_employee_id,
    P_MODULE_CODE          => :p_module_code,
    P_NOTIFICATION_TYPE    => :p_notification_type,
    P_TITLE                => :p_title,
    P_MESSAGE              => :p_message,
    P_PRIORITY             => :p_priority,
    P_ENTITY_TYPE          => :p_entity_type,
    P_ENTITY_ID            => :p_entity_id,
    P_ENTITY_GUID          => :p_entity_guid,
    P_ENTITY_DATA_JSON     => :p_entity_data_json,
    P_ACTION_URL           => :p_action_url,
    P_ICON_CODE            => :p_icon_code,
    P_METADATA_JSON        => :p_metadata_json,
    P_PUSH_REQUIRED_FLAG   => :p_push_required_flag,
    P_SOURCE_SYSTEM        => :p_source_system,
    P_CREATED_BY           => :p_created_by,
    O_NOTIFICATION_ID      => :o_notification_id,
    O_RECIPIENT_ID         => :o_recipient_id,
    O_RESULT               => :o_result
  );
END;`;

  const binds = {
    p_enterprise_id: bindInNumber(payload.enterpriseId),
    p_user_id: bindInNumber(payload.recipientUserId),
    p_employee_id: bindInNumber(payload.recipientEmployeeId),
    p_module_code: bindInString(payload.module, 100),
    p_notification_type: bindInString(payload.type, 100),
    p_title: bindInString(payload.title, 500),
    p_message: bindInString(payload.message, 4000),
    p_priority: bindInString(payload.priority, 30),
    p_entity_type: bindInString(payload.entityType, 100),
    p_entity_id: bindInString(payload.entityId, 100),
    p_entity_guid: bindInString(payload.entityGuid, 32),
    p_entity_data_json: bindInString(payload.entityDataJson, 4000),
    p_action_url: bindInString(payload.actionUrl, 1000),
    p_icon_code: bindInString(payload.iconCode, 100),
    p_metadata_json: bindInString(payload.metadataJson, 4000),
    p_push_required_flag: bindInString(payload.pushRequiredFlag, 1),
    p_source_system: bindInString(payload.sourceSystem, 100),
    p_created_by: bindInString(payload.createdBy, 500),
    o_notification_id: bindOutNumber(),
    o_recipient_id: bindOutNumber(),
    o_result: bindOutClob()
  };

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(plsql, binds, { autoCommit: false });
      const message = await readClobOut(result.outBinds?.o_result);
      await commitConnection(connection);

      return {
        notificationId: numOrNull(result.outBinds?.o_notification_id),
        recipientId: numOrNull(result.outBinds?.o_recipient_id),
        message: strOrNull(message)
      };
    });
  } catch (err) {
    rethrowDbError(err, 'createNotificationForUser');
  }
}

export async function updateRecipientPushStatus({
  recipientId,
  enterpriseId,
  userId,
  pushStatus,
  deliveryStatus,
  pushErrorMessage = null
}) {
  const sql = `
UPDATE ${NOTIFICATION_TABLES.RECIPIENTS}
   SET PUSH_STATUS = :push_status,
       PUSH_SENT_DATE = CASE WHEN :push_status = 'SENT' THEN SYSTIMESTAMP ELSE PUSH_SENT_DATE END,
       PUSH_ERROR_MESSAGE = :push_error_message,
       DELIVERY_STATUS = :delivery_status,
       LAST_UPDATE_DATE = SYSTIMESTAMP
 WHERE RECIPIENT_ID = :recipient_id
   AND ENTERPRISE_ID = :enterprise_id
   AND USER_ID = :user_id`;

  try {
    return await withConnection(async (connection) => {
      await connection.execute(
        sql,
        {
          push_status: bindInString(pushStatus, 30),
          push_error_message: bindInString(pushErrorMessage, 4000),
          delivery_status: bindInString(deliveryStatus, 30),
          recipient_id: bindInNumber(recipientId),
          enterprise_id: bindInNumber(enterpriseId),
          user_id: bindInNumber(userId)
        },
        { autoCommit: false }
      );
      await commitConnection(connection);
    });
  } catch (err) {
    rethrowDbError(err, 'updateRecipientPushStatus');
  }
}

export async function selectNotificationByRecipientId({
  enterpriseId,
  userId,
  recipientId
}) {
  const sql = `
${LIST_SELECT_SQL}
WHERE R.RECIPIENT_ID = :recipient_id
  AND R.ENTERPRISE_ID = :enterprise_id
  AND R.USER_ID = :user_id
FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        sql,
        {
          recipient_id: bindInNumber(recipientId),
          enterprise_id: bindInNumber(enterpriseId),
          user_id: bindInNumber(userId)
        },
        ROW_OPTS
      );
      return mapNotificationRow(result.rows?.[0]);
    });
  } catch (err) {
    rethrowDbError(err, 'selectNotificationByRecipientId');
  }
}
