import oracledb from 'oracledb';
import {
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numberInBind
} from '../../../../utils/oraclePackageUtils.js';
import { mapProfileElementPackageMessage } from '../utils/payElementEligProfilesOracleErrors.js';
import {
  executeYnPackageMutation,
  successOutBinds,
  whoCreateBinds
} from '../utils/payElementEligProfilesPackageExecutor.js';

const PKG = 'PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG';

const LINK_PLSQL = `
BEGIN
  ${PKG}.LINK_ELEMENT(
    P_ENTERPRISE_ID          => :p_enterprise_id,
    P_PROFILE_GUID           => :p_profile_guid,
    P_ELEMENT_GUID           => :p_element_guid,
    P_CREATED_BY             => :p_created_by,
    P_CREATION_DATE          => :p_creation_date,
    P_LAST_UPDATED_BY        => :p_last_updated_by,
    P_LAST_UPDATE_DATE       => :p_last_update_date,
    X_SUCCESS                => :x_success,
    X_MESSAGE                => :x_message,
    X_PROFILE_ELEMENT_ID     => :x_profile_element_id,
    X_PROFILE_ELEMENT_GUID   => :x_profile_element_guid
  );
END;`;

const UNLINK_PLSQL = `
BEGIN
  ${PKG}.UNLINK_ELEMENT(
    P_ENTERPRISE_ID          => :p_enterprise_id,
    P_PROFILE_GUID           => :p_profile_guid,
    P_ELEMENT_GUID           => :p_element_guid,
    X_SUCCESS                => :x_success,
    X_MESSAGE                => :x_message
  );
END;`;

function shapeLinkResult({ success, message, outBinds }) {
  const result = { success, message };
  if (success) {
    const guid = normalizeOutString(outBinds.x_profile_element_guid);
    result.data = {
      profile_element_id: normalizeOutNumber(outBinds.x_profile_element_id),
      profile_element_guid: guid ? normalizeOutGuidHex(guid) : null
    };
  }
  return result;
}

export async function linkElementViaPackage(enterpriseId, profileGuidHex, elementGuidHex, actor) {
  return executeYnPackageMutation(
    LINK_PLSQL,
    {
      p_enterprise_id: numberInBind(enterpriseId),
      p_profile_guid: guidHexInBind(profileGuidHex),
      p_element_guid: guidHexInBind(elementGuidHex),
      ...whoCreateBinds(actor),
      ...successOutBinds(),
      x_profile_element_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      x_profile_element_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
    },
    mapProfileElementPackageMessage,
    shapeLinkResult
  );
}

export async function unlinkElementViaPackage(enterpriseId, profileGuidHex, elementGuidHex) {
  return executeYnPackageMutation(
    UNLINK_PLSQL,
    {
      p_enterprise_id: numberInBind(enterpriseId),
      p_profile_guid: guidHexInBind(profileGuidHex),
      p_element_guid: guidHexInBind(elementGuidHex),
      ...successOutBinds()
    },
    mapProfileElementPackageMessage
  );
}
