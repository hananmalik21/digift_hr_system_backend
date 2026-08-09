/**
 * Approval workflow — PAY.PAY_APPROVAL_WORKFLOW_PKG + role/policy master data (table DML, no package).
 *
 * Views: V_PAY_APPROVAL_REQUESTS, V_PAY_APPROVAL_STEPS, V_PAY_APPROVAL_ACTIONS, V_PAY_APPROVAL_ROLE_ASGNS
 * Tables (no package): PAY_APPROVAL_ROLE_ASSIGNMENTS, PAY_APPROVAL_POLICIES, PAY_APPROVAL_POLICY_STEPS
 */

import oracledb from 'oracledb';
import db from '../../../config/db.js';
import {
  executePayDml,
  executePayrollPackage,
  mapPayrollOracleError,
  numberBind,
  queryPayList,
  queryPayOne,
  stringBind,
  ynBind
} from '../shared/index.js';

const PKG = 'PAY.PAY_APPROVAL_WORKFLOW_PKG';
const REQUESTS_VIEW = 'PAY.V_PAY_APPROVAL_REQUESTS';
const STEPS_VIEW = 'PAY.V_PAY_APPROVAL_STEPS';
const ACTIONS_VIEW = 'PAY.V_PAY_APPROVAL_ACTIONS';
const ROLE_ASGNS_VIEW = 'PAY.V_PAY_APPROVAL_ROLE_ASGNS';
const ROLE_ASSIGNMENTS_TABLE = 'PAY.PAY_APPROVAL_ROLE_ASSIGNMENTS';
const POLICIES_TABLE = 'PAY.PAY_APPROVAL_POLICIES';
const POLICY_STEPS_TABLE = 'PAY.PAY_APPROVAL_POLICY_STEPS';

function outNum(name) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } };
}
function outStr(name, maxSize = 4000) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize } };
}

// --- Approval requests / steps / actions --------------------------------------------------

const REQUEST_SORT_MAP = {
  requested: 'v.REQUESTED_DATE',
  created: 'v.CREATION_DATE',
  status: 'v.STATUS_CODE'
};

