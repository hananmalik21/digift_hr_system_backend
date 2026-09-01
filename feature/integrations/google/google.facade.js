/**
 * Google / Calendar integration public interface.
 *
 * Recruitment (and other modules) MUST import from this facade instead of
 * integrations/google model and service internals.
 */
export { createConferenceRequestId } from './model/googleIntegrationModel.js';
export { getGoogleOAuthCalendarClient } from './service/googleOAuthService.js';
