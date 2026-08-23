import { ynFlag } from './notification.oracle.js';
import { NOTIFICATION_DEFAULTS } from '../constants/notification.constants.js';
import * as notificationRepository from '../repository/notification.repository.js';

export function serializeNotificationEntity(entity = {}) {
  const entityGuid = entity.guid ? String(entity.guid).replace(/-/g, '').toUpperCase() : null;

  return {
    entityType: entity.type ?? null,
    entityId: entity.id != null ? String(entity.id) : null,
    entityGuid,
    entityDataJson: entity.data ? JSON.stringify(entity.data) : null
  };
}

export async function persistNotificationForUser({
  enterpriseId,
  recipientUserId,
  recipientEmployeeId = null,
  module,
  type,
  title,
  message,
  priority = NOTIFICATION_DEFAULTS.PRIORITY,
  entity = {},
  actionUrl = null,
  iconCode = null,
  metadata = null,
  pushRequired = false,
  createdBy = null
}) {
  const serializedEntity = serializeNotificationEntity(entity);

  const createResult = await notificationRepository.createNotificationForUser({
    enterpriseId,
    recipientUserId,
    recipientEmployeeId,
    module,
    type,
    title,
    message,
    priority,
    entityType: serializedEntity.entityType,
    entityId: serializedEntity.entityId,
    entityGuid: serializedEntity.entityGuid,
    entityDataJson: serializedEntity.entityDataJson,
    actionUrl,
    iconCode,
    metadataJson: metadata ? JSON.stringify(metadata) : null,
    pushRequiredFlag: ynFlag(pushRequired, 'N'),
    sourceSystem: NOTIFICATION_DEFAULTS.SOURCE_SYSTEM,
    createdBy
  });

  const notification = createResult.recipientId
    ? await notificationRepository.selectNotificationByRecipientId({
        enterpriseId,
        userId: recipientUserId,
        recipientId: createResult.recipientId
      })
    : null;

  return {
    createResult,
    notification
  };
}
