import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  auditInBind,
  codeInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numberInBind,
  varcharInBind
} from '../../../../utils/oraclePackageUtils.js';
import { mapProfileElementPackageMessage } from '../utils/payElementEligProfilesOracleErrors.js';
import {
  executeYnPackageMutation,
  successOutBinds
} from '../utils/payElementEligProfilesPackageExecutor.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import {
  DEFAULT_END_DATE,
  DEFAULT_STATUS,
  GENERIC_TECHNICAL_ERROR
} from '../constants/payElementEligProfiles.constants.js';
import { oracleDateOnlyBindValue } from '../utils/oracleDateOnly.js';

const PKG = 'PAY.PAY_ELEMENT_PROFILE_LINKS_PKG';
const QUERY_OPTIONS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

function firstRowValue(rows, ...keys) {
  const row = rows?.[0];
  if (!row) return null;
  for (const key of keys) {
    if (row[key] != null) return row[key];
    const lower = String(key).toLowerCase();
    if (row[lower] != null) return row[lower];
  }
  return null;
}

function normalizeGuidOut(raw) {
  const guid = normalizeOutString(raw);
  if (!guid) return null;
  return normalizeOutGuidHex(guid) || String(guid).replace(/-/g, '').toLowerCase();
}

const LINK_PLSQL = `
BEGIN
  ${PKG}.LINK_ELEMENT(
    P_ENTERPRISE_ID        => :p_enterprise_id,
    P_ELEMENT_ID           => :p_element_id,
    P_PROFILE_ID           => :p_profile_id,
    P_EFFECTIVE_START_DATE => TO_DATE(:p_effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE   => TO_DATE(:p_effective_end_date, 'YYYY-MM-DD'),
    P_STATUS               => :p_status,
    P_UPDATED_BY           => :p_updated_by,
    P_PROFILE_LINK_ID      => :p_profile_link_id,
    P_PROFILE_LINK_GUID    => :p_profile_link_guid,
    P_SUCCESS              => :p_success,
    P_MESSAGE              => :p_message
  );
END;`;

const SET_LINK_STATUS_PLSQL = `
BEGIN
  ${PKG}.SET_STATUS(
    P_PROFILE_LINK_ID => :p_profile_link_id,
    P_STATUS          => :p_status,
    P_UPDATED_BY      => :p_updated_by,
    P_SUCCESS         => :p_success,
    P_MESSAGE         => :p_message
  );
END;`;

async function resolveProfileIdByGuid(profileGuidHex, enterpriseId) {
  const result = await db.executeQuery(
    `
SELECT PROFILE_ID
  FROM PAY.PAY_ELEMENT_PROFILES
 WHERE ENTERPRISE_ID = :enterprise_id
   AND UPPER(RAWTOHEX(PROFILE_GUID)) = :profile_guid`.trim(),
    {
      enterprise_id: enterpriseId,
      profile_guid: String(profileGuidHex).trim().toUpperCase()
    },
    QUERY_OPTIONS
  );
  return firstRowValue(result.rows, 'PROFILE_ID');
}

async function resolveElementIdByGuid(elementGuidHex, enterpriseId) {
  const result = await db.executeQuery(
    `
SELECT ELEMENT_ID
  FROM PAY.PAY_ELEMENTS
 WHERE ENTERPRISE_ID = :enterprise_id
   AND UPPER(RAWTOHEX(ELEMENT_GUID)) = :element_guid`.trim(),
    {
      enterprise_id: enterpriseId,
      element_guid: String(elementGuidHex).trim().toUpperCase()
    },
    QUERY_OPTIONS
  );
  return firstRowValue(result.rows, 'ELEMENT_ID');
}

async function resolveActiveProfileLinkId(enterpriseId, profileId, elementId) {
  // Prefer ACTIVE links so historical INACTIVE rows are not selected.
  const result = await db.executeQuery(
    `
SELECT PROFILE_LINK_ID
  FROM PAY.PAY_ELEMENT_PROFILE_LINKS
 WHERE ENTERPRISE_ID = :enterprise_id
   AND PROFILE_ID = :profile_id
   AND ELEMENT_ID = :element_id
   AND STATUS = 'ACTIVE'
 ORDER BY EFFECTIVE_START_DATE DESC, PROFILE_LINK_ID DESC
 FETCH FIRST 1 ROW ONLY`.trim(),
    {
      enterprise_id: enterpriseId,
      profile_id: profileId,
      element_id: elementId
    },
    QUERY_OPTIONS
  );
  return firstRowValue(result.rows, 'PROFILE_LINK_ID');
}

