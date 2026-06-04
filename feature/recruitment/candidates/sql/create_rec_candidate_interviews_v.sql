-- =============================================================================
-- REC.CANDIDATE_INTERVIEWS_V — interview management list/detail for frontend
-- Sources: REC.CANDIDATE_INTERVIEWS, REC.CANDIDATES,
--          REC.CANDIDATE_INTERVIEWERS, EMPL.EMPLOYEES,
--          REC.CANDIDATE_INTERVIEW_FEEDBACK
-- Prerequisite: REC.CANDIDATE_INTERVIEWS has INTERVIEW_START_UTC / INTERVIEW_END_UTC
--               (TIMESTAMP WITH TIME ZONE or TIMESTAMP).
-- Run as REC (or ADMIN with privileges on REC objects).
-- =============================================================================

CREATE OR REPLACE VIEW REC.CANDIDATE_INTERVIEWS_V AS
SELECT
    /* Candidate */
    c.candidate_id,
    RAWTOHEX(c.candidate_guid) AS candidate_guid,
    c.enterprise_id,
    c.first_name,
    c.middle_name,
    c.last_name,
    TRIM(
        c.first_name || ' ' ||
        NVL(c.middle_name || ' ', '') ||
        c.last_name
    ) AS candidate_name,
    c.email,
    c.phone,
    c.current_title,
    c.current_employer,
    c.years_experience,
    c.current_location,
    c.portfolio_link,
    c.github_link,
    c.willing_to_relocate,
    c.current_salary,
    c.expected_salary,
    c.salary_currency,
    c.source,

    /* Interview */
    i.interview_id,
    RAWTOHEX(i.interview_guid) AS interview_guid,
    i.interview_title,
    i.interview_type,
    i.interview_round,
    i.interview_date,
    i.interview_mode,
    i.location,
    i.meeting_link,
    i.status,
    i.result_status,
    i.feedback,
    i.rating,
    i.active_flag,

    /* UTC calendar (ISO-8601 Z) */
    CASE
        WHEN i.interview_start_utc IS NOT NULL THEN
            TO_CHAR(
                CAST(i.interview_start_utc AS TIMESTAMP),
                'YYYY-MM-DD"T"HH24:MI:SS"Z"'
            )
    END AS interview_start_utc,
    CASE
        WHEN i.interview_end_utc IS NOT NULL THEN
            TO_CHAR(
                CAST(i.interview_end_utc AS TIMESTAMP),
                'YYYY-MM-DD"T"HH24:MI:SS"Z"'
            )
    END AS interview_end_utc,

    /* Active interviewers */
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'employee_id'       VALUE iv.employee_id,
                'employee_guid'     VALUE RAWTOHEX(e.employee_guid),
                'employee_name'     VALUE TRIM(
                    e.first_name_en || ' ' ||
                    NVL(e.middle_name_en || ' ', '') ||
                    e.last_name_en
                ),
                'primary_interviewer' VALUE iv.primary_interviewer
            )
            ORDER BY
                CASE WHEN NVL(iv.primary_interviewer, 'N') = 'Y' THEN 0 ELSE 1 END,
                iv.employee_id
            RETURNING CLOB
        )
        FROM REC.CANDIDATE_INTERVIEWERS iv
        INNER JOIN EMPL.EMPLOYEES e
            ON e.employee_id = iv.employee_id
           AND e.enterprise_id = iv.enterprise_id
        WHERE iv.enterprise_id = i.enterprise_id
          AND iv.interview_id = i.interview_id
          AND NVL(iv.active_flag, 'Y') = 'Y'
    ) AS interviewers_json,

    /* Structured evaluation (active feedback row per interview) */
    (
        SELECT JSON_OBJECT(
            'feedback_id'       VALUE f.feedback_id,
            'feedback_guid'     VALUE RAWTOHEX(f.feedback_guid),
            'overall_rating'    VALUE f.overall_rating,
            'technical_skills'  VALUE f.technical_skills,
            'communication'     VALUE f.communication,
            'culture_fit'       VALUE f.culture_fit,
            'recommendation'    VALUE f.recommendation,
            'detailed_comments' VALUE f.detailed_comments,
            'active_flag'       VALUE f.active_flag
            RETURNING CLOB
        )
        FROM REC.CANDIDATE_INTERVIEW_FEEDBACK f
        WHERE f.enterprise_id = i.enterprise_id
          AND f.interview_id = i.interview_id
          AND NVL(f.active_flag, 'Y') = 'Y'
    ) AS feedback_obj,

    /* Interview audit */
    i.created_by,
    i.creation_date,
    i.last_updated_by,
    i.last_update_date

FROM REC.CANDIDATE_INTERVIEWS i
INNER JOIN REC.CANDIDATES c
    ON c.candidate_id = i.candidate_id
   AND c.enterprise_id = i.enterprise_id;

-- =============================================================================
-- Performance indexes (run once; ignore ORA-955 if index already exists)
-- =============================================================================

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX REC.IX_CAND_INTV_INTERVIEW_ID ON REC.CANDIDATE_INTERVIEWS (INTERVIEW_ID)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX REC.IX_CAND_INTV_CANDIDATE_ID ON REC.CANDIDATE_INTERVIEWS (CANDIDATE_ID)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX REC.IX_CAND_INTVWR_INTERVIEW_ID ON REC.CANDIDATE_INTERVIEWERS (INTERVIEW_ID)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX REC.IX_CAND_INTVWR_EMPLOYEE_ID ON REC.CANDIDATE_INTERVIEWERS (EMPLOYEE_ID)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX EMPL.IX_EMPLOYEES_EMPLOYEE_ID ON EMPL.EMPLOYEES (EMPLOYEE_ID)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
