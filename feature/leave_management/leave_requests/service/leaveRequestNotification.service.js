import { notificationService } from '../../../notifications/index.js';
import * as notificationRepository from '../../../notifications/repository/notification.repository.js';
import {
  NOTIFICATION_MODULES,
  NOTIFICATION_PRIORITY
} from '../../../notifications/constants/notification.constants.js';
import {
  LEAVE_NOTIFICATION_EVENTS,
  LEAVE_NOTIFICATION_ICON,
  LEAVE_NOTIFICATION_TYPES
} from '../constants/leaveRequestNotification.constants.js';
import * as leaveNotificationRepository from '../repository/leaveRequestNotification.repository.js';

const LOG_TAG = 'leave-request-notification';

const APPROVALS_PATH = '/absence/approvals';
const REQUESTS_PATH = '/absence/requests';

const SUBMITTED_EVENTS = new Set([
  LEAVE_NOTIFICATION_EVENTS.CREATED_AND_SUBMITTED,
  LEAVE_NOTIFICATION_EVENTS.SUBMITTED
]);

function formatDateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function normalizeGuid(value) {
  if (value == null || value === '') return null;
  return String(value).replace(/-/g, '').toUpperCase();
}

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildEmployeeDisplayName(context, leaveRequest) {
  if (context?.employeeName) return context.employeeName;

  const info = leaveRequest?.employee_info;
  if (!info) return 'Employee';

  return (
    [info.first_name_en, info.middle_name_en, info.last_name_en]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Employee'
  );
}

function buildLeaveTypeName(context, leaveRequest) {
  return (
    context?.leaveTypeName ||
    leaveRequest?.leave_type_info?.leave_name_en ||
    leaveRequest?.leave_type_info?.leave_code ||
    'Leave'
  );
}

function buildEntityPayload({ leaveRequest, context, entityExtra = {} }) {
  return {
    type: 'ABSENCE_REQUEST',
    id: leaveRequest?.leave_request_id != null ? String(leaveRequest.leave_request_id) : null,
    guid: normalizeGuid(leaveRequest?.leave_request_guid),
    data: {
      employeeId: leaveRequest?.employee_id ?? context?.employeeId ?? null,
      employeeGuid: normalizeGuid(
        context?.employeeGuid ||
          leaveRequest?.employee_info?.employee_guid ||
          leaveRequest?.employee_guid
      ),
      employeeNumber: context?.employeeNumber ?? leaveRequest?.employee_info?.employee_number ?? null,
      employeeName: buildEmployeeDisplayName(context, leaveRequest),
      absenceType: buildLeaveTypeName(context, leaveRequest),
      startDate: formatDateOnly(leaveRequest?.start_date),
      endDate: formatDateOnly(leaveRequest?.end_date),
      duration: leaveRequest?.total_days ?? null,
      requestStatus: leaveRequest?.request_status ?? null,
      ...entityExtra
    }
  };
}

function buildActionUrl(basePath, leaveRequest) {
  const requestGuid = normalizeGuid(leaveRequest?.leave_request_guid);
  return requestGuid ? `${basePath}/${requestGuid}` : basePath;
}

function extractEmployeeId(leaveRequest) {
  return toPositiveInt(
    leaveRequest?.employee_id ?? leaveRequest?.employee_info?.employee_id
  );
}

function dedupeRecipients(recipients, ...excludedIds) {
  const excluded = new Set(excludedIds.map(toPositiveInt).filter(Boolean));
  const unique = [];
  const seen = new Set();

  for (const row of recipients ?? []) {
    const userId = toPositiveInt(row?.userId);
    if (!userId || seen.has(userId) || excluded.has(userId)) continue;
    seen.add(userId);
    unique.push({
      userId,
      employeeId: toPositiveInt(row?.employeeId)
    });
  }

  return unique;
}

async function createLeaveNotification({
  enterpriseId,
  actorUserId,
  recipientUserId,
  recipientEmployeeId = null,
  type,
  title,
  message,
  actionUrl,
  iconCode,
  leaveRequest,
  context,
  metadata = {},
  entityExtra = {},
  pushRequired = true
}) {
  if (!enterpriseId || !recipientUserId) return null;

  const entityGuid = normalizeGuid(leaveRequest?.leave_request_guid);
  if (entityGuid) {
    const existing = await notificationRepository.findOpenNotificationForUserEntity({
      enterpriseId,
      userId: recipientUserId,
      type,
      entityGuid
    });
    if (existing) return null;
  }

  return notificationService.createNotificationForEnterprise({
    enterpriseId,
    createdBy: actorUserId,
    recipientUserId,
    recipientEmployeeId,
    module: NOTIFICATION_MODULES.ABSENCE,
    type,
    title,
    message,
    priority: NOTIFICATION_PRIORITY.NORMAL,
    entity: buildEntityPayload({ leaveRequest, context, entityExtra }),
    actionUrl,
    iconCode,
    metadata: {
      category: 'ABSENCE',
      source: 'ABSENCE_WORKFLOW',
      eventType: type,
      ...metadata
    },
    pushRequired
  });
}