function shapeLinkResult({ success, message, outBinds }, context = {}) {
  const result = { success, message };
  if (success) {
    result.data = {
      profile_link_id: normalizeOutNumber(outBinds.p_profile_link_id),
      profile_link_guid: normalizeGuidOut(outBinds.p_profile_link_guid),
      enterprise_id: context.enterprise_id ?? null,
      profile_id: context.profile_id ?? null,
      element_id: context.element_id ?? null,
      effective_start_date: context.effective_start_date ?? null,
      effective_end_date: context.effective_end_date ?? null,
      status: context.status ?? null
    };
  }
  return result;
}

/**
 * @param {number} enterpriseId
 * @param {string} profileGuidHex
 * @param {{
 *   element_guid: string,
 *   effective_start_date: string,
 *   effective_end_date?: string,
 *   status?: string
 * }} linkPayload
 * @param {string} actor
 */
export async function linkElementViaPackage(enterpriseId, profileGuidHex, linkPayload, actor) {
  const elementGuidHex = linkPayload.element_guid;
  const effectiveStartDate = oracleDateOnlyBindValue(linkPayload.effective_start_date);
  const effectiveEndDate =
    oracleDateOnlyBindValue(linkPayload.effective_end_date) || DEFAULT_END_DATE;
  const status = String(linkPayload.status || DEFAULT_STATUS)
    .trim()
    .toUpperCase();

  if (!effectiveStartDate) {
    return { success: false, message: 'effective_start_date is required' };
  }

  let profileId;
  let elementId;
  try {
    profileId = await resolveProfileIdByGuid(profileGuidHex, enterpriseId);
    elementId = await resolveElementIdByGuid(elementGuidHex, enterpriseId);
  } catch (err) {
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err, GENERIC_TECHNICAL_ERROR);
  }

  if (profileId == null) {
    return { success: false, message: 'Profile was not found.' };
  }
  if (elementId == null) {
    return { success: false, message: 'Selected element is not valid for this enterprise.' };
  }

  return executeYnPackageMutation(
    LINK_PLSQL,
    {
      p_enterprise_id: numberInBind(enterpriseId),
      p_element_id: numberInBind(elementId),
      p_profile_id: numberInBind(profileId),
      p_effective_start_date: varcharInBind(effectiveStartDate, 10),
      p_effective_end_date: varcharInBind(effectiveEndDate, 10),
      p_status: codeInBind(status, 30),
      p_updated_by: auditInBind(actor),
      p_profile_link_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_profile_link_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 64 },
      ...successOutBinds('p')
    },
    mapProfileElementPackageMessage,
    (parsed) =>
      shapeLinkResult(parsed, {
        enterprise_id: enterpriseId,
        profile_id: profileId,
        element_id: elementId,
        effective_start_date: effectiveStartDate,
        effective_end_date: effectiveEndDate,
        status
      })
  );
}

export async function unlinkElementViaPackage(
  enterpriseId,
  profileGuidHex,
  elementGuidHex,
  actor = 'SYSTEM'
) {
  let profileId;
  let elementId;
  let profileLinkId;
  try {
    profileId = await resolveProfileIdByGuid(profileGuidHex, enterpriseId);
    elementId = await resolveElementIdByGuid(elementGuidHex, enterpriseId);
    if (profileId != null && elementId != null) {
      profileLinkId = await resolveActiveProfileLinkId(enterpriseId, profileId, elementId);
    }
  } catch (err) {
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err, GENERIC_TECHNICAL_ERROR);
  }

  if (profileLinkId == null) {
    return { success: false, message: 'Profile element link was not found.' };
  }

  return executeYnPackageMutation(
    SET_LINK_STATUS_PLSQL,
    {
      p_profile_link_id: numberInBind(profileLinkId),
      p_status: codeInBind('INACTIVE', 30),
      p_updated_by: auditInBind(actor),
      ...successOutBinds('p')
    },
    mapProfileElementPackageMessage
  );
}
