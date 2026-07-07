import oracledb from 'oracledb';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  numberInBind,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payBalanceFeeds.constants.js';
import {
  executeBalanceFeedPackageMutation,
  successOutBinds
} from '../utils/payBalanceFeedsPackageExecutor.js';

const PKG = 'PAY.PAY_BALANCE_FEEDS_PKG';

export { GENERIC_TECHNICAL_ERROR };

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_BALANCE_FEED(
    P_ENTERPRISE_ID          => :enterprise_id,
    P_FEED_TYPE_CODE         => :feed_type_code,
    P_ELEMENT_ID             => :element_id,
    P_INPUT_VALUE_CODE       => :input_value_code,
    P_CLASSIFICATION_CODE    => :classification_code,
    P_FORMULA_ID             => :formula_id,
    P_TARGET_BALANCE_ID      => :target_balance_id,
    P_FEED_DIRECTION_CODE    => :feed_direction_code,
    P_EFFECTIVE_START_DATE   => TO_DATE(:effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE     => TO_DATE(:effective_end_date, 'YYYY-MM-DD'),
    P_STATUS                 => :status,
    P_DESCRIPTION            => :description,
    P_CREATED_BY             => :created_by,
    P_BALANCE_FEED_ID        => :balance_feed_id,
    P_BALANCE_FEED_GUID      => :balance_feed_guid,
    P_SUCCESS                => :success,
    P_MESSAGE                => :message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_BALANCE_FEED(
    P_BALANCE_FEED_GUID      => :balance_feed_guid,
    P_FEED_TYPE_CODE         => :feed_type_code,
    P_ELEMENT_ID             => :element_id,
    P_INPUT_VALUE_CODE       => :input_value_code,
    P_CLASSIFICATION_CODE    => :classification_code,
    P_FORMULA_ID             => :formula_id,
    P_TARGET_BALANCE_ID      => :target_balance_id,
    P_FEED_DIRECTION_CODE    => :feed_direction_code,
    P_EFFECTIVE_START_DATE   => CASE WHEN :effective_start_date IS NULL THEN NULL ELSE TO_DATE(:effective_start_date, 'YYYY-MM-DD') END,
    P_EFFECTIVE_END_DATE     => CASE WHEN :effective_end_date IS NULL THEN NULL ELSE TO_DATE(:effective_end_date, 'YYYY-MM-DD') END,
    P_STATUS                 => :status,
    P_DESCRIPTION            => :description,
    P_UPDATED_BY             => :updated_by,
    P_BALANCE_FEED_ID        => :balance_feed_id,
    P_SUCCESS                => :success,
    P_MESSAGE                => :message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_BALANCE_FEED(
    P_BALANCE_FEED_GUID      => :balance_feed_guid,
    P_HARD_DELETE            => :hard_delete,
    P_UPDATED_BY             => :updated_by,
    P_SUCCESS                => :success,
    P_MESSAGE                => :message
  );
END;`;

function buildFeedBinds(payload) {
  return {
    feed_type_code: codeInBind(payload.feed_type_code, 50),
    element_id: numberInBind(payload.element_id),
    input_value_code: codeInBind(payload.input_value_code, 100),
    classification_code: codeInBind(payload.classification_code, 100),
    formula_id: numberInBind(payload.formula_id),
    target_balance_id: numberInBind(payload.target_balance_id),
    feed_direction_code: codeInBind(payload.feed_direction_code, 50),
    effective_start_date: varcharInBind(payload.effective_start_date, 10),
    effective_end_date: varcharInBind(payload.effective_end_date, 10),
    status: codeInBind(payload.status, 20),
    description: varcharInBind(payload.description, 4000)
  };
}

export async function createBalanceFeedViaPackage(payload, actor) {
  return executeBalanceFeedPackageMutation(
    CREATE_PLSQL,
    {
      enterprise_id: numberInBind(payload.enterprise_id),
      ...buildFeedBinds(payload),
      created_by: auditInBind(actor),
      ...successOutBinds(),
      balance_feed_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      balance_feed_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 }
    },
    { includeCreateFields: true }
  );
}

export async function updateBalanceFeedViaPackage(balanceFeedGuidHex, payload, actor) {
  return executeBalanceFeedPackageMutation(
    UPDATE_PLSQL,
    {
      balance_feed_guid: guidHexInBind(balanceFeedGuidHex),
      ...buildFeedBinds(payload),
      updated_by: auditInBind(actor),
      ...successOutBinds(),
      balance_feed_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    { includeUpdateFields: true }
  );
}

export async function deleteBalanceFeedViaPackage(balanceFeedGuidHex, hardDelete, actor) {
  return executeBalanceFeedPackageMutation(DELETE_PLSQL, {
    balance_feed_guid: guidHexInBind(balanceFeedGuidHex),
    hard_delete: ynInBind(hardDelete, 'N'),
    updated_by: auditInBind(actor),
    ...successOutBinds()
  });
}
