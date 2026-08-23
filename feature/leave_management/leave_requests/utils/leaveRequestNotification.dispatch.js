import {
  getActingEnterpriseId,
  getActingUserId,
  getActingUsername
} from '../../../../utils/userContext.js';
import { dispatchLeaveRequestNotification } from '../service/leaveRequestNotification.service.js';

const LOG_TAG = 'leave-request-notification';

export function resolveLeaveNotificationActor(req, headerUserId = null) {
  return {
    actorUserId: getActingUserId(req),
    actorUsername: getActingUsername(req) || headerUserId || null,
    enterpriseId: getActingEnterpriseId(req)
  };
}

export function dispatchLeaveRequestNotificationFromRequest(
  req,
  {
    tenantId,
    headerUserId = null,
    event,
    leaveRequest,
    extra = {}
  }
) {
  const actor = resolveLeaveNotificationActor(req, headerUserId);
  const enterpriseId = actor.enterpriseId ?? tenantId;

  console.info(`[${LOG_TAG}] dispatch`, {
    event,
    enterpriseId,
    actorUserId: actor.actorUserId,
    leaveRequestId: leaveRequest?.leave_request_id ?? null,
    leaveRequestGuid: leaveRequest?.leave_request_guid ?? null,
    requestStatus: leaveRequest?.request_status ?? null
  });

  return dispatchLeaveRequestNotification({
    event,
    enterpriseId,
    leaveRequest,
    actorUserId: actor.actorUserId,
    actorUsername: actor.actorUsername,
    ...extra
  });
}
