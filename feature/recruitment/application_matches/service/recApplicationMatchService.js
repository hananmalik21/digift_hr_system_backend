import { bufferToHex, normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import { LOG_TAG, RECALCULATE_CHUNK_SIZE } from '../utils/recApplicationMatchConstants.js';
import { isMatchStoreUnavailableError } from '../utils/recApplicationMatchErrors.js';
import { calculateApplicationMatch } from '../utils/recApplicationMatchScoring.js';
import {
  getStoredMatchScore,
  upsertApplicationMatch
} from '../model/recApplicationMatchPersistModel.js';
import {
  loadApplicationScoringSource,
  loadApplicationScoringSourcesForRequisition,
  loadRequisitionScoringContext
} from '../model/recApplicationMatchViewModel.js';
import {
  filterSortPageLiveItems,
  summarizeLiveResults,
  toDetailFromLive,
  toListItemFromLive,
  toListSummary
} from '../utils/recApplicationMatchLive.js';
import { parseMatchListPagination } from '../utils/recApplicationMatchValidators.js';

function guidHex(value) {
  return normalizeApiGuidString(value) ?? bufferToHex(value) ?? (value ? String(value).toUpperCase() : null);
}

function requisitionHeader(requisition) {
  return {
    requisition_guid: guidHex(requisition.requisition_guid),
    requisition_number: requisition.requisition_number ?? null,
    requisition_title: requisition.requisition_title ?? null
  };
}

function logMatch(action, extra) {
  console.info(`[${LOG_TAG}]`, JSON.stringify({ action, ...extra }));
}

function calculateResult(source, requisition) {
  return calculateApplicationMatch({
    candidate: source.candidate,
    requisition,
    application: source.application
  });
}

function scoreSources(sources, requisition) {
  return sources.map((source) => {
    const result = calculateResult(source, requisition);
    return { source, result, item: toListItemFromLive(source, result) };
  });
}

async function persistResult(source, requisition, result, calculatedBy, storeState) {
  if (storeState?.available === false) return false;

  let persisted = false;
  try {
    await upsertApplicationMatch(
      {
        enterprise_id: source.application.enterprise_id,
        application_id: source.application.application_id,
        application_guid: source.application.application_guid,
        requisition_id: source.application.requisition_id ?? requisition.requisition_id,
        requisition_guid: source.application.requisition_guid ?? requisition.requisition_guid,
        candidate_id: source.application.candidate_id,
        candidate_guid: source.application.candidate_guid
      },
      result,
      calculatedBy
    );
    persisted = true;
  } catch (err) {
    if (!isMatchStoreUnavailableError(err)) throw err;
    if (storeState) storeState.available = false;
    console.warn(`[${LOG_TAG}] match store unavailable; returning live score`, {
      application_guid: source.application.application_guid,
      enterprise_id: source.application.enterprise_id
    });
  }

  logMatch('calculated', {
    application_guid: source.application.application_guid,
    requisition_guid: source.application.requisition_guid ?? requisition.requisition_guid,
    candidate_guid: source.application.candidate_guid,
    enterprise_id: source.application.enterprise_id,
    match_score: result.match_score,
    eligibility_status: result.eligibility_status,
    persisted,
    calculation_timestamp: result.calculated_at
  });
  return persisted;
}

async function requireScoredRequisition(requisitionGuidHex, enterpriseId) {
  const requisition = await loadRequisitionScoringContext(requisitionGuidHex, enterpriseId);
  if (!requisition) return { notFound: 'requisition' };
  const sources = await loadApplicationScoringSourcesForRequisition(requisitionGuidHex, enterpriseId);
  return { requisition, items: scoreSources(sources, requisition) };
}

async function requireScoredApplication(applicationGuidHex, enterpriseId) {
  const source = await loadApplicationScoringSource(applicationGuidHex, enterpriseId);
  if (!source?.application?.requisition_guid) return { notFound: 'application' };

  const requisition = await loadRequisitionScoringContext(
    source.application.requisition_guid,
    enterpriseId
  );
  if (!requisition) return { notFound: 'requisition' };

  return { source, requisition, result: calculateResult(source, requisition) };
}

export async function listApplicationMatches(requisitionGuidHex, enterpriseId, query) {
  const loaded = await requireScoredRequisition(requisitionGuidHex, enterpriseId);
  if (loaded.notFound) return loaded;

  const { page, limit } = parseMatchListPagination(query);
  const { rows, total } = filterSortPageLiveItems(loaded.items, query, { page, limit });

  return {
    rows,
    total,
    page,
    limit,
    requisition: requisitionHeader(loaded.requisition),
    summary: toListSummary(summarizeLiveResults(loaded.items))
  };
}

export async function getApplicationMatchDetail(applicationGuidHex, enterpriseId) {
  const loaded = await requireScoredApplication(applicationGuidHex, enterpriseId);
  if (loaded.notFound) return loaded;
  return { data: toDetailFromLive(loaded.source, loaded.requisition, loaded.result) };
}

export async function recalculateApplicationMatch(applicationGuidHex, enterpriseId, calculatedBy) {
  const loaded = await requireScoredApplication(applicationGuidHex, enterpriseId);
  if (loaded.notFound) return loaded;

  const previous = await getStoredMatchScore(applicationGuidHex, enterpriseId);
  await persistResult(loaded.source, loaded.requisition, loaded.result, calculatedBy, {
    available: true
  });

  return {
    data: {
      application_guid: loaded.source.application.application_guid,
      previous_match_score: previous,
      match_score: loaded.result.match_score,
      match_level: loaded.result.match_level,
      eligibility_status: loaded.result.eligibility_status,
      calculated_at: loaded.result.calculated_at
    }
  };
}

export async function recalculateRequisitionMatches(requisitionGuidHex, enterpriseId, calculatedBy) {
  const requisition = await loadRequisitionScoringContext(requisitionGuidHex, enterpriseId);
  if (!requisition) return { notFound: 'requisition' };

  const sources = await loadApplicationScoringSourcesForRequisition(requisitionGuidHex, enterpriseId);
  const storeState = { available: true };
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < sources.length; i += RECALCULATE_CHUNK_SIZE) {
    for (const source of sources.slice(i, i + RECALCULATE_CHUNK_SIZE)) {
      try {
        await persistResult(
          source,
          requisition,
          calculateResult(source, requisition),
          calculatedBy,
          storeState
        );
        successful += 1;
      } catch {
        failed += 1;
        console.error(`[${LOG_TAG}] recalculate item failed`, {
          application_guid: source.application.application_guid,
          enterprise_id: enterpriseId
        });
      }
    }
  }

  logMatch('recalculate_all', {
    requisition_guid: requisitionGuidHex,
    enterprise_id: enterpriseId,
    applications_processed: sources.length,
    successful,
    failed,
    calculation_timestamp: new Date().toISOString()
  });

  return {
    data: {
      requisition_guid: guidHex(requisition.requisition_guid) || requisitionGuidHex,
      applications_processed: sources.length,
      successful,
      failed
    }
  };
}

export async function getApplicationMatchSummary(requisitionGuidHex, enterpriseId) {
  const loaded = await requireScoredRequisition(requisitionGuidHex, enterpriseId);
  if (loaded.notFound) return loaded;
  return { data: summarizeLiveResults(loaded.items) };
}
