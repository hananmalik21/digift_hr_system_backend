import { resolveAuditActor } from '../../shared/recControllerHelpers.js';
import {
  parsePostingGuidParam,
  validateGuidEnterpriseParams,
  validateLifecycleBody
} from './recJobPostingValidators.js';

/**
 * @param {import('express').Request} req
 * @param {string} actorField
 * @param {(postingGuid: string, enterpriseId: number, actor: string) => Promise<{ status?: string, message?: string }>} execute
 */
export async function runJobPostingLifecycle(req, actorField, execute) {
  const posting_guid = parsePostingGuidParam(req.params.posting_guid);
  const body = { ...(req.body || {}) };
  body[actorField] = resolveAuditActor(req, body, actorField);
  validateLifecycleBody(body, posting_guid, actorField);
  const { enterprise_id } = validateGuidEnterpriseParams(posting_guid, body.enterprise_id);
  const pkg = await execute(posting_guid, enterprise_id, body[actorField]);
  return { posting_guid, enterprise_id, pkg };
}
