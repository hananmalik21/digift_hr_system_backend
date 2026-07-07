/**
 * PAY Element Eligibility Profiles API.
 * Reads: PAY.V_PAY_ELEMENT_ELIG_PROFILES | DML: PAY.PAY_ELEMENT_ELIG_PROFILES_PKG
 */
import '../swagger/payElementEligProfiles.swagger.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createElementEligProfile,
  deleteElementEligProfile,
  getElementEligProfileByGuid,
  getElementEligProfiles,
  setElementEligProfileStatus,
  updateElementEligProfile,
  linkElementToEligProfile,
  unlinkElementFromEligProfile
} from '../services/payElementEligProfiles.service.js';
import {
  resolveAuditActor,
  sendGetOutcome,
  sendListData,
  sendMutationOutcome,
  sendNotFoundError,
  withPayElementEligProfileErrorHandling
} from './payElementEligProfilesControllerHelpers.js';
import {
  validateCreateElementEligProfile,
  validateDeleteElementEligProfile,
  validateGetElementEligProfileByGuid,
  validateListElementEligProfiles,
  validateSetElementEligProfileStatus,
  validateUpdateElementEligProfile,
  validateLinkElementEligProfile,
  validateUnlinkElementEligProfile
} from '../middleware/payElementEligProfiles.validation.middleware.js';

/** GET /api/pay/element-elig-profiles */
export const getElementEligProfilesHandler = [
  validateListElementEligProfiles,
  asyncHandler(async (req, res) =>
    withPayElementEligProfileErrorHandling(res, async () =>
      sendListData(res, await getElementEligProfiles(req.validated))
    )
  )
];

/** GET /api/pay/element-elig-profiles/:profileGuid */
export const getElementEligProfileByGuidHandler = [
  validateGetElementEligProfileByGuid,
  asyncHandler(async (req, res) =>
    withPayElementEligProfileErrorHandling(res, async () =>
      sendGetOutcome(
        res,
        await getElementEligProfileByGuid(req.profileGuid, req.enterpriseId, req)
      )
    )
  )
];

/** POST /api/pay/element-elig-profiles */
export const createElementEligProfileHandler = [
  validateCreateElementEligProfile,
  asyncHandler(async (req, res) =>
    withPayElementEligProfileErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createElementEligProfile(req.validated, resolveAuditActor(req))
      )
    )
  )
];

/** PUT /api/pay/element-elig-profiles/:profileGuid */
export const updateElementEligProfileHandler = [
  validateUpdateElementEligProfile,
  asyncHandler(async (req, res) =>
    withPayElementEligProfileErrorHandling(res, async () => {
      const outcome = await updateElementEligProfile(
        req.profileGuid,
        req.validated,
        resolveAuditActor(req),
        req
      );
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PATCH /api/pay/element-elig-profiles/:profileGuid/status */
export const setElementEligProfileStatusHandler = [
  validateSetElementEligProfileStatus,
  asyncHandler(async (req, res) =>
    withPayElementEligProfileErrorHandling(res, async () => {
      const outcome = await setElementEligProfileStatus(
        req.profileGuid,
        req.validated.status,
        resolveAuditActor(req),
        req
      );
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/element-elig-profiles/:profileGuid */
export const deleteElementEligProfileHandler = [
  validateDeleteElementEligProfile,
  asyncHandler(async (req, res) =>
    withPayElementEligProfileErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteElementEligProfile(
          req.profileGuid,
          req.validated.hard_delete,
          resolveAuditActor(req),
          req.enterpriseId
        )
      )
    )
  )
];

/** POST /api/pay/element-elig-profiles/:profileGuid/elements */
export const linkElementToEligProfileHandler = [
  validateLinkElementEligProfile,
  asyncHandler(async (req, res) =>
    withPayElementEligProfileErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await linkElementToEligProfile(
          req.profileGuid,
          req.validated,
          resolveAuditActor(req),
          req
        )
      )
    )
  )
];

/** DELETE /api/pay/element-elig-profiles/:profileGuid/elements/:elementGuid */
export const unlinkElementFromEligProfileHandler = [
  validateUnlinkElementEligProfile,
  asyncHandler(async (req, res) =>
    withPayElementEligProfileErrorHandling(res, async () => {
      const outcome = await unlinkElementFromEligProfile(
        req.profileGuid,
        req.elementGuid,
        req.enterpriseId,
        req
      );
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];