async function notifyUsers({
  enterpriseId,
  recipients,
  actorUserId,
  type,
  title,
  message,
  actionUrl,
  iconCode,
  leaveRequest,
  context,
  metadata = {},
  entityExtra = {}
}) {
  const uniqueRecipients = dedupeRecipients(recipients);
  if (!uniqueRecipients.length) return [];

  console.info(`[${LOG_TAG}] notify recipients`, {
    enterpriseId,
    type,
    count: uniqueRecipients.length,
    userIds: uniqueRecipients.map((row) => row.userId)
  });

  const results = await Promise.allSettled(
    uniqueRecipients.map((recipient) =>
      createLeaveNotification({
        enterpriseId,
        actorUserId,
        recipientUserId: recipient.userId,
        recipientEmployeeId: recipient.employeeId,
        type,
        title,
        message,
        actionUrl,
        iconCode,
        leaveRequest,
        context,
        metadata,
        entityExtra
      })
    )
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(`[${LOG_TAG}] Failed to notify recipient`, {
        enterpriseId,
        type,
        message: result.reason?.message || String(result.reason)
      });
    }
  }

  return results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter(Boolean);
}

async function resolveAudience({ enterpriseId, employeeId }) {
  const [managerUserId, adminRecipients, employeeUserId] = await Promise.all([
    leaveNotificationRepository.findReportingManagerUserId(enterpriseId, employeeId),
    leaveNotificationRepository.findEnterpriseAdminUsers(enterpriseId),
    leaveNotificationRepository.findUserIdByEmployeeId(enterpriseId, employeeId)
  ]);

  return { managerUserId, adminRecipients, employeeUserId };
}

async function notifyApproverAudience({
  enterpriseId,
  employeeId,
  leaveRequest,
  context,
  actorUserId,
  type,
  title,
  message,
  metadata = {}
}) {
  const { managerUserId, adminRecipients, employeeUserId } = await resolveAudience({
    enterpriseId,
    employeeId
  });

  const recipients = dedupeRecipients(
    [
      managerUserId ? { userId: managerUserId, employeeId: null } : null,
      ...adminRecipients
    ],
    employeeUserId
  );

  if (!recipients.length) {
    console.warn(`[${LOG_TAG}] No manager or enterprise admin found`, {
      enterpriseId,
      employeeId
    });
    return null;
  }

  return notifyUsers({
    enterpriseId,
    recipients,
    actorUserId,
    type,
    title,
    message,
    actionUrl: buildActionUrl(APPROVALS_PATH, leaveRequest),
    iconCode: LEAVE_NOTIFICATION_ICON.CALENDAR,
    leaveRequest,
    context,
    metadata
  });
}

async function notifyAdminAudience({
  enterpriseId,
  employeeId,
  leaveRequest,
  context,
  actorUserId,
  type,
  title,
  message,
  metadata = {},
  entityExtra = {}
}) {
  const { adminRecipients, employeeUserId } = await resolveAudience({
    enterpriseId,
    employeeId
  });

  const recipients = dedupeRecipients(adminRecipients, employeeUserId);
  if (!recipients.length) return [];

  return notifyUsers({
    enterpriseId,
    recipients,
    actorUserId,
    type,
    title,
    message,
    actionUrl: buildActionUrl(APPROVALS_PATH, leaveRequest),
    iconCode: LEAVE_NOTIFICATION_ICON.CALENDAR,
    leaveRequest,
    context,
    metadata,
    entityExtra
  });
}

async function notifyEmployee({
  enterpriseId,
  employeeId,
  leaveRequest,
  context,
  actorUserId,
  type,
  title,
  message,
  metadata = {},
  entityExtra = {}
}) {
  const employeeUserId = await leaveNotificationRepository.findUserIdByEmployeeId(
    enterpriseId,
    employeeId
  );

  if (!employeeUserId) {
    console.warn(`[${LOG_TAG}] No linked user found for employee`, {
      enterpriseId,
      employeeId
    });
    return null;
  }

  return createLeaveNotification({
    enterpriseId,
    actorUserId,
    recipientUserId: employeeUserId,
    recipientEmployeeId: employeeId,
    type,
    title,
    message,
    actionUrl: buildActionUrl(REQUESTS_PATH, leaveRequest),
    iconCode:
      type === LEAVE_NOTIFICATION_TYPES.LEAVE_REJECTED
        ? LEAVE_NOTIFICATION_ICON.X
        : LEAVE_NOTIFICATION_ICON.CHECK,
    leaveRequest,
    context,
    metadata,
    entityExtra
  });
}

async function loadLeaveNotificationContext({ enterpriseId, employeeId, leaveTypeId }) {
  try {
    return await leaveNotificationRepository.findLeaveNotificationContext({
      enterpriseId,
      employeeId,
      leaveTypeId
    });
  } catch (err) {
    console.error(`[${LOG_TAG}] Failed to load leave notification context`, {
      enterpriseId,
      employeeId,
      leaveTypeId,
      message: err?.message || String(err)
    });
    return null;
  }
}

