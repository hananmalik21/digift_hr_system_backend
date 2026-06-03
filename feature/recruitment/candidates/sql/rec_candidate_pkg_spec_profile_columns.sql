-- =============================================================================
-- REC.CANDIDATE_PKG — package specification (profile / compensation parameters)
-- Deploy after alter_rec_candidates_add_profile_columns.sql.
-- =============================================================================

CREATE OR REPLACE PACKAGE REC.CANDIDATE_PKG AS

  PROCEDURE CREATE_CANDIDATE (
    p_enterprise_id       IN  NUMBER,
    p_first_name          IN  VARCHAR2 DEFAULT NULL,
    p_middle_name         IN  VARCHAR2 DEFAULT NULL,
    p_last_name           IN  VARCHAR2 DEFAULT NULL,
    p_email               IN  VARCHAR2 DEFAULT NULL,
    p_phone               IN  VARCHAR2 DEFAULT NULL,
    p_current_title       IN  VARCHAR2 DEFAULT NULL,
    p_current_employer    IN  VARCHAR2 DEFAULT NULL,
    p_years_experience    IN  NUMBER   DEFAULT NULL,
    p_current_location    IN  VARCHAR2 DEFAULT NULL,
    p_source              IN  VARCHAR2 DEFAULT NULL,
    p_expected_salary     IN  NUMBER   DEFAULT NULL,
    p_salary_currency     IN  VARCHAR2 DEFAULT NULL,
    p_notice_period       IN  NUMBER   DEFAULT NULL,
    p_linkedin_profile    IN  VARCHAR2 DEFAULT NULL,
    p_current_salary      IN  NUMBER   DEFAULT NULL,
    p_portfolio_link      IN  VARCHAR2 DEFAULT NULL,
    p_github_link         IN  VARCHAR2 DEFAULT NULL,
    p_willing_to_relocate IN  VARCHAR2 DEFAULT 'N',
    p_education_json      IN  CLOB     DEFAULT NULL,
    p_experience_json     IN  CLOB     DEFAULT NULL,
    p_file_name           IN  VARCHAR2 DEFAULT NULL,
    p_file_type           IN  VARCHAR2 DEFAULT NULL,
    p_file_size           IN  NUMBER   DEFAULT NULL,
    p_file_content        IN  BLOB     DEFAULT NULL,
    p_created_by          IN  VARCHAR2 DEFAULT NULL,
    p_candidate_id        OUT NUMBER,
    p_candidate_guid      OUT RAW,
    p_status              OUT VARCHAR2,
    p_message             OUT VARCHAR2
  );

  PROCEDURE UPDATE_CANDIDATE (
    p_enterprise_id       IN  NUMBER,
    p_candidate_guid      IN  RAW,
    p_first_name          IN  VARCHAR2 DEFAULT NULL,
    p_middle_name         IN  VARCHAR2 DEFAULT NULL,
    p_last_name           IN  VARCHAR2 DEFAULT NULL,
    p_email               IN  VARCHAR2 DEFAULT NULL,
    p_phone               IN  VARCHAR2 DEFAULT NULL,
    p_current_title       IN  VARCHAR2 DEFAULT NULL,
    p_current_employer    IN  VARCHAR2 DEFAULT NULL,
    p_years_experience    IN  NUMBER   DEFAULT NULL,
    p_current_location    IN  VARCHAR2 DEFAULT NULL,
    p_source              IN  VARCHAR2 DEFAULT NULL,
    p_expected_salary     IN  NUMBER   DEFAULT NULL,
    p_salary_currency     IN  VARCHAR2 DEFAULT NULL,
    p_notice_period       IN  NUMBER   DEFAULT NULL,
    p_linkedin_profile    IN  VARCHAR2 DEFAULT NULL,
    p_current_salary      IN  NUMBER   DEFAULT NULL,
    p_portfolio_link      IN  VARCHAR2 DEFAULT NULL,
    p_github_link         IN  VARCHAR2 DEFAULT NULL,
    p_willing_to_relocate IN  VARCHAR2 DEFAULT NULL,
    p_status_code         IN  VARCHAR2 DEFAULT NULL,
    p_education_json      IN  CLOB     DEFAULT NULL,
    p_experience_json     IN  CLOB     DEFAULT NULL,
    p_file_name           IN  VARCHAR2 DEFAULT NULL,
    p_file_type           IN  VARCHAR2 DEFAULT NULL,
    p_file_size           IN  NUMBER   DEFAULT NULL,
    p_file_content        IN  BLOB     DEFAULT NULL,
    p_updated_by          IN  VARCHAR2 DEFAULT NULL,
    p_status              OUT VARCHAR2,
    p_message             OUT VARCHAR2
  );

  PROCEDURE DELETE_CANDIDATE (
    p_enterprise_id  IN  NUMBER,
    p_candidate_guid IN  RAW,
    p_deleted_by     IN  VARCHAR2 DEFAULT NULL,
    p_status         OUT VARCHAR2,
    p_message        OUT VARCHAR2
  );

END CANDIDATE_PKG;
/
