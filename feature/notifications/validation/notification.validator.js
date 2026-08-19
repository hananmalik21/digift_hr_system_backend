import { z } from 'zod';
import {
  NOTIFICATION_CLEAR_TYPE,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_DEVICE_FIELD_LIMITS,
  NOTIFICATION_LIST_STATUS,
  NOTIFICATION_PRIORITY,
  NOTIFICATION_TARGET_TYPES
} from '../constants/notification.constants.js';

const boundedString = (maxSize, label) =>
  z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, { message: `${label} is required` })
    .max(maxSize, { message: `${label} must be at most ${maxSize} characters` });

const optionalBoundedString = (maxSize, label) =>
  z
    .string()
    .trim()
    .min(1, { message: `${label} cannot be empty when provided` })
    .max(maxSize, { message: `${label} must be at most ${maxSize} characters` })
    .optional();

const notificationTargetBodySchema = z.object({
  targetType: z.enum([NOTIFICATION_TARGET_TYPES.TOKEN], {
    message: `targetType must be one of: ${NOTIFICATION_TARGET_TYPES.TOKEN}`
  }),
  targetValue: boundedString(
    NOTIFICATION_DEVICE_FIELD_LIMITS.TARGET_VALUE,
    'targetValue'
  )
});

const relativeActionUrlSchema = z
  .string()
  .trim()
  .refine((value) => value.startsWith('/') && !value.startsWith('//'), {
    message: 'actionUrl must be an application-relative path starting with "/"'
  });

const guidParamSchema = z
  .string()
  .trim()
  .min(1, { message: 'guid is required' })
  .transform((value) => value.replace(/-/g, '').toUpperCase())
  .refine((value) => /^[0-9A-F]{32}$/.test(value), {
    message: 'guid must be a 32-character hexadecimal string'
  });

const entitySchema = z
  .object({
    type: z.string().trim().min(1, { message: 'entity.type is required' }).optional(),
    id: z.union([z.string(), z.number()]).optional(),
    guid: z.string().trim().optional(),
    data: z.record(z.string(), z.unknown()).optional()
  })
  .optional();

export const listNotificationsQuerySchema = z.object({
  status: z
    .enum([
      NOTIFICATION_LIST_STATUS.ALL,
      NOTIFICATION_LIST_STATUS.READ,
      NOTIFICATION_LIST_STATUS.UNREAD
    ])
    .optional()
    .default(NOTIFICATION_LIST_STATUS.ALL),
  module: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  priority: z
    .enum([
      NOTIFICATION_PRIORITY.LOW,
      NOTIFICATION_PRIORITY.NORMAL,
      NOTIFICATION_PRIORITY.HIGH,
      NOTIFICATION_PRIORITY.URGENT
    ])
    .optional(),
  page: z.coerce.number().int().min(1).optional().default(NOTIFICATION_DEFAULTS.PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTIFICATION_DEFAULTS.MAX_LIMIT)
    .optional()
    .default(NOTIFICATION_DEFAULTS.LIMIT)
});

export const clearNotificationsQuerySchema = z.object({
  type: z
    .enum([
      NOTIFICATION_CLEAR_TYPE.ALL,
      NOTIFICATION_CLEAR_TYPE.READ,
      NOTIFICATION_CLEAR_TYPE.UNREAD
    ])
    .optional()
    .default(NOTIFICATION_CLEAR_TYPE.ALL)
});

export const createNotificationBodySchema = z.object({
  recipientUserId: z.coerce.number().int().positive({
    message: 'recipientUserId is required'
  }),
  recipientEmployeeId: z.coerce.number().int().positive().optional().nullable(),
  module: z.string().trim().min(1, { message: 'module is required' }),
  type: z.string().trim().min(1, { message: 'type is required' }),
  title: z.string().trim().min(1, { message: 'title is required' }),
  message: z.string().trim().min(1, { message: 'message is required' }),
  priority: z
    .enum([
      NOTIFICATION_PRIORITY.LOW,
      NOTIFICATION_PRIORITY.NORMAL,
      NOTIFICATION_PRIORITY.HIGH,
      NOTIFICATION_PRIORITY.URGENT
    ])
    .optional()
    .default(NOTIFICATION_DEFAULTS.PRIORITY),
  entity: entitySchema,
  actionUrl: relativeActionUrlSchema.optional(),
  iconCode: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  pushRequired: z.boolean().optional().default(false)
});

export const registerDeviceBodySchema = notificationTargetBodySchema.extend({
  deviceType: boundedString(
    NOTIFICATION_DEVICE_FIELD_LIMITS.DEVICE_TYPE,
    'deviceType'
  ),
  deviceName: optionalBoundedString(
    NOTIFICATION_DEVICE_FIELD_LIMITS.DEVICE_NAME,
    'deviceName'
  ),
  browserName: optionalBoundedString(
    NOTIFICATION_DEVICE_FIELD_LIMITS.BROWSER_NAME,
    'browserName'
  ),
  browserVersion: optionalBoundedString(
    NOTIFICATION_DEVICE_FIELD_LIMITS.BROWSER_VERSION,
    'browserVersion'
  ),
  operatingSystem: optionalBoundedString(
    NOTIFICATION_DEVICE_FIELD_LIMITS.OPERATING_SYSTEM,
    'operatingSystem'
  )
});

export const deactivateDeviceBodySchema = notificationTargetBodySchema;

export const recipientGuidParamSchema = z.object({
  recipientGuid: guidParamSchema
});

export const deviceGuidParamSchema = z.object({
  deviceGuid: guidParamSchema
});

export function firstValidationIssueMessage(zodError, fallback) {
  return zodError?.issues?.[0]?.message || fallback;
}

export function parseWithSchema(schema, input) {
  return schema.safeParse(input ?? {});
}
