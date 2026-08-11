import {
  deleteProfileViaPackage,
  setProfileStatusViaPackage,
  upsertProfileViaPackage,
  upsertProfileWithRulesViaPackage
} from '../model/payElementEligProfilesModel.js';
import {
  linkElementViaPackage,
  unlinkElementViaPackage
} from '../model/payElementEligProfileElementsModel.js';
import {
  getElementEligProfileFromViewByGuid,
  listElementEligProfilesFromView,
  mapProfileCreateData
} from '../model/payElementEligProfilesViewModel.js';
import {
  CREATE_SUCCESS_MESSAGE,
  DEFAULT_END_DATE,
  DEFAULT_MATCH_LOGIC_CODE,
  DEFAULT_STATUS,
  HTTP_OK,
  LINK_SUCCESS_MESSAGE,
  NOT_FOUND_MESSAGE,
  UPDATE_SUCCESS_MESSAGE
} from '../constants/payElementEligProfiles.constants.js';
import { assertEnterpriseAccess } from '../validations/payElementEligProfiles.validation.js';
import {
  createdOutcome,
  mapPackageOutcome,
  notFoundOutcome
} from '../utils/payElementEligProfilesServiceOutcome.js';

function mergeUpdatePayload(existing, payload) {
  return {
    enterprise_id: payload.enterprise_id ?? existing.enterprise_id,
    profile_code: payload.profile_code ?? existing.profile_code,
    profile_name: payload.profile_name ?? existing.profile_name,
    description:
      payload.description !== undefined
        ? payload.description
        : existing.description ?? existing.profile_description,
    match_logic_code: payload.match_logic_code ?? existing.match_logic_code ?? DEFAULT_MATCH_LOGIC_CODE,
    effective_start_date: payload.effective_start_date ?? existing.effective_start_date,
    effective_end_date: payload.effective_end_date ?? existing.effective_end_date ?? DEFAULT_END_DATE,
    status: payload.status ?? existing.status ?? DEFAULT_STATUS,
    eligibility_rules: payload.eligibility_rules
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
  const pkg = await upsertProfileWithRulesViaPackage(payload, actor);
  if (!pkg.success) {
    return mapPackageOutcome(pkg, {
      data: pkg.data ?? null
    });
  }

  let data = null;
  if (pkg.data?.profile_guid) {
    data = await loadProfileOrNotFound(pkg.data.profile_guid, payload.enterprise_id);
  }

  if (!data) {
    data = mapProfileCreateData(
      {
        profile_id: pkg.data?.profile_id,
        profile_guid: pkg.data?.profile_guid,
        enterprise_id: payload.enterprise_id,
        profile_code: payload.profile_code,
        profile_name: payload.profile_name,
        description: payload.description,
        match_logic_code: payload.match_logic_code
      },
      pkg.data?.linked_rules ?? []
    );
  } else {
    data = mapProfileCreateData(data, pkg.data?.linked_rules ?? data.eligibility_rules);
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

  const merged = mergeUpdatePayload(existing, payload);
  const pkg =
    merged.eligibility_rules != null
      ? await upsertProfileWithRulesViaPackage(merged, actor)
      : await upsertProfileViaPackage(merged, actor);

  if (!pkg.success) {
    return mapPackageOutcome(pkg, { data: pkg.data ?? null });
  }

  const updated = await loadProfileOrNotFound(profileGuidHex, existing.enterprise_id);
  return mapPackageOutcome(pkg, {
    successMessage: UPDATE_SUCCESS_MESSAGE,
    data: updated
  });
}

export async function setElementEligProfileStatus(profileGuidHex, status, actor, req = null) {
  const existing = await loadProfileOrNotFound(profileGuidHex);
  if (!existing) return notFoundOutcome(NOT_FOUND_MESSAGE);

  if (req) assertEnterpriseAccess(req, existing.enterprise_id);

  const pkg = await setProfileStatusViaPackage(
    existing.enterprise_id,
    existing.profile_code,
    status,
    actor
  );
  if (!pkg.success) return mapPackageOutcome(pkg);

  const updated = await loadProfileOrNotFound(profileGuidHex, existing.enterprise_id);
  return mapPackageOutcome(pkg, { data: updated });
}

export async function deleteElementEligProfile(profileGuidHex, hardDelete, actor, enterpriseId) {
  const existing = await loadProfileOrNotFound(profileGuidHex, enterpriseId);
  if (!existing) return notFoundOutcome(NOT_FOUND_MESSAGE);

  const pkg = await deleteProfileViaPackage(
    existing.enterprise_id,
    existing.profile_code,
    hardDelete,
    actor
  );
  return mapPackageOutcome(pkg);
}

export async function linkElementToEligProfile(profileGuidHex, payload, actor, req = null) {
  if (req) assertEnterpriseAccess(req, payload.enterprise_id);

  const pkg = await linkElementViaPackage(payload.enterprise_id, profileGuidHex, payload, actor);
  if (!pkg.success) return mapPackageOutcome(pkg);

  const profile = await loadProfileOrNotFound(profileGuidHex, payload.enterprise_id);
  const link = pkg.data || {};

  return createdOutcome(pkg, {
    successMessage: LINK_SUCCESS_MESSAGE,
    data: {
      ...(profile || {}),
      ...link,
      enterprise_id: link.enterprise_id ?? payload.enterprise_id ?? profile?.enterprise_id ?? null,
      profile_id: link.profile_id ?? profile?.profile_id ?? null,
      status: link.status ?? payload.status ?? profile?.status ?? null
    }
  });
}

export async function unlinkElementFromEligProfile(
  profileGuidHex,
  elementGuidHex,
  enterpriseId,
  actor = 'SYSTEM',
  req = null
) {
  if (req) assertEnterpriseAccess(req, enterpriseId);

  const pkg = await unlinkElementViaPackage(
    enterpriseId,
    profileGuidHex,
    elementGuidHex,
    actor
  );
  if (!pkg.success) return mapPackageOutcome(pkg);

  const profile = await loadProfileOrNotFound(profileGuidHex, enterpriseId);
  return mapPackageOutcome(pkg, { data: profile });
}