export async function listApprovalRequests(filters) {
  return queryPayList({
    fromSql: `${REQUESTS_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.OBJECT_TYPE_CODE = :object_type_code', bind: 'object_type_code', value: filters.objectTypeCode },
      { sql: 'v.OBJECT_ID = :object_id', bind: 'object_id', value: filters.objectId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode },
      { sql: 'v.REQUESTED_BY = :requested_by', bind: 'requested_by', value: filters.requestedBy }
    ],
    search: { columns: ['v.OBJECT_NUMBER', 'v.POLICY_CODE', 'v.POLICY_NAME'], value: filters.search },
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSort: REQUEST_SORT_MAP,
    defaultSort: 'v.REQUESTED_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollApprovalRequests'
  });
}

export async function getApprovalRequestById(requestId) {
  return queryPayOne({
    fromSql: `${REQUESTS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.APPROVAL_REQUEST_ID = :id', bind: 'id', value: requestId }],
    logTag: 'payrollApprovalRequests'
  });
}

export async function listApprovalSteps(requestId) {
  const { data } = await queryPayList({
    fromSql: `${STEPS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.APPROVAL_REQUEST_ID = :id', bind: 'id', value: requestId }],
    defaultSort: 'v.STEP_SEQUENCE ASC',
    page: 1,
    pageSize: 100,
    logTag: 'payrollApprovalSteps'
  });
  return data;
}

export async function listApprovalActions(requestId) {
  const { data } = await queryPayList({
    fromSql: `${ACTIONS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.APPROVAL_REQUEST_ID = :id', bind: 'id', value: requestId }],
    defaultSort: 'v.ACTION_DATE ASC',
    page: 1,
    pageSize: 200,
    logTag: 'payrollApprovalActions'
  });
  return data;
}

export async function listPendingApprovalsForActor(filters) {
  return queryPayList({
    fromSql: `${STEPS_VIEW} s JOIN ${REQUESTS_VIEW} r ON r.APPROVAL_REQUEST_ID = s.APPROVAL_REQUEST_ID`,
    alias: 's',
    selectSql: `s.REQUEST_STEP_ID, s.REQUEST_STEP_GUID, s.APPROVAL_REQUEST_ID, s.OBJECT_TYPE_CODE, s.OBJECT_ID,
                s.OBJECT_NUMBER, s.STEP_SEQUENCE, s.STEP_CODE, s.STEP_NAME, s.REQUIRED_ROLE_CODE,
                s.REQUIRED_APPROVALS, s.APPROVAL_COUNT, s.LIMIT_CHECK_FLAG, s.STATUS_CODE,
                r.ENTERPRISE_ID, r.POLICY_CODE, r.POLICY_NAME, r.SUBJECT_AMOUNT, r.CURRENCY_CODE,
                r.REQUESTED_BY, r.REQUESTED_DATE`,
    filters: [
      { sql: 'r.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: "s.STATUS_CODE IN ('PENDING', 'IN_PROGRESS')", skipIfEmpty: false },
      { sql: 'UPPER(s.REQUIRED_ROLE_CODE) = UPPER(:role_code)', bind: 'role_code', value: filters.roleCode },
      { sql: 's.OBJECT_TYPE_CODE = :object_type_code', bind: 'object_type_code', value: filters.objectTypeCode }
    ],
    defaultSort: 'r.REQUESTED_DATE ASC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollApprovalPending'
  });
}

/**
 * CREATE_REQUEST(P_ENTERPRISE_ID, P_OBJECT_TYPE_CODE, P_OBJECT_ID, P_OBJECT_NUMBER, P_SUBJECT_AMOUNT,
 *   P_CURRENCY_CODE, P_REQUESTED_BY, OUT P_APPROVAL_REQUEST_ID, P_REQUEST_STATUS, P_SUCCESS, P_MESSAGE)
 */
export async function createApprovalRequest(body, requestedBy) {
  const plsql = `
BEGIN
  ${PKG}.CREATE_REQUEST(
    P_ENTERPRISE_ID      => :p_enterprise_id,
    P_OBJECT_TYPE_CODE   => :p_object_type_code,
    P_OBJECT_ID          => :p_object_id,
    P_OBJECT_NUMBER      => :p_object_number,
    P_SUBJECT_AMOUNT     => :p_subject_amount,
    P_CURRENCY_CODE      => :p_currency_code,
    P_REQUESTED_BY       => :p_requested_by,
    P_APPROVAL_REQUEST_ID=> :p_approval_request_id,
    P_REQUEST_STATUS     => :p_request_status,
    P_SUCCESS            => :p_success,
    P_MESSAGE            => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(body.enterprise_id),
      p_object_type_code: stringBind(body.object_type_code, 50),
      p_object_id: numberBind(body.object_id),
      p_object_number: stringBind(body.object_number, 200),
      p_subject_amount: numberBind(body.subject_amount),
      p_currency_code: stringBind(body.currency_code, 10),
      p_requested_by: stringBind(requestedBy, 100),
      ...outNum('p_approval_request_id'),
      ...outStr('p_request_status', 30),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to create approval request. Please try again.',
      mapOut: (out, helpers) => ({
        approval_request_id: helpers.num('p_approval_request_id'),
        request_status: helpers.str('p_request_status')
      })
    }
  );
}

/**
 * APPROVE_STEP(P_ENTERPRISE_ID, P_APPROVAL_REQUEST_ID, P_ACTOR_CODE, P_COMMENTS,
 *   OUT P_REQUEST_STATUS, P_CURRENT_STEP_CODE, P_SUCCESS, P_MESSAGE)
 */
export async function approveStep(enterpriseId, approvalRequestId, actorCode, comments) {
  const plsql = `
BEGIN
  ${PKG}.APPROVE_STEP(
    P_ENTERPRISE_ID       => :p_enterprise_id,
    P_APPROVAL_REQUEST_ID => :p_approval_request_id,
    P_ACTOR_CODE          => :p_actor_code,
    P_COMMENTS            => :p_comments,
    P_REQUEST_STATUS      => :p_request_status,
    P_CURRENT_STEP_CODE   => :p_current_step_code,
    P_SUCCESS             => :p_success,
    P_MESSAGE             => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_approval_request_id: numberBind(approvalRequestId),
      p_actor_code: stringBind(actorCode, 100),
      p_comments: stringBind(comments, 4000),
      ...outStr('p_request_status', 30),
      ...outStr('p_current_step_code', 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to approve step. Please try again.',
      mapOut: (out, helpers) => ({
        request_status: helpers.str('p_request_status'),
        current_step_code: helpers.str('p_current_step_code')
      })
    }
  );
}

/**
 * REJECT_REQUEST(P_ENTERPRISE_ID, P_APPROVAL_REQUEST_ID, P_ACTOR_CODE, P_REASON,
 *   OUT P_REQUEST_STATUS, P_SUCCESS, P_MESSAGE)
 */
export async function rejectRequest(enterpriseId, approvalRequestId, actorCode, reason) {
  const plsql = `
BEGIN
  ${PKG}.REJECT_REQUEST(
    P_ENTERPRISE_ID       => :p_enterprise_id,
    P_APPROVAL_REQUEST_ID => :p_approval_request_id,
    P_ACTOR_CODE          => :p_actor_code,
    P_REASON              => :p_reason,
    P_REQUEST_STATUS      => :p_request_status,
    P_SUCCESS             => :p_success,
    P_MESSAGE             => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_approval_request_id: numberBind(approvalRequestId),
      p_actor_code: stringBind(actorCode, 100),
      p_reason: stringBind(reason, 4000),
      ...outStr('p_request_status', 30),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to reject approval request. Please try again.',
      mapOut: (out, helpers) => ({ request_status: helpers.str('p_request_status') })
    }
  );
}

/** No withdraw procedure exists on PAY_APPROVAL_WORKFLOW_PKG. */
export function withdrawNotSupportedMessage() {
  return 'Withdrawing an approval request is not supported by PAY_APPROVAL_WORKFLOW_PKG; no such procedure is exposed.';
}

/**
 * IS_APPROVED(P_ENTERPRISE_ID, P_OBJECT_TYPE_CODE, P_OBJECT_ID) RETURN VARCHAR2
 */
export async function isApproved(enterpriseId, objectTypeCode, objectId) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(
      `BEGIN
         :result := ${PKG}.IS_APPROVED(
           P_ENTERPRISE_ID    => :p_enterprise_id,
           P_OBJECT_TYPE_CODE => :p_object_type_code,
           P_OBJECT_ID        => :p_object_id
         );
       END;`,
      {
        result: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
        p_enterprise_id: numberBind(enterpriseId),
        p_object_type_code: stringBind(objectTypeCode, 50),
        p_object_id: numberBind(objectId)
      }
    );
    const flag = String(result.outBinds?.result ?? '').trim().toUpperCase();
    return { approved: flag === 'Y' };
  } catch (err) {
    const mapped = mapPayrollOracleError(err);
    return { approved: false, message: mapped.message };
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * ASSERT_APPROVED(P_ENTERPRISE_ID, P_OBJECT_TYPE_CODE, P_OBJECT_ID) — procedure with no OUT
 * parameters. It completes silently when approved and raises an application error otherwise.
 */
export async function assertApproved(enterpriseId, objectTypeCode, objectId) {
  const connection = await db.getConnection();
  try {
    await connection.execute(
      `BEGIN
         ${PKG}.ASSERT_APPROVED(
           P_ENTERPRISE_ID    => :p_enterprise_id,
           P_OBJECT_TYPE_CODE => :p_object_type_code,
           P_OBJECT_ID        => :p_object_id
         );
       END;`,
      {
        p_enterprise_id: numberBind(enterpriseId),
        p_object_type_code: stringBind(objectTypeCode, 50),
        p_object_id: numberBind(objectId)
      }
    );
    return { approved: true, message: 'Object is approved.' };
  } catch (err) {
    const mapped = mapPayrollOracleError(err);
    return { approved: false, message: mapped.message };
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

// --- Role assignments (table DML, no package) -----------------------------------------

const ROLE_SORT_MAP = { effective_start_date: 'v.EFFECTIVE_START_DATE', created: 'v.CREATION_DATE' };

export async function listRoleAssignments(filters) {
  return queryPayList({
    fromSql: `${ROLE_ASGNS_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'UPPER(v.ACTOR_CODE) = UPPER(:actor_code)', bind: 'actor_code', value: filters.actorCode },
      { sql: 'UPPER(v.ROLE_CODE) = UPPER(:role_code)', bind: 'role_code', value: filters.roleCode },
      { sql: 'v.ACTIVE_FLAG = :active_flag', bind: 'active_flag', value: filters.activeFlag }
    ],
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSort: ROLE_SORT_MAP,
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollApprovalRoles'
  });
}

