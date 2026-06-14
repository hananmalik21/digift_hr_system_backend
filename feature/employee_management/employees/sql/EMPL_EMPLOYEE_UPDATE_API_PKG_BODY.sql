-- =============================================================================
-- EMPL.EMPL_EMPLOYEE_UPDATE_API_PKG — package body
-- Includes FOURTH_NAME_EN / FOURTH_NAME_AR on UPDATE_EMPLOYEE_ALL_IN_ONE.
-- Deploy after EMPL_EMPLOYEE_UPDATE_API_PKG_SPEC.sql
-- =============================================================================

CREATE OR REPLACE PACKAGE BODY EMPL.EMPL_EMPLOYEE_UPDATE_API_PKG AS
g_user_error_code CONSTANT NUMBER := -20001;

  ---------------------------------------------------------------------------
  -- Helpers - user friendly only, no ORA text exposed
  ---------------------------------------------------------------------------
  PROCEDURE raise_err(p_msg VARCHAR2) IS
  BEGIN
    RAISE_APPLICATION_ERROR(g_user_error_code, p_msg);
  END;

  PROCEDURE raise_generic(p_area VARCHAR2) IS
  BEGIN
    RAISE_APPLICATION_ERROR(
      g_user_error_code,
      'Unable to ' || p_area || '. Please check the information and try again.'
    );
  END;

  FUNCTION normalize_phone(p_phone VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    IF p_phone IS NULL THEN
      RETURN NULL;
    END IF;

    RETURN REGEXP_REPLACE(TRIM(p_phone), '[^0-9+]', '');
  END;

  FUNCTION is_email_valid(p_email VARCHAR2) RETURN BOOLEAN IS
  BEGIN
    IF p_email IS NULL THEN
      RETURN FALSE;
    END IF;

    RETURN REGEXP_LIKE(
      p_email,
      '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
    );
  END;

  FUNCTION employee_exists(p_enterprise_id NUMBER, p_employee_id NUMBER) RETURN BOOLEAN IS
    v_cnt NUMBER;
  BEGIN
    SELECT COUNT(*)
      INTO v_cnt
      FROM empl.employees
     WHERE enterprise_id = p_enterprise_id
       AND employee_id   = p_employee_id;

    RETURN v_cnt > 0;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE = g_user_error_code THEN RAISE; END IF;
      raise_generic('validate employee');
  END;

  PROCEDURE assert_emp_status(p_status VARCHAR2) IS
    v VARCHAR2(30);
  BEGIN
    IF p_status IS NULL OR TRIM(p_status) IS NULL THEN
      RETURN;
    END IF;

    v := UPPER(TRIM(p_status));

    IF v NOT IN ('ACTIVE','INACTIVE','PROBATION') THEN
      raise_err('Employee status must be Active, Inactive, or Probation.');
    END IF;
  END;

  PROCEDURE assert_is_active(p_is_active CHAR) IS
    v CHAR(1);
  BEGIN
    IF p_is_active IS NULL OR TRIM(p_is_active) IS NULL THEN
      RETURN;
    END IF;

    v := UPPER(TRIM(p_is_active));

    IF v NOT IN ('Y','N') THEN
      raise_err('Active flag must be Y or N.');
    END IF;
  END;

  FUNCTION guess_extension(p_mime VARCHAR2) RETURN VARCHAR2 IS
    v VARCHAR2(128) := LOWER(TRIM(NVL(p_mime, '')));
  BEGIN
    IF v LIKE '%pdf%' THEN RETURN 'pdf'; END IF;
    IF v LIKE '%jpeg%' OR v LIKE '%jpg%' THEN RETURN 'jpg'; END IF;
    IF v LIKE '%png%' THEN RETURN 'png'; END IF;
    IF v LIKE '%gif%' THEN RETURN 'gif'; END IF;
    IF v LIKE '%msword%' OR v LIKE '%doc%' THEN RETURN 'doc'; END IF;
    IF v LIKE '%wordprocessingml%' THEN RETURN 'docx'; END IF;
    IF v LIKE '%spreadsheetml%' THEN RETURN 'xlsx'; END IF;
    IF v LIKE '%excel%' THEN RETURN 'xls'; END IF;
    IF v LIKE '%text%' THEN RETURN 'txt'; END IF;

    RETURN 'bin';
  END;

  FUNCTION default_doc_file_name(
    p_employee_id         NUMBER,
    p_document_type_code  VARCHAR2,
    p_mime_type           VARCHAR2
  ) RETURN VARCHAR2 IS
    v_type VARCHAR2(100);
    v_ext  VARCHAR2(10);
  BEGIN
    v_type := REGEXP_REPLACE(UPPER(NVL(TRIM(p_document_type_code), 'DOC')), '[^A-Z0-9_]+', '_');
    v_ext  := guess_extension(p_mime_type);

    RETURN 'EMP-' || TO_CHAR(p_employee_id) || '_' || v_type || '_' ||
           TO_CHAR(SYSTIMESTAMP, 'YYYYMMDDHH24MISSFF3') || '.' || v_ext;
  END;

  ---------------------------------------------------------------------------
  -- DEMOGRAPHICS UPSERT
  ---------------------------------------------------------------------------
  PROCEDURE upsert_demographics(
    p_enterprise_id        IN NUMBER,
    p_employee_id          IN NUMBER,
    p_gender_code          IN VARCHAR2,
    p_nationality          IN VARCHAR2,
    p_marital_status_code  IN VARCHAR2,
    p_religion_code        IN VARCHAR2,
    p_civil_id_number      IN VARCHAR2,
    p_passport_number      IN VARCHAR2,
    p_actor                IN VARCHAR2
  ) IS
    v_cnt NUMBER;
  BEGIN
    SELECT COUNT(*)
      INTO v_cnt
      FROM empl.demographics
     WHERE enterprise_id = p_enterprise_id
       AND employee_id   = p_employee_id;

    IF v_cnt > 0 THEN
      UPDATE empl.demographics
         SET gender_code         = CASE WHEN p_gender_code IS NULL OR TRIM(p_gender_code) IS NULL THEN gender_code ELSE TRIM(p_gender_code) END,
             nationality_code    = CASE WHEN p_nationality IS NULL OR TRIM(p_nationality) IS NULL THEN nationality_code ELSE TRIM(p_nationality) END,
             marital_status_code = CASE WHEN p_marital_status_code IS NULL OR TRIM(p_marital_status_code) IS NULL THEN marital_status_code ELSE NULLIF(TRIM(p_marital_status_code), '') END,
             religion_code       = CASE WHEN p_religion_code IS NULL OR TRIM(p_religion_code) IS NULL THEN religion_code ELSE NULLIF(TRIM(p_religion_code), '') END,
             civil_id_number     = CASE WHEN p_civil_id_number IS NULL OR TRIM(p_civil_id_number) IS NULL THEN civil_id_number ELSE NULLIF(TRIM(p_civil_id_number), '') END,
             passport_number     = CASE WHEN p_passport_number IS NULL OR TRIM(p_passport_number) IS NULL THEN passport_number ELSE NULLIF(TRIM(p_passport_number), '') END,
             last_updated_by     = p_actor,
             last_update_date    = SYSTIMESTAMP
       WHERE enterprise_id = p_enterprise_id
         AND employee_id   = p_employee_id;
    ELSE
      IF p_gender_code IS NULL OR TRIM(p_gender_code) IS NULL THEN RETURN; END IF;
      IF p_nationality IS NULL OR TRIM(p_nationality) IS NULL THEN RETURN; END IF;

      INSERT INTO empl.demographics (
        tenant_id,
        enterprise_id,
        employee_id,
        gender_code,
        nationality_code,
        marital_status_code,
        religion_code,
        civil_id_number,
        passport_number,
        status,
        is_active,
        created_by,
        creation_date,
        last_updated_by,
        last_update_date
      )
      VALUES (
        p_enterprise_id,
        p_enterprise_id,
        p_employee_id,
        TRIM(p_gender_code),
        TRIM(p_nationality),
        NULLIF(TRIM(p_marital_status_code), ''),
        NULLIF(TRIM(p_religion_code), ''),
        NULLIF(TRIM(p_civil_id_number), ''),
        NULLIF(TRIM(p_passport_number), ''),
        'ACTIVE',
        'Y',
        p_actor,
        SYSTIMESTAMP,
        p_actor,
        SYSTIMESTAMP
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE = g_user_error_code THEN RAISE; END IF;
      raise_generic('save demographics');
  END upsert_demographics;

  ---------------------------------------------------------------------------
  -- EMERGENCY UPSERT
  ---------------------------------------------------------------------------
  PROCEDURE upsert_emergency(
    p_enterprise_id  IN NUMBER,
    p_employee_id    IN NUMBER,
    p_contact_name   IN VARCHAR2,
    p_relationship   IN VARCHAR2,
    p_phone_number   IN VARCHAR2,
    p_email          IN VARCHAR2,
    p_address        IN VARCHAR2,
    p_actor          IN VARCHAR2
  ) IS
    v_cnt            NUMBER;
    v_phone          VARCHAR2(30);
    v_email          VARCHAR2(200);
    v_contact_name_n NVARCHAR2(300);
  BEGIN
    v_phone := normalize_phone(p_phone_number);

    v_email := CASE
                 WHEN p_email IS NULL OR TRIM(p_email) IS NULL THEN NULL
                 ELSE LOWER(TRIM(p_email))
               END;

    IF v_email IS NOT NULL AND NOT is_email_valid(v_email) THEN
      raise_err('Emergency contact email is invalid.');
    END IF;

    v_contact_name_n := CASE
                          WHEN p_contact_name IS NULL OR TRIM(p_contact_name) IS NULL THEN NULL
                          ELSE TRIM(TO_NCHAR(p_contact_name))
                        END;

    SELECT COUNT(*)
      INTO v_cnt
      FROM empl.emergency_contacts
     WHERE enterprise_id = p_enterprise_id
       AND employee_id   = p_employee_id
       AND is_active     = 'Y';

    IF v_cnt > 0 THEN
      UPDATE empl.emergency_contacts
         SET contact_name      = CASE WHEN v_contact_name_n IS NULL THEN contact_name ELSE v_contact_name_n END,
             relationship_code = CASE WHEN p_relationship IS NULL OR TRIM(p_relationship) IS NULL THEN relationship_code ELSE TRIM(p_relationship) END,
             phone_number      = CASE WHEN v_phone IS NULL THEN phone_number ELSE v_phone END,
             email             = CASE WHEN v_email IS NULL THEN email ELSE v_email END,
             address           = CASE WHEN p_address IS NULL OR TRIM(p_address) IS NULL THEN address ELSE NULLIF(TRIM(p_address), '') END,
             last_updated_by   = p_actor,
             last_update_date  = SYSTIMESTAMP
       WHERE enterprise_id = p_enterprise_id
         AND employee_id   = p_employee_id
         AND is_active     = 'Y';
    ELSE
      IF v_contact_name_n IS NULL THEN RETURN; END IF;
      IF p_relationship IS NULL OR TRIM(p_relationship) IS NULL THEN RETURN; END IF;
      IF v_phone IS NULL THEN RETURN; END IF;

      INSERT INTO empl.emergency_contacts (
        tenant_id,
        enterprise_id,
        employee_id,
        contact_name,
        relationship_code,
        phone_number,
        email,
        address,
        status,
        is_active,
        created_by,
        creation_date,
        last_updated_by,
        last_update_date
      )
      VALUES (
        p_enterprise_id,
        p_enterprise_id,
        p_employee_id,
        v_contact_name_n,
        TRIM(p_relationship),
        v_phone,
        v_email,
        NULLIF(TRIM(p_address), ''),
        'ACTIVE',
        'Y',
        p_actor,
        SYSTIMESTAMP,
        p_actor,
        SYSTIMESTAMP
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE = g_user_error_code THEN RAISE; END IF;
      raise_generic('save emergency contact');
  END upsert_emergency;

  ---------------------------------------------------------------------------
  -- BANK UPSERT
  ---------------------------------------------------------------------------
  PROCEDURE upsert_bank(
    p_enterprise_id   IN NUMBER,
    p_employee_id     IN NUMBER,
    p_bank_code       IN VARCHAR2,
    p_bank_name       IN VARCHAR2,
    p_account_number  IN VARCHAR2,
    p_iban            IN VARCHAR2,
    p_actor           IN VARCHAR2
  ) IS
    v_has_primary NUMBER;
  BEGIN
    IF p_bank_code IS NULL
       AND p_bank_name IS NULL
       AND p_account_number IS NULL
       AND p_iban IS NULL THEN
      RETURN;
    END IF;

    SELECT COUNT(*)
      INTO v_has_primary
      FROM empl.bank_accounts
     WHERE enterprise_id = p_enterprise_id
       AND employee_id   = p_employee_id
       AND is_primary    = 'Y'
       AND is_active     = 'Y';

    IF v_has_primary > 0 THEN
      UPDATE empl.bank_accounts
         SET bank_code        = CASE WHEN p_bank_code IS NULL OR TRIM(p_bank_code) IS NULL THEN bank_code ELSE TRIM(p_bank_code) END,
             bank_name        = CASE WHEN p_bank_name IS NULL OR TRIM(p_bank_name) IS NULL THEN bank_name ELSE NULLIF(TRIM(p_bank_name), '') END,
             account_number   = CASE WHEN p_account_number IS NULL OR TRIM(p_account_number) IS NULL THEN account_number ELSE TRIM(p_account_number) END,
             iban             = CASE WHEN p_iban IS NULL OR TRIM(p_iban) IS NULL THEN iban ELSE NULLIF(TRIM(p_iban), '') END,
             last_updated_by  = p_actor,
             last_update_date = SYSTIMESTAMP
       WHERE enterprise_id = p_enterprise_id
         AND employee_id   = p_employee_id
         AND is_primary    = 'Y'
         AND is_active     = 'Y';
      RETURN;
    END IF;

    IF p_bank_code IS NULL OR TRIM(p_bank_code) IS NULL THEN RETURN; END IF;
    IF p_bank_name IS NULL OR TRIM(p_bank_name) IS NULL THEN RETURN; END IF;
    IF p_account_number IS NULL OR TRIM(p_account_number) IS NULL THEN RETURN; END IF;

    UPDATE empl.bank_accounts
       SET is_primary       = 'N',
           last_updated_by  = p_actor,
           last_update_date = SYSTIMESTAMP
     WHERE enterprise_id = p_enterprise_id
       AND employee_id   = p_employee_id
       AND is_primary    = 'Y';

    INSERT INTO empl.bank_accounts (
      enterprise_id,
      employee_id,
      bank_code,
      bank_name,
      account_number,
      iban,
      is_primary,
      status,
      is_active,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    VALUES (
      p_enterprise_id,
      p_employee_id,
      TRIM(p_bank_code),
      TRIM(p_bank_name),
      TRIM(p_account_number),
      NULLIF(TRIM(p_iban), ''),
      'Y',
      'ACTIVE',
      'Y',
      p_actor,
      SYSTIMESTAMP,
      p_actor,
      SYSTIMESTAMP
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE = g_user_error_code THEN RAISE; END IF;
      raise_generic('save bank account');
  END upsert_bank;

  ---------------------------------------------------------------------------
  -- ASSIGNMENT UPDATE - SCD2, same pattern as create package
  -- Close existing active row and insert a new active row.
  ---------------------------------------------------------------------------
  PROCEDURE upsert_assignment_optional(
    p_enterprise_id         IN NUMBER,
    p_employee_id           IN NUMBER,
    p_org_unit_id           IN RAW,
    p_work_location_id      IN NUMBER,
    p_position_id           IN RAW,
    p_job_family_id         IN NUMBER,
    p_job_level_id          IN NUMBER,
    p_grade_id              IN NUMBER,
    p_enterprise_hire_date  IN DATE,
    p_contract_type_code    IN VARCHAR2,
    p_probation_days        IN NUMBER,
    p_reporting_to_emp_id   IN NUMBER,
    p_employment_status     IN VARCHAR2,
    p_asg_start             IN DATE,
    p_asg_end               IN DATE,
    p_actor                 IN VARCHAR2
  ) IS
    v_has_input             BOOLEAN := FALSE;
    v_cnt                   NUMBER;
    v_start                 DATE;
    v_end                   DATE;

    v_cur_assignment_id     NUMBER;
    v_employee_number       VARCHAR2(100);
    v_org_unit_id           RAW(16);
    v_work_location_id      NUMBER;
    v_position_id           RAW(16);
    v_job_family_id         NUMBER;
    v_job_level_id          NUMBER;
    v_grade_id              NUMBER;
    v_enterprise_hire_date  DATE;
    v_contract_type_code    VARCHAR2(100);
    v_probation_days        NUMBER;
    v_reporting_to_emp_id   NUMBER;
    v_employment_status     VARCHAR2(100);
  BEGIN
    IF p_org_unit_id IS NOT NULL
       OR p_work_location_id IS NOT NULL
       OR p_position_id IS NOT NULL
       OR p_job_family_id IS NOT NULL
       OR p_job_level_id IS NOT NULL
       OR p_grade_id IS NOT NULL
       OR p_enterprise_hire_date IS NOT NULL
       OR p_contract_type_code IS NOT NULL
       OR p_probation_days IS NOT NULL
       OR p_reporting_to_emp_id IS NOT NULL
       OR p_employment_status IS NOT NULL THEN
      v_has_input := TRUE;
    END IF;

    IF NOT v_has_input THEN
      RETURN;
    END IF;

    v_start := TRUNC(NVL(p_asg_start, SYSDATE));
    v_end   := TRUNC(NVL(p_asg_end, DATE '4712-12-31'));

    IF v_start > v_end THEN
      raise_err('Assignment start date cannot be after assignment end date.');
    END IF;

    BEGIN
      SELECT assignment_id
        INTO v_cur_assignment_id
        FROM (
              SELECT a.assignment_id
                FROM empl.assignments a
               WHERE a.enterprise_id = p_enterprise_id
                 AND a.employee_id   = p_employee_id
                 AND a.is_active     = 'Y'
               ORDER BY a.effective_start_date DESC,
                        a.assignment_id DESC
             )
       WHERE ROWNUM = 1;

      SELECT assignment_id,
             employee_number,
             org_unit_id,
             work_location_id,
             position_id,
             job_family_id,
             job_level_id,
             grade_id,
             enterprise_hire_date,
             contract_type_code,
             probation_days,
             reporting_to_emp_id,
             employment_status
        INTO v_cur_assignment_id,
             v_employee_number,
             v_org_unit_id,
             v_work_location_id,
             v_position_id,
             v_job_family_id,
             v_job_level_id,
             v_grade_id,
             v_enterprise_hire_date,
             v_contract_type_code,
             v_probation_days,
             v_reporting_to_emp_id,
             v_employment_status
        FROM empl.assignments
       WHERE assignment_id = v_cur_assignment_id
       FOR UPDATE;

    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_cur_assignment_id    := NULL;
        v_employee_number      := 'EMP-' || TO_CHAR(p_employee_id);
        v_org_unit_id          := p_org_unit_id;
        v_work_location_id     := p_work_location_id;
        v_position_id          := p_position_id;
        v_job_family_id        := p_job_family_id;
        v_job_level_id         := p_job_level_id;
        v_grade_id             := p_grade_id;
        v_enterprise_hire_date := p_enterprise_hire_date;
        v_contract_type_code   := p_contract_type_code;
        v_probation_days       := p_probation_days;
        v_reporting_to_emp_id  := p_reporting_to_emp_id;
        v_employment_status    := p_employment_status;
    END;

    v_employee_number      := NVL(NULLIF(TRIM(v_employee_number), ''), 'EMP-' || TO_CHAR(p_employee_id));
    v_org_unit_id          := NVL(p_org_unit_id, v_org_unit_id);
    v_work_location_id     := NVL(p_work_location_id, v_work_location_id);
    v_position_id          := NVL(p_position_id, v_position_id);
    v_job_family_id        := NVL(p_job_family_id, v_job_family_id);
    v_job_level_id         := NVL(p_job_level_id, v_job_level_id);
    v_grade_id             := NVL(p_grade_id, v_grade_id);
    v_enterprise_hire_date := NVL(p_enterprise_hire_date, v_enterprise_hire_date);
    v_contract_type_code   := CASE
                                WHEN p_contract_type_code IS NULL OR TRIM(p_contract_type_code) IS NULL THEN v_contract_type_code
                                ELSE TRIM(p_contract_type_code)
                              END;
    v_probation_days       := NVL(p_probation_days, v_probation_days);
    v_reporting_to_emp_id  := NVL(p_reporting_to_emp_id, v_reporting_to_emp_id);
    v_employment_status    := CASE
                                WHEN p_employment_status IS NULL OR TRIM(p_employment_status) IS NULL THEN v_employment_status
                                ELSE TRIM(p_employment_status)
                              END;

    IF v_org_unit_id IS NULL THEN raise_err('Organization unit is required for assignment update.'); END IF;
    IF v_enterprise_hire_date IS NULL THEN raise_err('Enterprise hire date is required for assignment update.'); END IF;
    IF v_contract_type_code IS NULL OR TRIM(v_contract_type_code) IS NULL THEN raise_err('Contract type is required for assignment update.'); END IF;
    IF v_employment_status IS NULL OR TRIM(v_employment_status) IS NULL THEN raise_err('Employment status is required for assignment update.'); END IF;

    IF v_start < TRUNC(v_enterprise_hire_date) THEN
      raise_err('Assignment start date cannot be before employee enterprise hire date.');
    END IF;

    IF v_reporting_to_emp_id IS NOT NULL THEN
      IF v_reporting_to_emp_id = p_employee_id THEN
        raise_err('Reporting manager cannot be the same as employee.');
      END IF;

      SELECT COUNT(*)
        INTO v_cnt
        FROM empl.employees
       WHERE enterprise_id = p_enterprise_id
         AND employee_id   = v_reporting_to_emp_id;

      IF v_cnt = 0 THEN
        raise_err('Reporting manager was not found for this enterprise.');
      END IF;
    END IF;

    /*
       If assignment already exists for the same start date, update that row
       instead of raising duplicate assignment error.
       This allows update flow to keep the previous/as-is assignment date.
    */
    BEGIN
      SELECT assignment_id
        INTO v_cur_assignment_id
        FROM (
              SELECT a.assignment_id
                FROM empl.assignments a
               WHERE a.enterprise_id = p_enterprise_id
                 AND a.employee_id   = p_employee_id
                 AND TRUNC(a.effective_start_date) = v_start
               ORDER BY a.assignment_id DESC
             )
       WHERE ROWNUM = 1;

      UPDATE empl.assignments
         SET org_unit_id           = v_org_unit_id,
             work_location_id      = v_work_location_id,
             position_id           = v_position_id,
             job_family_id         = v_job_family_id,
             job_level_id          = v_job_level_id,
             grade_id              = v_grade_id,
             enterprise_hire_date  = TRUNC(v_enterprise_hire_date),
             contract_type_code    = TRIM(v_contract_type_code),
             probation_days        = v_probation_days,
             reporting_to_emp_id   = v_reporting_to_emp_id,
             employment_status     = TRIM(v_employment_status),
             effective_end_date    = v_end,
             status                = 'ACTIVE',
             is_active             = 'Y',
             last_updated_by       = p_actor,
             last_update_date      = SYSTIMESTAMP
       WHERE assignment_id = v_cur_assignment_id;

      RETURN;

    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        NULL;
    END;

    IF v_cur_assignment_id IS NOT NULL THEN
      UPDATE empl.assignments
         SET effective_end_date = v_start - 1,
             status             = 'COMPLETED',
             is_active          = 'N',
             last_updated_by    = p_actor,
             last_update_date   = SYSTIMESTAMP
       WHERE assignment_id = v_cur_assignment_id;
    END IF;

    SELECT COUNT(*)
      INTO v_cnt
      FROM empl.assignments
     WHERE enterprise_id = p_enterprise_id
       AND employee_id   = p_employee_id
       AND is_active     = 'Y'
       AND NVL(effective_end_date, DATE '4712-12-31') >= v_start
       AND v_end >= effective_start_date;

    IF v_cnt > 0 THEN
      raise_err('Employee already has an active assignment in this date range.');
    END IF;

    INSERT INTO empl.assignments (
      assignment_guid,
      enterprise_id,
      employee_id,
      org_unit_id,
      work_location_id,
      employee_number,
      position_id,
      job_family_id,
      job_level_id,
      grade_id,
      enterprise_hire_date,
      contract_type_code,
      probation_days,
      reporting_to_emp_id,
      employment_status,
      effective_start_date,
      effective_end_date,
      status,
      is_active,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    VALUES (
      SYS_GUID(),
      p_enterprise_id,
      p_employee_id,
      v_org_unit_id,
      v_work_location_id,
      v_employee_number,
      v_position_id,
      v_job_family_id,
      v_job_level_id,
      v_grade_id,
      TRUNC(v_enterprise_hire_date),
      TRIM(v_contract_type_code),
      v_probation_days,
      v_reporting_to_emp_id,
      TRIM(v_employment_status),
      v_start,
      v_end,
      'ACTIVE',
      'Y',
      p_actor,
      SYSTIMESTAMP,
      p_actor,
      SYSTIMESTAMP
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE = g_user_error_code THEN RAISE; END IF;
      raise_generic('update employee assignment');
  END upsert_assignment_optional;

  ---------------------------------------------------------------------------
  -- ADDRESS UPSERT OPTIONAL
  ---------------------------------------------------------------------------
  PROCEDURE upsert_address_optional(
    p_enterprise_id   IN NUMBER,
    p_employee_id     IN NUMBER,
    p_address_line1   IN VARCHAR2,
    p_address_line2   IN VARCHAR2,
    p_city            IN VARCHAR2,
    p_area            IN VARCHAR2,
    p_country_code    IN VARCHAR2,
    p_actor           IN VARCHAR2
  ) IS
    v_has_input BOOLEAN := FALSE;
    v_cnt       NUMBER;
    v_line1_n   NVARCHAR2(400);
    v_line2_n   NVARCHAR2(400);
    v_city_n    NVARCHAR2(200);
    v_area_n    NVARCHAR2(200);
  BEGIN
    IF p_address_line1 IS NOT NULL
       OR p_address_line2 IS NOT NULL
       OR p_city IS NOT NULL
       OR p_area IS NOT NULL
       OR p_country_code IS NOT NULL THEN
      v_has_input := TRUE;
    END IF;

    IF NOT v_has_input THEN
      RETURN;
    END IF;

    v_line1_n := CASE WHEN p_address_line1 IS NULL OR TRIM(p_address_line1) IS NULL THEN NULL ELSE TRIM(TO_NCHAR(p_address_line1)) END;
    v_line2_n := CASE WHEN p_address_line2 IS NULL THEN NULL ELSE NULLIF(TRIM(TO_NCHAR(p_address_line2)), TO_NCHAR('')) END;
    v_city_n  := CASE WHEN p_city IS NULL OR TRIM(p_city) IS NULL THEN NULL ELSE TRIM(TO_NCHAR(p_city)) END;
    v_area_n  := CASE WHEN p_area IS NULL THEN NULL ELSE NULLIF(TRIM(TO_NCHAR(p_area)), TO_NCHAR('')) END;

    SELECT COUNT(*)
      INTO v_cnt
      FROM empl.addresses
     WHERE enterprise_id = p_enterprise_id
       AND employee_id   = p_employee_id
       AND is_primary    = 'Y'
       AND is_active     = 'Y';

    IF v_cnt > 0 THEN
      UPDATE empl.addresses
         SET address_line1    = CASE WHEN v_line1_n IS NULL THEN address_line1 ELSE v_line1_n END,
             address_line2    = CASE WHEN v_line2_n IS NULL THEN address_line2 ELSE v_line2_n END,
             city             = CASE WHEN v_city_n  IS NULL THEN city ELSE v_city_n END,
             area             = CASE WHEN v_area_n  IS NULL THEN area ELSE v_area_n END,
             country_code     = CASE WHEN p_country_code IS NULL OR TRIM(p_country_code) IS NULL THEN country_code ELSE TRIM(p_country_code) END,
             last_updated_by  = p_actor,
             last_update_date = SYSTIMESTAMP
       WHERE enterprise_id = p_enterprise_id
         AND employee_id   = p_employee_id
         AND is_primary    = 'Y'
         AND is_active     = 'Y';
      RETURN;
    END IF;

    IF v_line1_n IS NULL THEN RETURN; END IF;
    IF v_city_n IS NULL THEN RETURN; END IF;
    IF p_country_code IS NULL OR TRIM(p_country_code) IS NULL THEN RETURN; END IF;

    INSERT INTO empl.addresses (
      enterprise_id,
      employee_id,
      address_line1,
      address_line2,
      city,
      area,
      country_code,
      is_primary,
      status,
      is_active,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    VALUES (
      p_enterprise_id,
      p_employee_id,
      v_line1_n,
      v_line2_n,
      v_city_n,
      v_area_n,
      TRIM(p_country_code),
      'Y',
      'ACTIVE',
      'Y',
      p_actor,
      SYSTIMESTAMP,
      p_actor,
      SYSTIMESTAMP
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE = g_user_error_code THEN RAISE; END IF;
      raise_generic('save address');
  END upsert_address_optional;

  ---------------------------------------------------------------------------
  -- Helper: deactivate active docs by type
  ---------------------------------------------------------------------------
  PROCEDURE deactivate_docs_by_type(
    p_enterprise_id       IN NUMBER,
    p_employee_id         IN NUMBER,
    p_document_type_code  IN VARCHAR2,
    p_actor               IN VARCHAR2
  ) IS
  BEGIN
    UPDATE empl.documents
       SET status           = 'REPLACED',
           is_active        = 'N',
           last_updated_by  = p_actor,
           last_update_date = SYSTIMESTAMP
     WHERE enterprise_id      = p_enterprise_id
       AND employee_id        = p_employee_id
       AND document_type_code = TRIM(p_document_type_code)
       AND is_active          = 'Y';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE = g_user_error_code THEN RAISE; END IF;
      raise_generic('replace document');
  END deactivate_docs_by_type;

  ---------------------------------------------------------------------------
  -- MAIN PROCEDURE
  ---------------------------------------------------------------------------
  PROCEDURE UPDATE_EMPLOYEE_ALL_IN_ONE (
    p_enterprise_id     IN NUMBER,
    p_employee_id       IN NUMBER,
    p_first_name_en        IN VARCHAR2,
    p_middle_name_en       IN VARCHAR2,
    p_last_name_en         IN VARCHAR2,
    p_fourth_name_en       IN VARCHAR2,
    p_first_name_ar        IN NVARCHAR2,
    p_middle_name_ar       IN NVARCHAR2,
    p_last_name_ar         IN NVARCHAR2,
    p_fourth_name_ar       IN NVARCHAR2,
    p_email                IN VARCHAR2,
    p_phone_number         IN VARCHAR2,
    p_mobile_number        IN VARCHAR2,
    p_date_of_birth        IN DATE,
    p_employee_status      IN VARCHAR2,
    p_employee_is_active   IN CHAR,
    p_gender_code          IN VARCHAR2,
    p_nationality          IN VARCHAR2,
    p_marital_status_code  IN VARCHAR2,
    p_religion_code        IN VARCHAR2,
    p_civil_id_number      IN VARCHAR2,
    p_passport_number      IN VARCHAR2,
    p_contact_name      IN VARCHAR2,
    p_relationship      IN VARCHAR2,
    p_emerg_phone       IN VARCHAR2,
    p_emerg_email       IN VARCHAR2,
    p_emerg_address     IN VARCHAR2,
    p_work_schedule_id  IN NUMBER,
    p_ws_start          IN DATE,
    p_ws_end            IN DATE,
    p_civil_id_expiry    IN DATE,
    p_passport_expiry    IN DATE,
    p_visa_number        IN VARCHAR2,
    p_visa_expiry        IN DATE,
    p_work_permit_number IN VARCHAR2,
    p_work_permit_expiry IN DATE,
    p_bank_code         IN VARCHAR2,
    p_bank_name         IN VARCHAR2,
    p_account_number    IN VARCHAR2,
    p_iban              IN VARCHAR2,
    p_org_unit_id            IN RAW,
    p_work_location_id       IN NUMBER,
    p_position_id            IN RAW,
    p_job_family_id          IN NUMBER,
    p_job_level_id           IN NUMBER,
    p_grade_id               IN NUMBER,
    p_enterprise_hire_date   IN DATE,
    p_contract_type_code     IN VARCHAR2,
    p_probation_days         IN NUMBER,
    p_reporting_to_emp_id    IN NUMBER,
    p_employment_status      IN VARCHAR2,
    p_asg_start              IN DATE,
    p_asg_end                IN DATE,
    p_address_line1     IN VARCHAR2,
    p_address_line2     IN VARCHAR2,
    p_city              IN VARCHAR2,
    p_area              IN VARCHAR2,
    p_country_code      IN VARCHAR2,
    p_document_type_code  IN VARCHAR2,
    p_doc_file_name       IN VARCHAR2,
    p_doc_mime_type       IN VARCHAR2,
    p_doc_access_url      IN VARCHAR2,
    p_doc_hash_sha256     IN VARCHAR2,
    p_doc_file_content    IN BLOB,
    p_doc_action          IN VARCHAR2,
    p_replace_document_id IN NUMBER,
    p_actor             IN VARCHAR2,
    o_document_id       OUT NUMBER,
    o_document_guid     OUT RAW
  ) IS
    v_actor           VARCHAR2(100);
    v_cnt             NUMBER;
    v_new_email       VARCHAR2(200);
    v_phone           VARCHAR2(30);
    v_mobile          VARCHAR2(30);
    v_emp_status      VARCHAR2(30);
    v_emp_active      CHAR(1);
    v_doc_action      VARCHAR2(20);
    v_existing_guid   RAW(16);
    v_doc_type        VARCHAR2(100);
    v_doc_name        VARCHAR2(512);
    v_doc_url         VARCHAR2(4000);
    v_doc_mime        VARCHAR2(200);
    v_doc_hash        VARCHAR2(256);
    v_has_doc_input   BOOLEAN := FALSE;
  BEGIN
    o_document_id   := NULL;
    o_document_guid := NULL;

    IF p_enterprise_id IS NULL THEN raise_err('Enterprise is required.'); END IF;
    IF p_employee_id IS NULL THEN raise_err('Employee is required.'); END IF;

    v_actor := NVL(NULLIF(TRIM(p_actor), ''), SYS_CONTEXT('USERENV', 'SESSION_USER'));

    IF NOT employee_exists(p_enterprise_id, p_employee_id) THEN
      raise_err('Employee was not found for this enterprise.');
    END IF;

    assert_emp_status(p_employee_status);
    assert_is_active(p_employee_is_active);

    v_emp_status := CASE
                      WHEN p_employee_status IS NULL OR TRIM(p_employee_status) IS NULL THEN NULL
                      ELSE UPPER(TRIM(p_employee_status))
                    END;

    v_emp_active := CASE
                      WHEN p_employee_is_active IS NULL OR TRIM(p_employee_is_active) IS NULL THEN NULL
                      ELSE UPPER(TRIM(p_employee_is_active))
                    END;

    v_doc_action := UPPER(TRIM(NVL(p_doc_action, 'ADD')));

    IF v_doc_action NOT IN ('ADD','REPLACE') THEN
      raise_err('Document action must be Add or Replace.');
    END IF;

    v_new_email := CASE
                     WHEN p_email IS NULL OR TRIM(p_email) IS NULL THEN NULL
                     ELSE LOWER(TRIM(p_email))
                   END;

    IF v_new_email IS NOT NULL THEN
      IF NOT is_email_valid(v_new_email) THEN
        raise_err('Email address is invalid.');
      END IF;

      SELECT COUNT(*)
        INTO v_cnt
        FROM empl.employees
       WHERE enterprise_id = p_enterprise_id
         AND LOWER(email) = v_new_email
         AND employee_id <> p_employee_id;

      IF v_cnt > 0 THEN
        raise_err('Email already exists for this enterprise.');
      END IF;
    END IF;

    v_phone  := normalize_phone(p_phone_number);
    v_mobile := normalize_phone(p_mobile_number);

    UPDATE empl.employees
       SET first_name_en    = CASE WHEN p_first_name_en IS NULL OR TRIM(p_first_name_en) IS NULL THEN first_name_en ELSE TRIM(p_first_name_en) END,
           middle_name_en   = CASE WHEN p_middle_name_en IS NULL THEN middle_name_en ELSE NULLIF(TRIM(p_middle_name_en), '') END,
           last_name_en     = CASE WHEN p_last_name_en IS NULL OR TRIM(p_last_name_en) IS NULL THEN last_name_en ELSE TRIM(p_last_name_en) END,
           fourth_name_en   = CASE WHEN p_fourth_name_en IS NULL THEN fourth_name_en ELSE NULLIF(TRIM(p_fourth_name_en), '') END,
           phone_number     = CASE WHEN v_phone IS NULL THEN phone_number ELSE v_phone END,
           mobile_number    = CASE WHEN v_mobile IS NULL THEN mobile_number ELSE v_mobile END,
           date_of_birth    = CASE WHEN p_date_of_birth IS NULL THEN date_of_birth ELSE p_date_of_birth END,
           status           = CASE WHEN v_emp_status IS NULL THEN status ELSE v_emp_status END,
           is_active        = CASE WHEN v_emp_active IS NULL THEN is_active ELSE v_emp_active END,
           last_updated_by  = v_actor,
           last_update_date = SYSTIMESTAMP
     WHERE enterprise_id = p_enterprise_id
       AND employee_id   = p_employee_id;

    IF v_new_email IS NOT NULL THEN
      UPDATE empl.employees
         SET email            = v_new_email,
             last_updated_by  = v_actor,
             last_update_date = SYSTIMESTAMP
       WHERE enterprise_id = p_enterprise_id
         AND employee_id   = p_employee_id;
    END IF;

    IF p_first_name_ar IS NOT NULL THEN
      UPDATE empl.employees
         SET first_name_ar    = p_first_name_ar,
             last_updated_by  = v_actor,
             last_update_date = SYSTIMESTAMP
       WHERE enterprise_id = p_enterprise_id
         AND employee_id   = p_employee_id;
    END IF;

    IF p_middle_name_ar IS NOT NULL THEN
      UPDATE empl.employees
         SET middle_name_ar   = p_middle_name_ar,
             last_updated_by  = v_actor,
             last_update_date = SYSTIMESTAMP
       WHERE enterprise_id = p_enterprise_id
         AND employee_id   = p_employee_id;
    END IF;

    IF p_last_name_ar IS NOT NULL THEN
      UPDATE empl.employees
         SET last_name_ar     = p_last_name_ar,
             last_updated_by  = v_actor,
             last_update_date = SYSTIMESTAMP
       WHERE enterprise_id = p_enterprise_id
         AND employee_id   = p_employee_id;
    END IF;

    IF p_fourth_name_ar IS NOT NULL THEN
      UPDATE empl.employees
         SET fourth_name_ar   = p_fourth_name_ar,
             last_updated_by  = v_actor,
             last_update_date = SYSTIMESTAMP
       WHERE enterprise_id = p_enterprise_id
         AND employee_id   = p_employee_id;
    END IF;

    IF p_gender_code IS NOT NULL OR p_nationality IS NOT NULL OR p_marital_status_code IS NOT NULL OR
       p_religion_code IS NOT NULL OR p_civil_id_number IS NOT NULL OR p_passport_number IS NOT NULL THEN
      upsert_demographics(
        p_enterprise_id,
        p_employee_id,
        p_gender_code,
        p_nationality,
        p_marital_status_code,
        p_religion_code,
        p_civil_id_number,
        p_passport_number,
        v_actor
      );
    END IF;

    IF p_contact_name IS NOT NULL OR p_relationship IS NOT NULL OR p_emerg_phone IS NOT NULL OR
       p_emerg_email IS NOT NULL OR p_emerg_address IS NOT NULL THEN
      upsert_emergency(
        p_enterprise_id,
        p_employee_id,
        p_contact_name,
        p_relationship,
        p_emerg_phone,
        p_emerg_email,
        p_emerg_address,
        v_actor
      );
    END IF;

    IF p_work_schedule_id IS NOT NULL THEN
      empl.empl_employee_create_api_pkg.upsert_employee_schedule(
        p_employee_id      => p_employee_id,
        p_work_schedule_id => p_work_schedule_id,
        p_effective_start  => p_ws_start,
        p_effective_end    => p_ws_end,
        p_actor            => v_actor,
        o_emp_sch_id       => v_cnt,
        o_emp_sch_guid     => v_existing_guid
      );
    END IF;
IF p_civil_id_expiry IS NOT NULL OR p_passport_expiry IS NOT NULL OR p_visa_number IS NOT NULL OR
       p_visa_expiry IS NOT NULL OR p_work_permit_number IS NOT NULL OR p_work_permit_expiry IS NOT NULL THEN
      empl.empl_employee_create_api_pkg.upsert_document_compliance(
        p_employee_id        => p_employee_id,
        p_civil_id_expiry    => p_civil_id_expiry,
        p_passport_expiry    => p_passport_expiry,
        p_visa_number        => p_visa_number,
        p_visa_expiry        => p_visa_expiry,
        p_work_permit_number => p_work_permit_number,
        p_work_permit_expiry => p_work_permit_expiry,
        p_actor              => v_actor,
        o_doc_comp_id        => v_cnt,
        o_doc_comp_guid      => v_existing_guid
      );
    END IF;

    upsert_bank(
      p_enterprise_id,
      p_employee_id,
      p_bank_code,
      p_bank_name,
      p_account_number,
      p_iban,
      v_actor
    );

    upsert_assignment_optional(
      p_enterprise_id,
      p_employee_id,
      p_org_unit_id,
      p_work_location_id,
      p_position_id,
      p_job_family_id,
      p_job_level_id,
      p_grade_id,
      p_enterprise_hire_date,
      p_contract_type_code,
      p_probation_days,
      p_reporting_to_emp_id,
      p_employment_status,
      p_asg_start,
      p_asg_end,
      v_actor
    );

    upsert_address_optional(
      p_enterprise_id,
      p_employee_id,
      p_address_line1,
      p_address_line2,
      p_city,
      p_area,
      p_country_code,
      v_actor
    );

    -----------------------------------------------------------------------
    -- DOCUMENT - optional add/replace
    -----------------------------------------------------------------------
    v_doc_type := CASE
                    WHEN p_document_type_code IS NULL OR TRIM(p_document_type_code) IS NULL THEN NULL
                    ELSE TRIM(p_document_type_code)
                  END;

    v_doc_mime := CASE
                    WHEN p_doc_mime_type IS NULL OR TRIM(p_doc_mime_type) IS NULL THEN NULL
                    ELSE TRIM(p_doc_mime_type)
                  END;

    v_doc_hash := CASE
                    WHEN p_doc_hash_sha256 IS NULL OR TRIM(p_doc_hash_sha256) IS NULL THEN NULL
                    ELSE TRIM(p_doc_hash_sha256)
                  END;

    v_doc_url := CASE
                   WHEN p_doc_access_url IS NULL OR TRIM(p_doc_access_url) IS NULL THEN NULL
                   ELSE TRIM(p_doc_access_url)
                 END;

    v_doc_name := CASE
                    WHEN p_doc_file_name IS NULL OR TRIM(p_doc_file_name) IS NULL THEN NULL
                    ELSE TRIM(p_doc_file_name)
                  END;

    IF v_doc_type IS NOT NULL THEN
      IF p_replace_document_id IS NOT NULL OR
         p_doc_file_content IS NOT NULL OR
         v_doc_url IS NOT NULL OR
         v_doc_name IS NOT NULL OR
         v_doc_mime IS NOT NULL OR
         v_doc_hash IS NOT NULL THEN
        v_has_doc_input := TRUE;
      END IF;
    END IF;

    IF v_has_doc_input THEN
      IF v_doc_name IS NULL AND (p_doc_file_content IS NOT NULL OR v_doc_url IS NOT NULL) THEN
        v_doc_name := default_doc_file_name(p_employee_id, v_doc_type, v_doc_mime);
      END IF;

      IF v_doc_action = 'REPLACE' AND p_replace_document_id IS NOT NULL THEN
        BEGIN
          SELECT document_guid
            INTO o_document_guid
            FROM empl.documents
           WHERE enterprise_id = p_enterprise_id
             AND employee_id   = p_employee_id
             AND document_id   = p_replace_document_id
           FOR UPDATE;
        EXCEPTION
          WHEN NO_DATA_FOUND THEN
            raise_err('Document to replace was not found.');
        END;

        UPDATE empl.documents
           SET document_type_code = v_doc_type,
               file_name          = CASE WHEN v_doc_name IS NULL THEN file_name ELSE v_doc_name END,
               mime_type          = CASE WHEN v_doc_mime IS NULL THEN mime_type ELSE v_doc_mime END,
               access_url         = CASE
                                      WHEN p_doc_file_content IS NOT NULL THEN NULL
                                      WHEN v_doc_url IS NOT NULL THEN v_doc_url
                                      ELSE access_url
                                    END,
               file_content       = CASE
                                      WHEN p_doc_file_content IS NOT NULL THEN p_doc_file_content
                                      WHEN v_doc_url IS NOT NULL THEN NULL
                                      ELSE file_content
                                    END,
               file_hash_sha256   = CASE WHEN v_doc_hash IS NULL THEN file_hash_sha256 ELSE v_doc_hash END,
               status             = 'UPLOADED',
               is_active          = 'Y',
               last_updated_by    = v_actor,
               last_update_date   = SYSTIMESTAMP
         WHERE enterprise_id = p_enterprise_id
           AND employee_id   = p_employee_id
           AND document_id   = p_replace_document_id;

        o_document_id := p_replace_document_id;
      ELSE
        IF v_doc_action = 'REPLACE' THEN
          deactivate_docs_by_type(
            p_enterprise_id      => p_enterprise_id,
            p_employee_id        => p_employee_id,
            p_document_type_code => v_doc_type,
            p_actor              => v_actor
          );
        END IF;

        IF p_doc_file_content IS NOT NULL THEN
          empl.empl_employee_create_api_pkg.insert_document(
            p_employee_id        => p_employee_id,
            p_document_type_code => v_doc_type,
            p_file_name          => v_doc_name,
            p_mime_type          => v_doc_mime,
            p_status             => 'UPLOADED',
            p_is_active          => 'Y',
            p_created_by         => v_actor,
            p_file_content       => p_doc_file_content,
            p_access_url         => NULL,
            p_file_hash_sha256   => v_doc_hash,
            o_document_id        => o_document_id,
            o_document_guid      => o_document_guid
          );
        ELSIF v_doc_url IS NOT NULL THEN
          empl.empl_employee_create_api_pkg.insert_document(
            p_employee_id        => p_employee_id,
            p_document_type_code => v_doc_type,
            p_file_name          => v_doc_name,
            p_mime_type          => v_doc_mime,
            p_status             => 'UPLOADED',
            p_is_active          => 'Y',
            p_created_by         => v_actor,
            p_file_content       => NULL,
            p_access_url         => v_doc_url,
            p_file_hash_sha256   => v_doc_hash,
            o_document_id        => o_document_id,
            o_document_guid      => o_document_guid
          );
        END IF;
      END IF;
    END IF;

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = g_user_error_code THEN
        RAISE;
      END IF;
      raise_generic('update employee');
  END UPDATE_EMPLOYEE_ALL_IN_ONE;


END EMPL_EMPLOYEE_UPDATE_API_PKG;
/
