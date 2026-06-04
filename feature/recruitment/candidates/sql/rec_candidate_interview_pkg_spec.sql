-- =============================================================================
-- REC.CANDIDATE_INTERVIEW_PKG — package specification
-- Includes SUBMIT_FEEDBACK for interview scorecards and hiring recommendations.
-- =============================================================================

CREATE OR REPLACE PACKAGE REC.CANDIDATE_INTERVIEW_PKG AS

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
    );

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
    );

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
    );

    PROCEDURE DELETE_INTERVIEW (
        p_enterprise_id         IN  NUMBER,
        p_interview_guid        IN  RAW,
        p_deleted_by            IN  VARCHAR2,
        p_status                OUT VARCHAR2,
        p_message               OUT VARCHAR2
    );

END CANDIDATE_INTERVIEW_PKG;
/
