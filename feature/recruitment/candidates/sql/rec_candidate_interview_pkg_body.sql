-- =============================================================================
-- REC.CANDIDATE_INTERVIEW_PKG — package body
-- SUBMIT_FEEDBACK: scorecard persistence + interview completion workflow.
-- =============================================================================

CREATE OR REPLACE PACKAGE BODY REC.CANDIDATE_INTERVIEW_PKG AS

    ---------------------------------------------------------------------------
    -- Map frontend recommendation codes to interview RESULT_STATUS.
    ---------------------------------------------------------------------------
    FUNCTION MAP_RECOMMENDATION_TO_RESULT (
        p_recommendation IN VARCHAR2
    ) RETURN VARCHAR2
    IS
        l_rec VARCHAR2(50) := UPPER(TRIM(p_recommendation));
    BEGIN
        RETURN CASE l_rec
            WHEN 'HIRE'     THEN 'SELECTED'
            WHEN 'SELECTED' THEN 'SELECTED'
            WHEN 'NO_HIRE'  THEN 'REJECTED'
            WHEN 'REJECTED' THEN 'REJECTED'
            WHEN 'HOLD'     THEN 'ON_HOLD'
            WHEN 'ON_HOLD'  THEN 'ON_HOLD'
            ELSE 'PENDING'
        END;
    END MAP_RECOMMENDATION_TO_RESULT;

    ---------------------------------------------------------------------------
    PROCEDURE SCHEDULE_INTERVIEW (
        p_enterprise_id         IN  NUMBER,
        p_candidate_guid        IN  RAW,
        p_interview_title       IN  VARCHAR2 DEFAULT NULL,
        p_interview_type        IN  VARCHAR2,
        p_interview_round       IN  NUMBER   DEFAULT 1,
        p_interview_date        IN  DATE,
        p_interview_start_utc   IN  TIMESTAMP WITH TIME ZONE,
        p_interview_end_utc     IN  TIMESTAMP WITH TIME ZONE,
        p_interview_mode        IN  VARCHAR2 DEFAULT NULL,
        p_location              IN  VARCHAR2 DEFAULT NULL,
        p_meeting_link          IN  VARCHAR2 DEFAULT NULL,
        p_interviewers_json     IN  CLOB,
        p_created_by            IN  VARCHAR2,
        p_interview_id          OUT NUMBER,
        p_interview_guid        OUT RAW,
        p_status                OUT VARCHAR2,
        p_message               OUT VARCHAR2
    )
    AS
        l_candidate_id NUMBER;
    BEGIN
        p_status := 'ERROR';

        IF p_enterprise_id IS NULL THEN
            p_message := 'Enterprise ID is required.';
            RETURN;
        END IF;

        IF p_candidate_guid IS NULL THEN
            p_message := 'Candidate GUID is required.';
            RETURN;
        END IF;

        IF TRIM(p_interview_type) IS NULL THEN
            p_message := 'Interview type is required.';
            RETURN;
        END IF;

        IF p_interview_date IS NULL THEN
            p_message := 'Interview date is required.';
            RETURN;
        END IF;

        IF p_interview_start_utc IS NULL THEN
            p_message := 'Interview start UTC is required.';
            RETURN;
        END IF;

        IF p_interview_end_utc IS NULL THEN
            p_message := 'Interview end UTC is required.';
            RETURN;
        END IF;

        IF p_interview_end_utc <= p_interview_start_utc THEN
            p_message := 'Interview end time must be after start time.';
            RETURN;
        END IF;

        SELECT candidate_id
          INTO l_candidate_id
          FROM rec.candidates
         WHERE enterprise_id = p_enterprise_id
           AND candidate_guid = p_candidate_guid;

        INSERT INTO rec.candidate_interviews (
            enterprise_id,
            candidate_id,
            interview_title,
            interview_type,
            interview_round,
            interview_date,
            interview_start_utc,
            interview_end_utc,
            interview_mode,
            location,
            meeting_link,
            status,
            result_status,
            active_flag,
            created_by,
            creation_date,
            last_updated_by,
            last_update_date
        ) VALUES (
            p_enterprise_id,
            l_candidate_id,
            TRIM(p_interview_title),
            UPPER(TRIM(p_interview_type)),
            NVL(p_interview_round, 1),
            p_interview_date,
            p_interview_start_utc,
            p_interview_end_utc,
            UPPER(TRIM(p_interview_mode)),
            p_location,
            p_meeting_link,
            'SCHEDULED',
            'PENDING',
            'Y',
            p_created_by,
            SYSDATE,
            p_created_by,
            SYSDATE
        )
        RETURNING interview_id, interview_guid
             INTO p_interview_id, p_interview_guid;

        IF p_interviewers_json IS NOT NULL THEN
            INSERT INTO rec.candidate_interviewers (
                enterprise_id,
                interview_id,
                employee_id,
                primary_interviewer,
                active_flag,
                created_by,
                creation_date,
                last_updated_by,
                last_update_date
            )
            SELECT
                p_enterprise_id,
                p_interview_id,
                employee_id,
                NVL(primary_interviewer, 'N'),
                'Y',
                p_created_by,
                SYSDATE,
                p_created_by,
                SYSDATE
            FROM JSON_TABLE(
                p_interviewers_json,
                '$[*]'
                COLUMNS (
                    employee_id         NUMBER       PATH '$.employee_id',
                    primary_interviewer VARCHAR2(1)  PATH '$.primary_interviewer'
                )
            );
        END IF;

        COMMIT;

        p_status  := 'SUCCESS';
        p_message := 'Interview scheduled successfully.';

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := 'Candidate not found.';
        WHEN OTHERS THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := SQLERRM;
    END SCHEDULE_INTERVIEW;

    ---------------------------------------------------------------------------
    PROCEDURE UPDATE_INTERVIEW (
        p_enterprise_id         IN  NUMBER,
        p_interview_guid        IN  RAW,
        p_interview_title       IN  VARCHAR2 DEFAULT NULL,
        p_interview_type        IN  VARCHAR2 DEFAULT NULL,
        p_interview_round       IN  NUMBER   DEFAULT NULL,
        p_interview_date        IN  DATE     DEFAULT NULL,
        p_interview_start_utc   IN  TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        p_interview_end_utc     IN  TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        p_interview_mode        IN  VARCHAR2 DEFAULT NULL,
        p_location              IN  VARCHAR2 DEFAULT NULL,
        p_meeting_link          IN  VARCHAR2 DEFAULT NULL,
        p_interviewers_json     IN  CLOB     DEFAULT NULL,
        p_status_code           IN  VARCHAR2 DEFAULT NULL,
        p_result_status         IN  VARCHAR2 DEFAULT NULL,
        p_feedback              IN  VARCHAR2 DEFAULT NULL,
        p_rating                IN  NUMBER   DEFAULT NULL,
        p_updated_by            IN  VARCHAR2,
        p_status                OUT VARCHAR2,
        p_message               OUT VARCHAR2
    )
    AS
        l_interview_id NUMBER;
    BEGIN
        p_status := 'ERROR';

        SELECT interview_id
          INTO l_interview_id
          FROM rec.candidate_interviews
         WHERE enterprise_id = p_enterprise_id
           AND interview_guid = p_interview_guid
           AND NVL(active_flag, 'Y') = 'Y';

        UPDATE rec.candidate_interviews
           SET interview_title     = NVL(TRIM(p_interview_title), interview_title),
               interview_type      = NVL(UPPER(TRIM(p_interview_type)), interview_type),
               interview_round     = NVL(p_interview_round, interview_round),
               interview_date      = NVL(p_interview_date, interview_date),
               interview_start_utc = NVL(p_interview_start_utc, interview_start_utc),
               interview_end_utc   = NVL(p_interview_end_utc, interview_end_utc),
               interview_mode      = NVL(UPPER(TRIM(p_interview_mode)), interview_mode),
               location            = NVL(p_location, location),
               meeting_link        = NVL(p_meeting_link, meeting_link),
               status              = NVL(p_status_code, status),
               result_status       = NVL(p_result_status, result_status),
               feedback            = NVL(p_feedback, feedback),
               rating              = NVL(p_rating, rating),
               last_updated_by     = p_updated_by,
               last_update_date    = SYSDATE
         WHERE enterprise_id = p_enterprise_id
           AND interview_id = l_interview_id;

        IF p_interviewers_json IS NOT NULL THEN
            DELETE FROM rec.candidate_interviewers
             WHERE enterprise_id = p_enterprise_id
               AND interview_id = l_interview_id;

            INSERT INTO rec.candidate_interviewers (
                enterprise_id,
                interview_id,
                employee_id,
                primary_interviewer,
                active_flag,
                created_by,
                creation_date,
                last_updated_by,
                last_update_date
            )
            SELECT
                p_enterprise_id,
                l_interview_id,
                employee_id,
                NVL(primary_interviewer, 'N'),
                'Y',
                p_updated_by,
                SYSDATE,
                p_updated_by,
                SYSDATE
            FROM JSON_TABLE(
                p_interviewers_json,
                '$[*]'
                COLUMNS (
                    employee_id         NUMBER       PATH '$.employee_id',
                    primary_interviewer VARCHAR2(1)  PATH '$.primary_interviewer'
                )
            );
        END IF;

        COMMIT;

        p_status  := 'SUCCESS';
        p_message := 'Interview updated successfully.';

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := 'Interview not found.';
        WHEN OTHERS THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := SQLERRM;
    END UPDATE_INTERVIEW;

    ---------------------------------------------------------------------------
    PROCEDURE SUBMIT_FEEDBACK (
        p_enterprise_id         IN  NUMBER,
        p_interview_guid        IN  RAW,
        p_overall_rating        IN  NUMBER,
        p_technical_skills      IN  VARCHAR2 DEFAULT NULL,
        p_communication         IN  VARCHAR2 DEFAULT NULL,
        p_culture_fit           IN  VARCHAR2 DEFAULT NULL,
        p_recommendation        IN  VARCHAR2,
        p_detailed_comments     IN  VARCHAR2 DEFAULT NULL,
        p_created_by            IN  VARCHAR2,
        p_status                OUT VARCHAR2,
        p_message               OUT VARCHAR2
    )
    AS
        l_interview_id    NUMBER;
        l_result_status   VARCHAR2(50);
        l_recommendation  VARCHAR2(50);
    BEGIN
        p_status := 'ERROR';

        IF p_enterprise_id IS NULL THEN
            p_message := 'Enterprise ID is required.';
            RETURN;
        END IF;

        IF p_interview_guid IS NULL THEN
            p_message := 'Interview GUID is required.';
            RETURN;
        END IF;

        IF p_overall_rating IS NULL THEN
            p_message := 'Overall rating is required.';
            RETURN;
        END IF;

        IF p_overall_rating < 1 OR p_overall_rating > 5 THEN
            p_message := 'Overall rating must be between 1 and 5.';
            RETURN;
        END IF;

        IF TRIM(p_recommendation) IS NULL THEN
            p_message := 'Recommendation is required.';
            RETURN;
        END IF;

        IF TRIM(p_created_by) IS NULL THEN
            p_message := 'Created by is required.';
            RETURN;
        END IF;

        l_recommendation := UPPER(TRIM(p_recommendation));
        l_result_status  := MAP_RECOMMENDATION_TO_RESULT(l_recommendation);

        SELECT interview_id
          INTO l_interview_id
          FROM rec.candidate_interviews
         WHERE enterprise_id = p_enterprise_id
           AND interview_guid = p_interview_guid
           AND NVL(active_flag, 'Y') = 'Y';

        MERGE INTO rec.candidate_interview_feedback f
        USING (
            SELECT
                p_enterprise_id  AS enterprise_id,
                l_interview_id   AS interview_id
            FROM dual
        ) src
        ON (
            f.enterprise_id = src.enterprise_id
            AND f.interview_id = src.interview_id
        )
        WHEN MATCHED THEN
            UPDATE SET
                f.overall_rating    = p_overall_rating,
                f.technical_skills  = UPPER(TRIM(p_technical_skills)),
                f.communication     = UPPER(TRIM(p_communication)),
                f.culture_fit       = UPPER(TRIM(p_culture_fit)),
                f.recommendation    = l_recommendation,
                f.detailed_comments = p_detailed_comments,
                f.active_flag       = 'Y',
                f.last_updated_by   = p_created_by,
                f.last_update_date  = SYSDATE
        WHEN NOT MATCHED THEN
            INSERT (
                enterprise_id,
                interview_id,
                overall_rating,
                technical_skills,
                communication,
                culture_fit,
                recommendation,
                detailed_comments,
                active_flag,
                created_by,
                creation_date,
                last_updated_by,
                last_update_date
            ) VALUES (
                p_enterprise_id,
                l_interview_id,
                p_overall_rating,
                UPPER(TRIM(p_technical_skills)),
                UPPER(TRIM(p_communication)),
                UPPER(TRIM(p_culture_fit)),
                l_recommendation,
                p_detailed_comments,
                'Y',
                p_created_by,
                SYSDATE,
                p_created_by,
                SYSDATE
            );

        UPDATE rec.candidate_interviews
           SET status            = 'COMPLETED',
               result_status     = l_result_status,
               rating            = p_overall_rating,
               feedback          = p_detailed_comments,
               last_updated_by   = p_created_by,
               last_update_date  = SYSDATE
         WHERE enterprise_id = p_enterprise_id
           AND interview_id = l_interview_id;

        COMMIT;

        p_status  := 'SUCCESS';
        p_message := 'Interview feedback submitted successfully.';

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := 'Interview not found.';
        WHEN OTHERS THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := SQLERRM;
    END SUBMIT_FEEDBACK;

    ---------------------------------------------------------------------------
    PROCEDURE DELETE_INTERVIEW (
        p_enterprise_id         IN  NUMBER,
        p_interview_guid        IN  RAW,
        p_deleted_by            IN  VARCHAR2,
        p_status                OUT VARCHAR2,
        p_message               OUT VARCHAR2
    )
    AS
    BEGIN
        p_status := 'ERROR';

        UPDATE rec.candidate_interviews
           SET active_flag      = 'N',
               status           = 'CANCELLED',
               last_updated_by  = p_deleted_by,
               last_update_date = SYSDATE
         WHERE enterprise_id = p_enterprise_id
           AND interview_guid = p_interview_guid;

        IF SQL%ROWCOUNT = 0 THEN
            p_message := 'Interview not found.';
            RETURN;
        END IF;

        UPDATE rec.candidate_interviewers
           SET active_flag      = 'N',
               last_updated_by  = p_deleted_by,
               last_update_date = SYSDATE
         WHERE enterprise_id = p_enterprise_id
           AND interview_id IN (
               SELECT interview_id
                 FROM rec.candidate_interviews
                WHERE enterprise_id = p_enterprise_id
                  AND interview_guid = p_interview_guid
           );

        COMMIT;

        p_status  := 'SUCCESS';
        p_message := 'Interview deleted successfully.';

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            p_status  := 'ERROR';
            p_message := SQLERRM;
    END DELETE_INTERVIEW;

END CANDIDATE_INTERVIEW_PKG;
/
