import { formatDateOnly } from '../../job_postings/utils/recJobPostingViewMapper.js';
import {
  formatDateTime,
  formatDateTimeIso,
  normalizeGuidValue,
  normalizeYnFlag,
  rowKeyMap,
  safeFiniteNumber,
  strOrNull
} from './recApplicationRowUtils.js';
import { mapApplicationResumeFields } from './recApplicationResumeMapper.js';

function mapCandidateNested(m) {
  return {
    candidate_guid: normalizeGuidValue(m.candidate_guid),
    candidate_name: strOrNull(m.candidate_name),
    email: strOrNull(m.email),
    phone: strOrNull(m.phone),
    current_title: strOrNull(m.current_title),
    current_employer: strOrNull(m.current_employer),
    years_experience: safeFiniteNumber(m.years_experience),
    current_location: strOrNull(m.current_location),
    current_salary: safeFiniteNumber(m.current_salary),
    expected_salary: safeFiniteNumber(m.expected_salary),
    salary_currency: strOrNull(m.salary_currency),
    portfolio_link: strOrNull(m.portfolio_link),
    github_link: strOrNull(m.github_link),
    linkedin_profile: strOrNull(m.linkedin_profile),
    willing_to_relocate: normalizeYnFlag(m.willing_to_relocate)
  };
}

/** @param {Record<string, unknown>} row */
export function mapApplicationListRow(row) {
  const m = rowKeyMap(row);
  const application_guid = normalizeGuidValue(m.application_guid);

  return {
    application_id: safeFiniteNumber(m.application_id),
    application_guid,
    application_number: strOrNull(m.application_number),
    enterprise_id: safeFiniteNumber(m.enterprise_id),
    posting_id: safeFiniteNumber(m.posting_id),
    posting_guid: normalizeGuidValue(m.posting_guid),
    posting_title: strOrNull(m.posting_title),
    requisition_id: safeFiniteNumber(m.requisition_id),
    requisition_guid: normalizeGuidValue(m.requisition_guid),
    requisition_number: strOrNull(m.requisition_number),
    requisition_title: strOrNull(m.requisition_title),
    candidate_id: safeFiniteNumber(m.candidate_id),
    candidate_guid: normalizeGuidValue(m.candidate_guid),
    first_name: strOrNull(m.first_name),
    middle_name: strOrNull(m.middle_name),
    last_name: strOrNull(m.last_name),
    candidate_name: strOrNull(m.candidate_name),
    email: strOrNull(m.email),
    phone: strOrNull(m.phone),
    current_title: strOrNull(m.current_title),
    current_employer: strOrNull(m.current_employer),
    years_experience: safeFiniteNumber(m.years_experience),
    current_location: strOrNull(m.current_location),
    current_salary: safeFiniteNumber(m.current_salary),
    expected_salary: safeFiniteNumber(m.expected_salary),
    salary_currency: strOrNull(m.salary_currency),
    notice_period: safeFiniteNumber(m.notice_period),
    linkedin_profile: strOrNull(m.linkedin_profile),
    portfolio_link: strOrNull(m.portfolio_link),
    github_link: strOrNull(m.github_link),
    willing_to_relocate: normalizeYnFlag(m.willing_to_relocate),
    source_code: strOrNull(m.source_code),
    current_stage_code: strOrNull(m.current_stage_code),
    status_code: strOrNull(m.status_code),
    rejection_reason_code: strOrNull(m.rejection_reason_code),
    applied_date: formatDateOnly(m.applied_date),
    created_by: strOrNull(m.created_by),
    creation_date: formatDateOnly(m.creation_date),
    last_updated_by: strOrNull(m.last_updated_by),
    last_update_date: formatDateOnly(m.last_update_date),
    ...mapApplicationResumeFields(m, application_guid)
  };
}

/** @param {Record<string, unknown>} row */
export function mapApplicationDetailRow(row) {
  const m = rowKeyMap(row);
  const application_guid = normalizeGuidValue(m.application_guid);

  return {
    application_guid,
    application_number: strOrNull(m.application_number),
    candidate_name: strOrNull(m.candidate_name),
    ...mapApplicationResumeFields(m, application_guid),
    candidate: mapCandidateNested(m),
    posting: {
      posting_guid: normalizeGuidValue(m.posting_guid),
      posting_title: strOrNull(m.posting_title)
    },
    requisition: {
      requisition_guid: normalizeGuidValue(m.requisition_guid),
      requisition_number: strOrNull(m.requisition_number),
      requisition_title: strOrNull(m.requisition_title)
    },
    current_stage_code: strOrNull(m.current_stage_code),
    status_code: strOrNull(m.status_code),
    source_code: strOrNull(m.source_code),
    applied_date: formatDateOnly(m.applied_date),
    rejection_reason_code: strOrNull(m.rejection_reason_code),
    rejection_comments: strOrNull(m.rejection_comments),
    rejection_email_flag: normalizeYnFlag(m.rejection_email_flag)
  };
}

/** @param {Record<string, unknown>} row */
export function mapStageHistoryListRow(row) {
  const m = rowKeyMap(row);

  return {
    stage_history_id: safeFiniteNumber(m.stage_history_id),
    stage_history_guid: normalizeGuidValue(m.stage_history_guid),
    enterprise_id: safeFiniteNumber(m.enterprise_id),
    application_id: safeFiniteNumber(m.application_id),
    application_guid: normalizeGuidValue(m.application_guid),
    application_number: strOrNull(m.application_number),
    candidate_id: safeFiniteNumber(m.candidate_id),
    candidate_guid: normalizeGuidValue(m.candidate_guid),
    candidate_name: strOrNull(m.candidate_name),
    posting_id: safeFiniteNumber(m.posting_id),
    posting_guid: normalizeGuidValue(m.posting_guid),
    posting_title: strOrNull(m.posting_title),
    requisition_id: safeFiniteNumber(m.requisition_id),
    requisition_guid: normalizeGuidValue(m.requisition_guid),
    requisition_number: strOrNull(m.requisition_number),
    requisition_title: strOrNull(m.requisition_title),
    from_stage_code: strOrNull(m.from_stage_code),
    to_stage_code: strOrNull(m.to_stage_code),
    from_status_code: strOrNull(m.from_status_code),
    to_status_code: strOrNull(m.to_status_code),
    comments: strOrNull(m.comments),
    created_by: strOrNull(m.created_by),
    creation_date: formatDateTime(m.creation_date)
  };
}

