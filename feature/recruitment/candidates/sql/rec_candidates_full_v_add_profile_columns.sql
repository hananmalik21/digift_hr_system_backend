-- =============================================================================
-- REC.CANDIDATES_FULL_V — expose profile & compensation columns on list/detail
-- Prerequisite: REC.CANDIDATES has CURRENT_SALARY, PORTFOLIO_LINK, GITHUB_LINK,
--               WILLING_TO_RELOCATE, DATE_OF_BIRTH, GENDER, NATIONALITY,
--               VISA_STATUS, ALTERNATE_PHONE, ALTERNATE_EMAIL, PREFERRED_LOCATION,
--               SOURCE_FROM.
-- Run as REC or a user with CREATE OR REPLACE VIEW on REC.CANDIDATES_FULL_V.
-- =============================================================================

CREATE OR REPLACE VIEW REC.CANDIDATES_FULL_V AS
SELECT
    c.candidate_id,
    RAWTOHEX(c.candidate_guid) AS candidate_guid,
    c.enterprise_id,

    c.first_name,
    c.middle_name,
    c.last_name,
    c.first_name || ' ' || c.last_name AS full_name,

    c.email,
    c.phone,
    c.current_title,
    c.current_employer,
    c.years_experience,
    c.current_location,
    c.source,
    c.expected_salary,
    c.current_salary,
    c.salary_currency,
    c.notice_period,
    c.linkedin_profile,
    c.portfolio_link,
    c.github_link,
    c.willing_to_relocate,
    c.date_of_birth,
    c.gender,
    c.nationality,
    c.visa_status,
    c.alternate_phone,
    c.alternate_email,
    c.preferred_location,
    c.source_from,
    c.status,
    c.active_flag,

    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'education_id' VALUE e.education_id,
                'education_guid' VALUE RAWTOHEX(e.education_guid),
                'degree_name' VALUE e.degree_name,
                'institution_name' VALUE e.institution_name,
                'field_of_study' VALUE e.field_of_study,
                'start_date' VALUE TO_CHAR(e.start_date,'YYYY-MM-DD'),
                'end_date' VALUE TO_CHAR(e.end_date,'YYYY-MM-DD'),
                'grade' VALUE e.grade,
                'description' VALUE e.description
            ) RETURNING CLOB
        )
        FROM REC.CANDIDATE_EDUCATION e
        WHERE e.enterprise_id = c.enterprise_id
        AND e.candidate_id = c.candidate_id
    ) AS education_json,

    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'experience_id' VALUE x.experience_id,
                'experience_guid' VALUE RAWTOHEX(x.experience_guid),
                'company_name' VALUE x.company_name,
                'job_title' VALUE x.job_title,
                'location' VALUE x.location,
                'start_date' VALUE TO_CHAR(x.start_date,'YYYY-MM-DD'),
                'end_date' VALUE TO_CHAR(x.end_date,'YYYY-MM-DD'),
                'current_job_flag' VALUE x.current_job_flag,
                'description' VALUE x.description
            ) RETURNING CLOB
        )
        FROM REC.CANDIDATE_EXPERIENCE x
        WHERE x.enterprise_id = c.enterprise_id
        AND x.candidate_id = c.candidate_id
    ) AS experience_json,

    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'candidate_skill_id' VALUE s.candidate_skill_id,
                'candidate_skill_guid' VALUE RAWTOHEX(s.candidate_skill_guid),
                'skill_name' VALUE s.skill_name
            ) RETURNING CLOB
            ORDER BY s.skill_name
        )
        FROM REC.CANDIDATE_SKILLS s
        WHERE s.enterprise_id = c.enterprise_id
        AND s.candidate_id = c.candidate_id
    ) AS skills_json,

    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'resume_id' VALUE r.resume_id,
                'resume_guid' VALUE RAWTOHEX(r.resume_guid),
                'file_name' VALUE r.file_name,
                'file_type' VALUE r.file_type,
                'file_size' VALUE r.file_size,
                'active_flag' VALUE r.active_flag,
                'resume_link' VALUE '/candidates/resume/' || RAWTOHEX(r.resume_guid),
                'created_by' VALUE r.created_by,
                'creation_date' VALUE TO_CHAR(r.creation_date,'YYYY-MM-DD HH24:MI:SS')
            ) RETURNING CLOB
        )
        FROM REC.CANDIDATE_RESUMES r
        WHERE r.enterprise_id = c.enterprise_id
        AND r.candidate_id = c.candidate_id
    ) AS resumes_json,

    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'background_check_id' VALUE b.background_check_id,
                'background_check_guid' VALUE RAWTOHEX(b.background_check_guid),
                'provider' VALUE b.provider,
                'check_type' VALUE b.check_type,
                'employment_ver_flag' VALUE b.employment_ver_flag,
                'education_ver_flag' VALUE b.education_ver_flag,
                'criminal_record_flag' VALUE b.criminal_record_flag,
                'credit_check_flag' VALUE b.credit_check_flag,
                'drug_testing_flag' VALUE b.drug_testing_flag,
                'priority' VALUE b.priority,
                'additional_notes' VALUE b.additional_notes,
                'consent_obtained_flag' VALUE b.consent_obtained_flag,
                'status' VALUE b.status,
                'requested_date' VALUE TO_CHAR(b.requested_date,'YYYY-MM-DD'),
                'completed_date' VALUE TO_CHAR(b.completed_date,'YYYY-MM-DD'),
                'active_flag' VALUE b.active_flag,
                'created_by' VALUE b.created_by,
                'creation_date' VALUE TO_CHAR(b.creation_date,'YYYY-MM-DD HH24:MI:SS')
            ) RETURNING CLOB
        )
        FROM REC.CANDIDATE_BACKGROUND_CHECKS b
        WHERE b.enterprise_id = c.enterprise_id
        AND b.candidate_id = c.candidate_id
    ) AS background_checks_json,

    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'assessment_id' VALUE a.assessment_id,
                'assessment_guid' VALUE RAWTOHEX(a.assessment_guid),
                'assessment_type' VALUE a.assessment_type,
                'assessment_template' VALUE a.assessment_template,
                'platform' VALUE a.platform,
                'difficulty_level' VALUE a.difficulty_level,
                'duration_minutes' VALUE a.duration_minutes,
                'completion_due_date' VALUE TO_CHAR(a.completion_due_date,'YYYY-MM-DD'),
                'skills_json' VALUE a.skills_json,
                'instructions' VALUE a.instructions,
                'status' VALUE a.status,
                'active_flag' VALUE a.active_flag,
                'created_by' VALUE a.created_by,
                'creation_date' VALUE TO_CHAR(a.creation_date,'YYYY-MM-DD HH24:MI:SS')
            ) RETURNING CLOB
        )
        FROM REC.CANDIDATE_ASSESSMENTS a
        WHERE a.enterprise_id = c.enterprise_id
        AND a.candidate_id = c.candidate_id
        AND a.active_flag = 'Y'
    ) AS assessments_json,

    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'pool_id' VALUE p.pool_id,
                'pool_guid' VALUE RAWTOHEX(p.pool_guid),
                'pool_name' VALUE p.pool_name,
                'pool_candidate_id' VALUE pc.pool_candidate_id,
                'pool_candidate_guid' VALUE RAWTOHEX(pc.pool_candidate_guid),
                'active_flag' VALUE pc.active_flag,
                'created_by' VALUE pc.created_by,
                'creation_date' VALUE TO_CHAR(pc.creation_date,'YYYY-MM-DD HH24:MI:SS')
            ) RETURNING CLOB
        )
        FROM REC.TALENT_POOL_CANDIDATES pc
        JOIN REC.TALENT_POOLS p
          ON p.enterprise_id = pc.enterprise_id
         AND p.pool_id = pc.pool_id
        WHERE pc.enterprise_id = c.enterprise_id
        AND pc.candidate_id = c.candidate_id
        AND pc.active_flag = 'Y'
    ) AS talent_pools_json,

    c.created_by,
    c.creation_date,
    c.last_updated_by,
    c.last_update_date

FROM REC.CANDIDATES c;