export async function getRoleAssignmentByGuid(guid) {
  return queryPayOne({
    fromSql: `${ROLE_ASGNS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'UPPER(v.ROLE_ASSIGNMENT_GUID) = UPPER(:guid)', bind: 'guid', value: guid }],
    logTag: 'payrollApprovalRoles'
  });
}

export async function createRoleAssignment(body, createdBy) {
  return executePayDml(
    `INSERT INTO ${ROLE_ASSIGNMENTS_TABLE} (
       ENTERPRISE_ID, ACTOR_CODE, ROLE_CODE, APPROVAL_LIMIT, CURRENCY_CODE, ACTIVE_FLAG,
       EFFECTIVE_START_DATE, EFFECTIVE_END_DATE, CREATED_BY, LAST_UPDATED_BY
     ) VALUES (
       :enterprise_id, :actor_code, :role_code, :approval_limit, :currency_code, :active_flag,
       NVL(:effective_start_date, TRUNC(SYSDATE)), :effective_end_date, :created_by, :created_by
     )
     RETURNING ROLE_ASSIGNMENT_ID, RAWTOHEX(ROLE_ASSIGNMENT_GUID) INTO :id, :guid`,
    {
      enterprise_id: numberBind(body.enterprise_id),
      actor_code: stringBind(body.actor_code, 100),
      role_code: stringBind(body.role_code, 100),
      approval_limit: numberBind(body.approval_limit),
      currency_code: stringBind(body.currency_code, 10),
      active_flag: ynBind(body.active_flag, 'Y'),
      effective_start_date: body.effective_start_date ? new Date(body.effective_start_date) : null,
      effective_end_date: body.effective_end_date ? new Date(body.effective_end_date) : null,
      created_by: stringBind(createdBy, 100),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
    },
    {
      genericError: 'Unable to create approval role assignment. Please try again.',
      mapOut: (out) => ({
        role_assignment_id: out.id?.[0] ?? null,
        role_assignment_guid: (out.guid?.[0] ?? '').toLowerCase() || null
      })
    }
  );
}

export async function updateRoleAssignment(guid, body, updatedBy) {
  return executePayDml(
    `UPDATE ${ROLE_ASSIGNMENTS_TABLE}
        SET APPROVAL_LIMIT      = NVL(:approval_limit, APPROVAL_LIMIT),
            CURRENCY_CODE       = NVL(:currency_code, CURRENCY_CODE),
            EFFECTIVE_END_DATE  = NVL(:effective_end_date, EFFECTIVE_END_DATE),
            LAST_UPDATED_BY     = :updated_by,
            LAST_UPDATE_DATE    = SYSDATE
      WHERE ROLE_ASSIGNMENT_GUID = HEXTORAW(:guid)
     RETURNING ROLE_ASSIGNMENT_ID INTO :id`,
    {
      approval_limit: numberBind(body.approval_limit),
      currency_code: stringBind(body.currency_code, 10),
      effective_end_date: body.effective_end_date ? new Date(body.effective_end_date) : null,
      updated_by: stringBind(updatedBy, 100),
      guid: stringBind(guid, 32),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to update approval role assignment. Please try again.',
      mapOut: (out) => ({ updated: (out.id || []).length > 0 })
    }
  );
}

export async function setRoleAssignmentActiveFlag(guid, activeFlag, updatedBy) {
  return executePayDml(
    `UPDATE ${ROLE_ASSIGNMENTS_TABLE}
        SET ACTIVE_FLAG      = :active_flag,
            LAST_UPDATED_BY  = :updated_by,
            LAST_UPDATE_DATE = SYSDATE
      WHERE ROLE_ASSIGNMENT_GUID = HEXTORAW(:guid)
     RETURNING ROLE_ASSIGNMENT_ID INTO :id`,
    {
      active_flag: ynBind(activeFlag, 'N'),
      updated_by: stringBind(updatedBy, 100),
      guid: stringBind(guid, 32),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to update approval role assignment status. Please try again.',
      mapOut: (out) => ({ updated: (out.id || []).length > 0 })
    }
  );
}

// --- Policies + policy steps (read-only; table DML CRUD not implemented) ------------------

export async function listPolicies(filters) {
  return queryPayList({
    fromSql: `${POLICIES_TABLE} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.OBJECT_TYPE_CODE = :object_type_code', bind: 'object_type_code', value: filters.objectTypeCode },
      { sql: 'v.ACTIVE_FLAG = :active_flag', bind: 'active_flag', value: filters.activeFlag }
    ],
    search: { columns: ['v.POLICY_CODE', 'v.POLICY_NAME'], value: filters.search },
    defaultSort: 'v.POLICY_NAME ASC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollApprovalPolicies'
  });
}

export async function getPolicyById(policyId) {
  return queryPayOne({
    fromSql: `${POLICIES_TABLE} v`,
    alias: 'v',
    filters: [{ sql: 'v.APPROVAL_POLICY_ID = :id', bind: 'id', value: policyId }],
    logTag: 'payrollApprovalPolicies'
  });
}

export async function listPolicySteps(policyId) {
  const { data } = await queryPayList({
    fromSql: `${POLICY_STEPS_TABLE} v`,
    alias: 'v',
    filters: [{ sql: 'v.APPROVAL_POLICY_ID = :id', bind: 'id', value: policyId }],
    defaultSort: 'v.STEP_SEQUENCE ASC',
    page: 1,
    pageSize: 100,
    logTag: 'payrollApprovalPolicySteps'
  });
  return data;
}
