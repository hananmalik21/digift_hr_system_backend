import {
  createProfileViaPackage,
  deleteProfileViaPackage,
  setProfileStatusViaPackage,
  updateProfileViaPackage
} from '../model/payElementEligProfilesModel.js';
import {
  linkElementViaPackage,
  unlinkElementViaPackage
} from '../model/payElementEligProfileElementsModel.js';
import {
  getElementEligProfileFromViewByGuid,
  listElementEligProfilesFromView
} from '../model/payElementEligProfilesViewModel.js';
import {
  CREATE_SUCCESS_MESSAGE,
  DEFAULT_STATUS,
  HTTP_OK,
  LINK_SUCCESS_MESSAGE,
  NOT_FOUND_MESSAGE
} from '../constants/payElementEligProfiles.constants.js';
import {
  assertEnterpriseAccess,
  normalizeEligibilityRulesInput
} from '../validations/payElementEligProfiles.validation.js';
import {
  createdOutcome,
  mapPackageOutcome,
  notFoundOutcome
} from '../utils/payElementEligProfilesServiceOutcome.js';

function mergeUpdatePayload(existing, payload) {
  return {
    profile_name: payload.profile_name ?? existing.profile_name,
    profile_description:
      payload.profile_description !== undefined
        ? payload.profile_description
        : existing.profile_description,
    status: payload.status ?? existing.status ?? DEFAULT_STATUS,
    eligibility_rules:
      payload.eligibility_rules ??
      normalizeEligibilityRulesInput(
        existing.eligibility_rules?.map((rule) => ({
          eligibility_rule_guid: rule.eligibility_rule_guid
        }))
      )
  };
}

async function loadProfileOrNotFound(profileGuidHex, enterpriseId = null) {
  const row = await getElementEligProfileFromViewByGuid(profileGuidHex, enterpriseId);
  return row ?? null;
}

export async function getElementEligProfiles(filters) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    data: await listElementEligProfilesFromView(filters)
  };
}

export async function getElementEligProfileByGuid(profileGuidHex, enterpriseId = null, req = null) {
  const row = await loadProfileOrNotFound(profileGuidHex, enterpriseId);
  if (!row) return notFoundOutcome(NOT_FOUND_MESSAGE);

  if (req) assertEnterpriseAccess(req, row.enterprise_id);

  return {
    success: true,
    httpStatus: HTTP_OK,
    data: row
  };
}

export async function createElementEligProfile(payload, actor) {
  const pkg = await createProfileViaPackage(payload, actor);
  if (!pkg.success) return mapPackageOutcome(pkg);

  let data = null;
  if (pkg.data?.profile_guid) {
    data = await loadProfileOrNotFound(pkg.data.profile_guid, payload.enterprise_id);
  }

  return createdOutcome(pkg, {
    successMessage: CREATE_SUCCESS_MESSAGE,
    data
  });
}

export async function updateElementEligProfile(profileGuidHex, payload, actor, req = null) {
  const existing = await loadProfileOrNotFound(profileGuidHex);
  if (!existing) return notFoundOutcome(NOT_FOUND_MESSAGE);

  if (req) assertEnterpriseAccess(req, existing.enterprise_id);

  const pkg = await updateProfileViaPackage(
    existing.enterprise_id,
    profileGuidHex,
    mergeUpdatePayload(existing, payload),
    actor
  );
  if (!pkg.success) return mapPackageOutcome(pkg);

  const updated = await loadProfileOrNotFound(profileGuidHex, existing.enterprise_id);
  return mapPackageOutcome(pkg, { data: updated });
}

export async function setElementEligProfileStatus(profileGuidHex, status, actor, req = null) {
  const existing = await loadProfileOrNotFound(profileGuidHex);
  if (!existing) return notFoundOutcome(NOT_FOUND_MESSAGE);

  if (req) assertEnterpriseAccess(req, existing.enterprise_id);

  const pkg = await setProfileStatusViaPackage(existing.enterprise_id, profileGuidHex, status, actor);
  if (!pkg.success) return mapPackageOutcome(pkg);

  const updated = await loadProfileOrNotFound(profileGuidHex, existing.enterprise_id);
  return mapPackageOutcome(pkg, { data: updated });
}

export async function deleteElementEligProfile(profileGuidHex, hardDelete, actor, enterpriseId) {
  const pkg = await deleteProfileViaPackage(enterpriseId, profileGuidHex, hardDelete, actor);
  return mapPackageOutcome(pkg);
}

export async function linkElementToEligProfile(profileGuidHex, payload, actor, req = null) {
  if (req) assertEnterpriseAccess(req, payload.enterprise_id);

  const pkg = await linkElementViaPackage(
    payload.enterprise_id,
    profileGuidHex,
    payload.element_guid,
    actor
  );
  if (!pkg.success) return mapPackageOutcome(pkg);

  const profile = await loadProfileOrNotFound(profileGuidHex, payload.enterprise_id);
  return createdOutcome(pkg, {
    successMessage: LINK_SUCCESS_MESSAGE,
    data: profile
  });
}

export async function unlinkElementFromEligProfile(
  profileGuidHex,
  elementGuidHex,
  enterpriseId,
  req = null
) {
  if (req) assertEnterpriseAccess(req, enterpriseId);

  const pkg = await unlinkElementViaPackage(enterpriseId, profileGuidHex, elementGuidHex);
  if (!pkg.success) return mapPackageOutcome(pkg);

  const profile = await loadProfileOrNotFound(profileGuidHex, enterpriseId);
  return mapPackageOutcome(pkg, { data: profile });
}