/** @param {Record<string, unknown>} row */
export function mapApplicationNoteDetailEntry(row) {
  const m = rowKeyMap(row);

  return {
    note_guid: normalizeGuidValue(m.note_guid),
    note_type_code: strOrNull(m.note_type_code),
    note_text: strOrNull(m.note_text),
    private_flag: normalizeYnFlag(m.private_flag),
    created_by: strOrNull(m.created_by),
    creation_date: formatDateTime(m.creation_date)
  };
}

/**
 * Map one REC.V_APPLICATION_NOTES row into nested application / candidate / note.
 * @param {Record<string, unknown>} row
 */
export function mapApplicationNotesViewRow(row) {
  const m = rowKeyMap(row);

  return {
    application: {
      application_id: safeFiniteNumber(m.application_id),
      application_guid: normalizeGuidValue(m.application_guid),
      application_number: strOrNull(m.application_number),
      posting_id: safeFiniteNumber(m.posting_id),
      requisition_id: safeFiniteNumber(m.requisition_id),
      source: strOrNull(m.application_source),
      current_stage_code: strOrNull(m.current_stage_code),
      status: strOrNull(m.application_status),
      applied_date: formatDateTimeIso(m.applied_date)
    },
    candidate: {
      candidate_id: safeFiniteNumber(m.candidate_id),
      candidate_guid: normalizeGuidValue(m.candidate_guid),
      candidate_name: strOrNull(m.candidate_name),
      first_name: strOrNull(m.first_name),
      middle_name: strOrNull(m.middle_name),
      last_name: strOrNull(m.last_name),
      email: strOrNull(m.email),
      phone: strOrNull(m.phone),
      current_title: strOrNull(m.current_title),
      current_employer: strOrNull(m.current_employer),
      years_experience: safeFiniteNumber(m.years_experience),
      current_location: strOrNull(m.current_location),
      source: strOrNull(m.candidate_source),
      expected_salary: safeFiniteNumber(m.expected_salary),
      salary_currency: strOrNull(m.salary_currency),
      notice_period: strOrNull(m.notice_period),
      linkedin_profile: strOrNull(m.linkedin_profile),
      status: strOrNull(m.candidate_status),
      active_flag: normalizeYnFlag(m.candidate_active_flag)
    },
    note: {
      note_id: safeFiniteNumber(m.note_id),
      note_guid: normalizeGuidValue(m.note_guid),
      note_type_code: strOrNull(m.note_type_code),
      note_text: strOrNull(m.note_text),
      private_flag: normalizeYnFlag(m.private_flag),
      created_by: strOrNull(m.note_created_by),
      creation_date: formatDateTimeIso(m.note_creation_date),
      last_updated_by: strOrNull(m.note_last_updated_by),
      last_update_date: formatDateTimeIso(m.note_last_update_date)
    }
  };
}

/**
 * @param {ReturnType<typeof mapApplicationNotesViewRow>[]} mapped
 * @param {'application'|'candidate'} scope
 * @param {{ application_guid?: string, candidate_guid?: string|null }} emptyContext
 */
export function mapNotesListPayload(mapped, scope, emptyContext) {
  if (!mapped.length) {
    if (scope === 'candidate') {
      return {
        candidate: { candidate_guid: emptyContext.candidate_guid },
        notes: [],
        note_count: 0
      };
    }
    return {
      application: { application_guid: emptyContext.application_guid },
      candidate: { candidate_guid: emptyContext.candidate_guid ?? null },
      notes: [],
      note_count: 0
    };
  }

  const notes =
    scope === 'candidate'
      ? mapped.map((entry) => ({ ...entry.note, application: entry.application }))
      : mapped.map((entry) => entry.note);

  const payload = {
    candidate: mapped[0].candidate,
    notes,
    note_count: mapped.length
  };
  if (scope === 'application') {
    payload.application = mapped[0].application;
  }
  return payload;
}

/** @param {Record<string, unknown>[]} rows @param {{ application_guid: string, candidate_guid?: string|null }} emptyContext */
export function mapApplicationNotesListPayload(rows, emptyContext) {
  return mapNotesListPayload(
    (rows || []).map((row) => mapApplicationNotesViewRow(row)),
    'application',
    emptyContext
  );
}

/** @param {Record<string, unknown>[]} rows @param {{ candidate_guid: string }} emptyContext */
export function mapCandidateNotesListPayload(rows, emptyContext) {
  return mapNotesListPayload(
    (rows || []).map((row) => mapApplicationNotesViewRow(row)),
    'candidate',
    emptyContext
  );
}

/** @param {Record<string, unknown>} row */
export function mapStageHistoryDetailEntry(row) {
  const m = rowKeyMap(row);

  return {
    from_stage_code: strOrNull(m.from_stage_code),
    to_stage_code: strOrNull(m.to_stage_code),
    comments: strOrNull(m.comments),
    created_by: strOrNull(m.created_by),
    creation_date: formatDateTime(m.creation_date)
  };
}
