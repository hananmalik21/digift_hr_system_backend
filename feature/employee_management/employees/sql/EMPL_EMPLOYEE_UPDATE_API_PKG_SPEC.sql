-- =============================================================================
-- EMPL.EMPL_EMPLOYEE_UPDATE_API_PKG — package specification
-- Includes FOURTH_NAME_EN / FOURTH_NAME_AR on UPDATE_EMPLOYEE_ALL_IN_ONE.
-- Deploy: run this script, then EMPL_EMPLOYEE_UPDATE_API_PKG_BODY.sql
-- =============================================================================

CREATE OR REPLACE PACKAGE EMPL.EMPL_EMPLOYEE_UPDATE_API_PKG AS
PROCEDURE UPDATE_EMPLOYEE_ALL_IN_ONE (
    -- Identity (required)
    p_enterprise_id     IN NUMBER,
    p_employee_id       IN NUMBER,

    -- EMPLOYEES (all optional)
    p_first_name_en        IN VARCHAR2  DEFAULT NULL,
    p_middle_name_en       IN VARCHAR2  DEFAULT NULL,
    p_last_name_en         IN VARCHAR2  DEFAULT NULL,
    p_fourth_name_en       IN VARCHAR2  DEFAULT NULL,
    p_first_name_ar        IN NVARCHAR2 DEFAULT NULL,
    p_middle_name_ar       IN NVARCHAR2 DEFAULT NULL,
    p_last_name_ar         IN NVARCHAR2 DEFAULT NULL,
    p_fourth_name_ar       IN NVARCHAR2 DEFAULT NULL,
    p_email                IN VARCHAR2  DEFAULT NULL,
    p_phone_number         IN VARCHAR2  DEFAULT NULL,
    p_mobile_number        IN VARCHAR2  DEFAULT NULL,
    p_date_of_birth        IN DATE      DEFAULT NULL,

    -- USER-CONTROLLED EMPLOYEE LIFECYCLE
    p_employee_status      IN VARCHAR2  DEFAULT NULL,  -- ACTIVE | INACTIVE | PROBATION
    p_employee_is_active   IN CHAR      DEFAULT NULL,  -- Y | N

    -- DEMOGRAPHICS (all optional)
    p_gender_code          IN VARCHAR2 DEFAULT NULL,
    p_nationality          IN VARCHAR2 DEFAULT NULL,
    p_marital_status_code  IN VARCHAR2 DEFAULT NULL,
    p_religion_code        IN VARCHAR2 DEFAULT NULL,
    p_civil_id_number      IN VARCHAR2 DEFAULT NULL,
    p_passport_number      IN VARCHAR2 DEFAULT NULL,

    -- EMERGENCY (all optional)
    p_contact_name      IN VARCHAR2 DEFAULT NULL,
    p_relationship      IN VARCHAR2 DEFAULT NULL,
    p_emerg_phone       IN VARCHAR2 DEFAULT NULL,
    p_emerg_email       IN VARCHAR2 DEFAULT NULL,
    p_emerg_address     IN VARCHAR2 DEFAULT NULL,

    -- Schedule (optional)
    p_work_schedule_id  IN NUMBER DEFAULT NULL,
    p_ws_start          IN DATE   DEFAULT TRUNC(SYSDATE),
    p_ws_end            IN DATE   DEFAULT DATE '4712-12-31',
    -- Document compliance (optional)
    p_civil_id_expiry    IN DATE DEFAULT NULL,
    p_passport_expiry    IN DATE DEFAULT NULL,
    p_visa_number        IN VARCHAR2 DEFAULT NULL,
    p_visa_expiry        IN DATE DEFAULT NULL,
    p_work_permit_number IN VARCHAR2 DEFAULT NULL,
    p_work_permit_expiry IN DATE DEFAULT NULL,

    -- Bank (optional)
    p_bank_code         IN VARCHAR2 DEFAULT NULL,
    p_bank_name         IN VARCHAR2 DEFAULT NULL,
    p_account_number    IN VARCHAR2 DEFAULT NULL,
    p_iban              IN VARCHAR2 DEFAULT NULL,

    -- Assignment (optional)
    p_org_unit_id            IN RAW      DEFAULT NULL,
    p_work_location_id       IN NUMBER   DEFAULT NULL,
    p_position_id            IN RAW      DEFAULT NULL,
    p_job_family_id          IN NUMBER   DEFAULT NULL,
    p_job_level_id           IN NUMBER   DEFAULT NULL,
    p_grade_id               IN NUMBER   DEFAULT NULL,
    p_enterprise_hire_date   IN DATE     DEFAULT NULL,
    p_contract_type_code     IN VARCHAR2 DEFAULT NULL,
    p_probation_days         IN NUMBER   DEFAULT NULL,
    p_reporting_to_emp_id    IN NUMBER   DEFAULT NULL,
    p_employment_status      IN VARCHAR2 DEFAULT NULL,
    p_asg_start              IN DATE     DEFAULT TRUNC(SYSDATE),
    p_asg_end                IN DATE     DEFAULT DATE '4712-12-31',

    -- Address (optional)
    p_address_line1     IN VARCHAR2 DEFAULT NULL,
    p_address_line2     IN VARCHAR2 DEFAULT NULL,
    p_city              IN VARCHAR2 DEFAULT NULL,
    p_area              IN VARCHAR2 DEFAULT NULL,
    p_country_code      IN VARCHAR2 DEFAULT NULL,

    -- Document (ALL OPTIONAL)
    p_document_type_code  IN VARCHAR2 DEFAULT NULL,
    p_doc_file_name       IN VARCHAR2 DEFAULT NULL,
    p_doc_mime_type       IN VARCHAR2 DEFAULT NULL,
    p_doc_access_url      IN VARCHAR2 DEFAULT NULL,
    p_doc_hash_sha256     IN VARCHAR2 DEFAULT NULL,
    p_doc_file_content    IN BLOB     DEFAULT NULL,

    -- Document action + replace target
    p_doc_action          IN VARCHAR2 DEFAULT 'ADD',  -- ADD | REPLACE
    p_replace_document_id IN NUMBER  DEFAULT NULL,   -- if REPLACE update-in-place when provided

    p_actor               IN VARCHAR2 DEFAULT NULL,

    -- OUT
    o_document_id         OUT NUMBER,
    o_document_guid       OUT RAW
  );


END EMPL_EMPLOYEE_UPDATE_API_PKG;
/