function buildDecisionCopy({ employeeName, leaveTypeName, rejectionReason, forEmployee }) {
  if (forEmployee) {
    return {
      approved: {
        title: 'Leave Request Approved',
        message: `Your ${leaveTypeName} request has been approved.`
      },
      rejected: {
        title: 'Leave Request Rejected',
        message: rejectionReason
          ? `Your ${leaveTypeName} request was rejected. Reason: ${rejectionReason}`
          : `Your ${leaveTypeName} request was rejected.`
      }
    };
  }

  return {
    approved: {
      title: 'Leave Request Approved',
      message: `${employeeName}'s ${leaveTypeName} request has been approved.`
    },
    rejected: {
      title: 'Leave Request Rejected',
      message: rejectionReason
        ? `${employeeName}'s ${leaveTypeName} request was rejected. Reason: ${rejectionReason}`
        : `${employeeName}'s ${leaveTypeName} request was rejected.`
    }
  };
}

async function handleDecisionEvent({
  event,
  common,
  employeeName,
  leaveTypeName,
  rejectionReason
}) {
  const isApproved = event === LEAVE_NOTIFICATION_EVENTS.APPROVED;
  const type = isApproved
    ? LEAVE_NOTIFICATION_TYPES.LEAVE_APPROVED
    : LEAVE_NOTIFICATION_TYPES.LEAVE_REJECTED;
  const workflowStep = isApproved ? 'APPROVED' : 'REJECTED';
  const entityExtra = !isApproved && rejectionReason ? { rejectionReason } : {};
  const metadata = {
    workflowStep,
    ...(rejectionReason ? { rejectionReason } : {})
  };

  const key = isApproved ? 'approved' : 'rejected';
  const adminCopy = buildDecisionCopy({
    employeeName,
    leaveTypeName,
    rejectionReason,
    forEmployee: false
  })[key];
  const employeeCopy = buildDecisionCopy({
    employeeName,
    leaveTypeName,
    rejectionReason,
    forEmployee: true
  })[key];

  await notifyAdminAudience({
    ...common,
    type,
    title: adminCopy.title,
    message: adminCopy.message,
    metadata,
    entityExtra
  });

  return notifyEmployee({
    ...common,
    type,
    title: employeeCopy.title,
    message: employeeCopy.message,
    metadata,
    entityExtra
  });
}

export async function notifyLeaveRequestEvent({
  event,
  enterpriseId,
  leaveRequest,
  actorUserId = null,
  actorUsername = null,
  rejectionReason = null
}) {
  if (!enterpriseId || !leaveRequest) return null;

  const employeeId = extractEmployeeId(leaveRequest);
  if (!employeeId) {
    console.warn(`[${LOG_TAG}] Missing employee_id on leave request`, {
      event,
      leaveRequestGuid: leaveRequest?.leave_request_guid
    });
    return null;
  }

  const context = await loadLeaveNotificationContext({
    enterpriseId,
    employeeId,
    leaveTypeId: leaveRequest?.leave_type_id
  });

  const employeeName = buildEmployeeDisplayName(context, leaveRequest);
  const leaveTypeName = buildLeaveTypeName(context, leaveRequest);
  const common = {
    enterpriseId,
    employeeId,
    leaveRequest,
    context,
    actorUserId
  };

  console.info(`[${LOG_TAG}] handling event`, {
    event,
    enterpriseId,
    employeeId,
    actorUserId,
    actorUsername: actorUsername || null,
    leaveRequestGuid: leaveRequest?.leave_request_guid ?? null
  });

  if (SUBMITTED_EVENTS.has(event)) {
    return notifyApproverAudience({
      ...common,
      type: LEAVE_NOTIFICATION_TYPES.APPROVAL_REQUIRED,
      title: 'Leave Approval Required',
      message: `${employeeName} submitted a ${leaveTypeName} request.`,
      metadata: { workflowStep: 'SUBMITTED' }
    });
  }

  if (
    event === LEAVE_NOTIFICATION_EVENTS.APPROVED ||
    event === LEAVE_NOTIFICATION_EVENTS.REJECTED
  ) {
    return handleDecisionEvent({
      event,
      common,
      employeeName,
      leaveTypeName,
      rejectionReason
    });
  }

  if (event === LEAVE_NOTIFICATION_EVENTS.WITHDRAWN) {
    return notifyApproverAudience({
      ...common,
      type: LEAVE_NOTIFICATION_TYPES.LEAVE_WITHDRAWN,
      title: 'Leave Request Withdrawn',
      message: `${employeeName} withdrew a ${leaveTypeName} request.`,
      metadata: { workflowStep: 'WITHDRAWN' }
    });
  }

  console.warn(`[${LOG_TAG}] Unsupported leave notification event`, { event });
  return null;
}

export function dispatchLeaveRequestNotification(payload) {
  return notifyLeaveRequestEvent(payload).catch((err) => {
    console.error(`[${LOG_TAG}] Failed to dispatch notification`, {
      event: payload?.event,
      enterpriseId: payload?.enterpriseId,
      message: err?.message || String(err)
    });
    return null;
  });
}

export const leaveRequestNotificationService = {
  notifyLeaveRequestEvent,
  dispatchLeaveRequestNotification
};
