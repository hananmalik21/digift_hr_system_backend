import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  handleReadError,
  resolveEnterpriseIdFromRequestQuery
} from '../../shared/recControllerHelpers.js';
import { getCandidateByGuidFromView } from '../model/recCandidateViewModel.js';
import { listCandidateNotesFromView } from '../../applications/model/recApplicationViewModel.js';
import {
  sendCandidateNotesListResponse,
  sendCandidateNotesNotFoundResponse
} from '../../applications/utils/recApplicationResponses.js';
import { CANDIDATE_NOTES_LIST_READ_ERROR_MESSAGE } from '../../applications/utils/recApplicationConstants.js';
import { parseCandidateGuidParamForNotesList } from '../../applications/utils/recApplicationValidators.js';

const router = express.Router();

/**
 * GET /api/recruitment/candidates/:candidate_guid/notes?enterprise_id=1
 * Source: REC.V_APPLICATION_NOTES (all applications for the candidate)
 */
router.get(
  '/:candidate_guid/notes',
  asyncHandler(async (req, res) => {
    try {
      const enterprise_id = resolveEnterpriseIdFromRequestQuery(req);
      const candidate_guid = parseCandidateGuidParamForNotesList(req.params.candidate_guid);

      const candidate = await getCandidateByGuidFromView(candidate_guid, enterprise_id);
      if (!candidate) {
        return sendCandidateNotesNotFoundResponse(res);
      }

      const payload = await listCandidateNotesFromView(candidate_guid, enterprise_id);
      return sendCandidateNotesListResponse(res, payload);
    } catch (err) {
      return handleReadError(res, err, CANDIDATE_NOTES_LIST_READ_ERROR_MESSAGE);
    }
  })
);

export default router;
