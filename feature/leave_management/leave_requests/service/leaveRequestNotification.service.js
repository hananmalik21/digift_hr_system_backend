import { notificationService } from '../../../notifications/index.js';
import { NOTIFICATION_MODULES, NOTIFICATION_PRIORITY } from '../../../notifications/constants/notification.constants.js';
import {
  LEAVE_NOTIFICATION_EVENTS,
  LEAVE_NOTIFICATION_ICON,
  LEAVE_NOTIFICATION_TYPES
} from '../constants/leaveRequestNotification.constants.js';
import * as leaveNotificationRepository from '../repository/leaveRequestNotification.repository.js';

const LOG_TAG = 'leave-request-notification';

function formatDateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function normalizeGuid(value) {
  if (value == null || value === '') return null;
  return String(value).replace(/-/g, '').toUpperCase();
}

function buildEmployeeDisplayName(context, leaveRequest) {
  if (context?.employeeName) return context.employeeName;

  const info = leaveRequest?.employee_info;
  if (!info) return 'Employee';

  return [
    info.first_name_en,
    info.middle_name_en,
    info.last_name_en
  ].filter(Boolean).join(' ').trim() || 'Employee';
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
  const employeeGuid = normalizeGuid(
    context?.employeeGuid ||
    leaveRequest?.employee_info?.employee_guid ||
    leaveRequest?.employee_guid
  );

  return {
    type: 'ABSENCE_REQUEST',
    id: leaveRequest?.leave_request_id != null ? String(leaveRequest.leave_request_id) : null,
    guid: normalizeGuid(leaveRequest?.leave_request_guid),
    data: {
      employeeId: leaveRequest?.employee_id ?? context?.employeeId ?? null,
      employeeGuid,
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
  return leaveRequest?.employee_id ?? leaveRequest?.employee_info?.employee_id ?? null;
}

async function createLeaveNotification({
  enterpriseId,
  actorUsername,
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
  if (!enterpriseId || !recipientUserId) {
    return null;
  }

  return notificationService.createNotificationForEnterprise({
    enterpriseId,
    createdBy: actorUsername || String(actorUserId || 'SYSTEM'),
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

function uniquePositiveIds(ids) {
  return [...new Set((ids ?? []).filter((id) => Number.isFinite(id) && id > 0))];
}

async function notifyApprover({
  enterpriseId,
  employeeId,
  leaveRequest,
  context,
  actorUserId,
  actorUsername,
  type,
  title,
  message,
  metadata = {}
}) {
  const [approverUserId, adminUserIds] = await Promise.all([
    leaveNotificationRepository.findReportingManagerUserId(enterpriseId, employeeId),
    leaveNotificationRepository.findEnterpriseAdminUserIds(enterpriseId)
  ]);

  const recipientUserIds = uniquePositiveIds([approverUserId, ...adminUserIds]);

  if (!recipientUserIds.length) {
    console.warn(`[${LOG_TAG}] No reporting manager or enterprise admin user found`, {
      enterpriseId,
      employeeId
    });
    return null;
  }

  const results = await Promise.allSettled(
    recipientUserIds.map((recipientUserId) =>
      createLeaveNotification({
        enterpriseId,
        actorUserId,
        actorUsername,
        recipientUserId,
        type,
        title,
        message,
        actionUrl: buildActionUrl('/absence/approvals', leaveRequest),
        iconCode: LEAVE_NOTIFICATION_ICON.CALENDAR,
        leaveRequest,
        context,
        metadata
      })
    )
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(`[${LOG_TAG}] Failed to notify manager/admin recipient`, {
        enterpriseId,
        message: result.reason?.message || String(result.reason)
      });
    }
  }

  return results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
}

async function notifyEmployee({
  enterpriseId,
  employeeId,
  leaveRequest,
  context,
  actorUserId,
  actorUsername,
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
    console.warn(`[${LOG_TAG}] No linked user found for employee`, { enterpriseId, employeeId });
    return null;
  }

  return createLeaveNotification({
    enterpriseId,
    actorUserId,
    actorUsername,
    recipientUserId: employeeUserId,
    recipientEmployeeId: employeeId,
    type,
    title,
    message,
    actionUrl: buildActionUrl('/absence/requests', leaveRequest),
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

const SUBMITTED_EVENTS = new Set([
  LEAVE_NOTIFICATION_EVENTS.CREATED_AND_SUBMITTED,
  LEAVE_NOTIFICATION_EVENTS.SUBMITTED
]);

export async function notifyLeaveRequestEvent({
  event,
  enterpriseId,
  leaveRequest,
  actorUserId = null,
  actorUsername = null,
  rejectionReason = null
}) {
  if (!enterpriseId || !leaveRequest) {
    return null;
  }

  const employeeId = extractEmployeeId(leaveRequest);
  if (!employeeId) {
    console.warn(`[${LOG_TAG}] Missing employee_id on leave request`, {
      event,
      leaveRequestGuid: leaveRequest?.leave_request_guid
    });
    return null;
  }

  const context = await leaveNotificationRepository.findLeaveNotificationContext({
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
    actorUserId,
    actorUsername
  };

  if (SUBMITTED_EVENTS.has(event)) {
    return notifyApprover({
      ...common,
      type: LEAVE_NOTIFICATION_TYPES.APPROVAL_REQUIRED,
      title: 'Leave Approval Required',
      message: `${employeeName} submitted a ${leaveTypeName} request.`,
      metadata: { workflowStep: 'SUBMITTED' }
    });
  }

  if (event === LEAVE_NOTIFICATION_EVENTS.APPROVED) {
    return notifyEmployee({
      ...common,
      type: LEAVE_NOTIFICATION_TYPES.LEAVE_APPROVED,
      title: 'Leave Request Approved',
      message: `Your ${leaveTypeName} request has been approved.`,
      metadata: { workflowStep: 'APPROVED' }
    });
  }

  if (event === LEAVE_NOTIFICATION_EVENTS.REJECTED) {
    return notifyEmployee({
      ...common,
      type: LEAVE_NOTIFICATION_TYPES.LEAVE_REJECTED,
      title: 'Leave Request Rejected',
      message: rejectionReason
        ? `Your ${leaveTypeName} request was rejected. Reason: ${rejectionReason}`
        : `Your ${leaveTypeName} request was rejected.`,
      metadata: {
        workflowStep: 'REJECTED',
        rejectionReason: rejectionReason || null
      },
      entityExtra: rejectionReason ? { rejectionReason } : {}
    });
  }

  if (event === LEAVE_NOTIFICATION_EVENTS.WITHDRAWN) {
    return notifyApprover({
      ...common,
      type: LEAVE_NOTIFICATION_TYPES.LEAVE_WITHDRAWN,
      title: 'Leave Request Withdrawn',
      message: `${employeeName} withdrew a ${leaveTypeName} request.`,
      metadata: { workflowStep: 'WITHDRAWN' }
    });
  }

  return null;
}

export function dispatchLeaveRequestNotification(payload) {
  notifyLeaveRequestEvent(payload).catch((err) => {
    console.error(`[${LOG_TAG}] Failed to dispatch notification`, {
      event: payload?.event,
      enterpriseId: payload?.enterpriseId,
      message: err?.message || String(err)
    });
  });
}

export const leaveRequestNotificationService = {
  notifyLeaveRequestEvent,
  dispatchLeaveRequestNotification
};
