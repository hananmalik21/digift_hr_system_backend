import { bufferToGuidHex } from '../../../src/utils/oracleGuid.js';

export function parseOracleJson(value) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'object' && !Buffer.isBuffer(value)) {
    return value;
  }

  try {
    const raw = typeof value === 'string' ? value : String(value);
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function formatOracleDate(value) {
  if (value == null || value === '') {
    return null;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function normalizeGuidValue(value) {
  if (value == null || value === '') {
    return null;
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return bufferToGuidHex(buf)?.toUpperCase() ?? null;
  }

  const text = String(value).trim();
  if (!text) return null;
  return text.replace(/-/g, '').toUpperCase();
}

export function mapNotificationRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const entityData = parseOracleJson(row.ENTITY_DATA_JSON ?? row.entity_data_json);
  const metadata = parseOracleJson(row.METADATA_JSON ?? row.metadata_json);
  const readFlag = String(row.READ_FLAG ?? row.read_flag ?? 'N').toUpperCase() === 'Y';

  return {
    recipientId: row.RECIPIENT_ID ?? row.recipient_id ?? null,
    recipientGuid: normalizeGuidValue(row.RECIPIENT_GUID ?? row.recipient_guid),
    notificationId: row.NOTIFICATION_ID ?? row.notification_id ?? null,
    notificationGuid: normalizeGuidValue(row.NOTIFICATION_GUID ?? row.notification_guid),
    enterpriseId: row.ENTERPRISE_ID ?? row.enterprise_id ?? null,
    recipientUserId: row.USER_ID ?? row.user_id ?? null,
    module: row.MODULE_CODE ?? row.module_code ?? null,
    type: row.NOTIFICATION_TYPE ?? row.notification_type ?? null,
    title: row.TITLE ?? row.title ?? null,
    message: row.MESSAGE ?? row.message ?? null,
    priority: row.PRIORITY ?? row.priority ?? null,
    entity: {
      type: row.ENTITY_TYPE ?? row.entity_type ?? null,
      id: row.ENTITY_ID != null ? String(row.ENTITY_ID ?? row.entity_id) : null,
      guid: normalizeGuidValue(row.ENTITY_GUID ?? row.entity_guid),
      data: entityData
    },
    actionUrl: row.ACTION_URL ?? row.action_url ?? null,
    iconCode: row.ICON_CODE ?? row.icon_code ?? null,
    metadata,
    sourceSystem: row.SOURCE_SYSTEM ?? row.source_system ?? null,
    read: readFlag,
    readDate: formatOracleDate(row.READ_DATE ?? row.read_date),
    dismissed: String(row.DISMISSED_FLAG ?? row.dismissed_flag ?? 'N').toUpperCase() === 'Y',
    deliveryStatus: row.DELIVERY_STATUS ?? row.delivery_status ?? null,
    pushRequired: String(row.PUSH_REQUIRED_FLAG ?? row.push_required_flag ?? 'N').toUpperCase() === 'Y',
    pushStatus: row.PUSH_STATUS ?? row.push_status ?? null,
    pushSentDate: formatOracleDate(row.PUSH_SENT_DATE ?? row.push_sent_date),
    creationDate: formatOracleDate(row.CREATION_DATE ?? row.creation_date)
  };
}

export function mapDeviceRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  return {
    deviceId: row.DEVICE_ID ?? row.device_id ?? null,
    deviceGuid: normalizeGuidValue(row.DEVICE_GUID ?? row.device_guid),
    enterpriseId: row.ENTERPRISE_ID ?? row.enterprise_id ?? null,
    userId: row.USER_ID ?? row.user_id ?? null,
    targetType: row.TARGET_TYPE ?? row.target_type ?? null,
    targetValue: row.TARGET_VALUE ?? row.target_value ?? null,
    deviceType: row.DEVICE_TYPE ?? row.device_type ?? null,
    deviceName: row.DEVICE_NAME ?? row.device_name ?? null,
    browserName: row.BROWSER_NAME ?? row.browser_name ?? null,
    browserVersion: row.BROWSER_VERSION ?? row.browser_version ?? null,
    operatingSystem: row.OPERATING_SYSTEM ?? row.operating_system ?? null,
    active: String(row.ACTIVE_FLAG ?? row.active_flag ?? 'N').toUpperCase() === 'Y',
    lastRegisteredDate: formatOracleDate(row.LAST_REGISTERED_DATE ?? row.last_registered_date),
    lastUsedDate: formatOracleDate(row.LAST_USED_DATE ?? row.last_used_date),
    creationDate: formatOracleDate(row.CREATION_DATE ?? row.creation_date),
    lastUpdateDate: formatOracleDate(row.LAST_UPDATE_DATE ?? row.last_update_date)
  };
}

/** API-safe device payload — never exposes the full FCM token. */
export function mapDevicePublicResponse(device) {
  if (!device) return null;

  return {
    deviceGuid: device.deviceGuid,
    targetType: device.targetType,
    deviceType: device.deviceType,
    deviceName: device.deviceName ?? null,
    browserName: device.browserName ?? null,
    browserVersion: device.browserVersion ?? null,
    operatingSystem: device.operatingSystem ?? null,
    active: device.active === true,
    lastRegisteredDate: device.lastRegisteredDate ?? null
  };
}

/** Internal push target shape (includes token value). */
export function mapActiveNotificationTarget(row) {
  const device = mapDeviceRow(row);
  if (!device) return null;

  const {
    deviceId,
    deviceGuid,
    targetType,
    targetValue,
    deviceType,
    deviceName,
    browserName,
    browserVersion,
    operatingSystem,
    lastRegisteredDate
  } = device;

  return {
    deviceId,
    deviceGuid,
    targetType,
    targetValue,
    deviceType,
    deviceName,
    browserName,
    browserVersion,
    operatingSystem,
    lastRegisteredDate
  };
}

export function buildPaginationMeta({ page, limit, total }) {
  const safeLimit = Math.max(limit, 1);
  const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;

  return {
    page,
    limit: safeLimit,
    total,
    totalPages
  };
}
