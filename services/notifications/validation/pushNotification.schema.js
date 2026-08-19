import { z } from 'zod';
import {
  NOTIFICATION_TARGET_TYPES,
  SUPPORTED_PUSH_TARGET_TYPES
} from '../constants.js';

const relativeActionUrlSchema = z
  .string()
  .trim()
  .refine((value) => value.startsWith('/') && !value.startsWith('//'), {
    message: 'actionUrl must be an application-relative path starting with "/"'
  });

export const pushNotificationSchema = z.object({
  targetType: z.enum(SUPPORTED_PUSH_TARGET_TYPES, {
    message: `targetType must be one of: ${SUPPORTED_PUSH_TARGET_TYPES.join(', ')}`
  }),
  targetValue: z
    .string({ message: 'targetValue is required' })
    .trim()
    .min(1, { message: 'targetValue is required' }),
  title: z
    .string({ message: 'title is required' })
    .trim()
    .min(1, { message: 'title is required' }),
  body: z
    .string({ message: 'body is required' })
    .trim()
    .min(1, { message: 'body is required' }),
  actionUrl: relativeActionUrlSchema.optional(),
  data: z.record(z.string(), z.unknown()).optional().default({})
});

export function firstValidationIssueMessage(zodError, fallback) {
  return zodError?.issues?.[0]?.message || fallback;
}

export function parsePushNotificationInput(input) {
  return pushNotificationSchema.safeParse(input ?? {});
}

export const NOTIFICATION_TARGET_TYPE = NOTIFICATION_TARGET_TYPES;
