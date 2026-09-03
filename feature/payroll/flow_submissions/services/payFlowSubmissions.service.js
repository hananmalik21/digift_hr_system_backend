/**
 * Payroll flow submission service.
 * Oracle owns draft/submit/cancel/delete lifecycle and run initialization.
 */

import { failOutcome, okMutation, outcomeFromResultJson } from '../../shared/index.js';
import * as submissionsModel from '../model/payFlowSubmissionsModel.js';
import {
  getFlowSubmissionById,
  getRunByFlowSubmissionId,
  getRunById
} from '../model/payFlowSubmissionsViewModel.js';

function mapPackageFailure(pkg) {
  const isNotFound = /not\s*found/i.test(pkg.message || '');
  return failOutcome(pkg.message || 'Unable to process request.', isNotFound ? 404 : 400, pkg.data ?? null);
}

export async function listSubmissions(payload) {
  const pkg = await submissionsModel.listSubmissions(payload);
  return outcomeFromResultJson(pkg, {
    successMessage: 'Payroll flow submissions retrieved successfully.',
    asList: true
  });
}

export async function getSubmission(payload) {
  const pkg = await submissionsModel.getSubmission(payload);
  return outcomeFromResultJson(pkg, {
    successMessage: 'Payroll flow submission retrieved successfully.'
  });
}

export async function createDraft(payload) {
  const pkg = await submissionsModel.createDraft(payload);
  return outcomeFromResultJson(pkg, {
    successMessage: 'Payroll flow submission draft created successfully.',
    successHttpStatus: 201
  });
}

export async function updateDraft(payload) {
  const pkg = await submissionsModel.updateDraft(payload);
  return outcomeFromResultJson(pkg, {
    successMessage: 'Payroll flow submission draft updated successfully.'
  });
}

export async function submitFlow(payload) {
  const pkg = await submissionsModel.submitFlow(payload);
  return outcomeFromResultJson(pkg, {
    successMessage: 'Payroll flow submitted successfully.'
  });
}

export async function cancelSubmission(payload) {
  const pkg = await submissionsModel.cancelSubmission(payload);
  return outcomeFromResultJson(pkg, {
    successMessage: 'Payroll flow submission cancelled successfully.'
  });
}

export async function deleteDraft(payload) {
  const pkg = await submissionsModel.deleteDraft(payload);
  return outcomeFromResultJson(pkg, {
    successMessage: 'Payroll flow submission draft deleted successfully.'
  });
}

/**
 * @param {{ enterprise_id: number, flow_submission_id: number, created_by: string }} payload
 * @param {{
 *   initializeRunFromSubmission?: Function,
 *   getFlowSubmissionById?: Function,
 *   getRunById?: Function,
 *   getRunByFlowSubmissionId?: Function
 * }} [deps]
 */
export async function initializeRunFromSubmission(payload, deps = {}) {
  const callPkg = deps.initializeRunFromSubmission ?? submissionsModel.initializeRunFromSubmission;
  const loadSubmission = deps.getFlowSubmissionById ?? getFlowSubmissionById;
  const loadRunById = deps.getRunById ?? getRunById;
  const loadRunBySubmission = deps.getRunByFlowSubmissionId ?? getRunByFlowSubmissionId;

  const pkg = await callPkg(payload);
  if (!pkg.success) return mapPackageFailure(pkg);

  const submission = await loadSubmission(payload.enterprise_id, payload.flow_submission_id);
  let run = null;
  if (pkg.data?.run_id) {
    run = await loadRunById(payload.enterprise_id, pkg.data.run_id);
  }
  if (!run) {
    run = await loadRunBySubmission(payload.enterprise_id, payload.flow_submission_id);
  }

  return okMutation(
    pkg.message || 'Payroll run initialized from flow submission successfully.',
    shapeInitializeRunFromSubmission({ submission, run, pkg, payload }),
    201
  );
}

/**
 * Nested submission + run objects from persisted PAY rows.
 * Idempotent Oracle success (submission already RUN_CREATED or COMPLETED) is still success.
 */
function shapeInitializeRunFromSubmission({ submission, run, pkg, payload }) {
  const flowSubmissionId = submission?.flow_submission_id ?? payload.flow_submission_id;
  return {
    submission: {
      ...(submission || {}),
      flow_submission_id: flowSubmissionId,
      submission_number: submission?.submission_number ?? pkg.data?.submission_number ?? null,
      status_code: submission?.status_code ?? submission?.submission_status_code ?? null
    },
    run: {
      ...(run || {}),
      run_id: run?.run_id ?? pkg.data?.run_id ?? null,
      run_guid: run?.run_guid ?? pkg.data?.run_guid ?? null,
      run_number: run?.run_number ?? pkg.data?.run_number ?? null,
      status_code: run?.status_code ?? run?.run_status_code ?? null,
      flow_submission_id: run?.flow_submission_id ?? flowSubmissionId
    }
  };
}
