import {
  getActingEnterpriseId,
  getActingUserId,
  getActingUsername
} from '../../../../utils/userContext.js';
import { dispatchLeaveRequestNotification } from '../service/leaveRequestNotification.service.js';

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

  dispatchLeaveRequestNotification({
    event,
    enterpriseId: tenantId ?? actor.enterpriseId,
    leaveRequest,
    actorUserId: actor.actorUserId,
    actorUsername: actor.actorUsername,
    ...extra
  });
}
