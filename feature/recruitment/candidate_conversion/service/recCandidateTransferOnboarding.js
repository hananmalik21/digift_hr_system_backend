/**
 * Adapter for post-transfer onboarding.
 * This repo has no dedicated employee onboarding workflow engine.
 * Inject a real implementation in tests or replace this module when one exists.
 *
 * @param {Record<string, unknown>} _payload
 * @returns {Promise<{ success: boolean, reference?: string|null, error?: string }>}
 */
export async function triggerCandidateOnboarding(_payload) {
  return {
    success: false,
    reference: null,
    error: 'Onboarding workflow is not configured.'
  };
}
