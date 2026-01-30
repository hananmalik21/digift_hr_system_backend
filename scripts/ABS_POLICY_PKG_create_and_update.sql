-- =============================================================================
-- ABS_POLICY_PKG: CREATE and UPDATE procedures with all policy header fields
-- Run as schema owner (ABS). Table ABS_LEAVE_POLICIES must have:
--   POLICY_GUID, TENANT_ID, LEAVE_TYPE_ID, LEAVE_TYPE_EN, LEAVE_TYPE_AR,
--   POLICY_NAME, ENTITLEMENT_DAYS, ACCRUAL_METHOD_CODE, STATUS,
--   KUWAIT_LABOR_COMPLIANT, CREATED_BY, CREATED_DATE,
--   EFFECTIVE_START_DATE, EFFECTIVE_END_DATE, ENABLE_PRO_RATA
-- For UPDATE: LAST_UPDATED_BY (and optionally LAST_UPDATED_DATE if column exists).
-- =============================================================================

CREATE OR REPLACE PACKAGE ABS.ABS_POLICY_PKG AS
  PROCEDURE CREATE_POLICY_WITH_GRADES(
    p_tenant_id               IN NUMBER,
    p_leave_type_id            IN NUMBER,
    p_policy_name              IN VARCHAR2,
    p_entitlement_days         IN NUMBER,
    p_accrual_method_code      IN VARCHAR2,
    p_created_by               IN VARCHAR2,
    p_min_service_years        IN NUMBER   DEFAULT NULL,
    p_max_service_years        IN NUMBER   DEFAULT NULL,
    p_employee_category_code   IN VARCHAR2 DEFAULT NULL,
    p_employment_type_code     IN VARCHAR2 DEFAULT NULL,
    p_contract_type_code       IN VARCHAR2 DEFAULT NULL,
    p_gender_code              IN VARCHAR2 DEFAULT NULL,
    p_religion_code            IN VARCHAR2 DEFAULT NULL,
    p_marital_status_code      IN VARCHAR2 DEFAULT NULL,
    p_probation_allowed        IN VARCHAR2 DEFAULT NULL,
    p_min_notice_days          IN NUMBER   DEFAULT NULL,
    p_max_consecutive_days     IN NUMBER   DEFAULT NULL,
    p_requires_document        IN VARCHAR2 DEFAULT NULL,
    p_allow_carry_forward      IN VARCHAR2 DEFAULT NULL,
    p_allow_encashment         IN VARCHAR2 DEFAULT NULL,
    p_carry_forward_limit      IN NUMBER   DEFAULT NULL,
    p_grace_period_days        IN NUMBER   DEFAULT NULL,
    p_auto_forfeit_flag        IN VARCHAR2 DEFAULT NULL,
    p_notify_before_days       IN NUMBER   DEFAULT NULL,
    p_encashment_limit_days    IN NUMBER   DEFAULT NULL,
    p_encashment_rate_pct      IN NUMBER   DEFAULT NULL,
    p_grade_rows_json          IN CLOB,
    p_effective_start_date     IN DATE     DEFAULT NULL,
    p_effective_end_date       IN DATE     DEFAULT NULL,
    p_enable_pro_rata          IN VARCHAR2 DEFAULT 'N'
  );

  PROCEDURE UPDATE_POLICY_WITH_GRADES(
    p_tenant_id               IN NUMBER,
    p_policy_id                IN NUMBER,
    p_leave_type_id            IN NUMBER,
    p_policy_name              IN VARCHAR2,
    p_entitlement_days         IN NUMBER,
    p_accrual_method_code      IN VARCHAR2,
    p_policy_status            IN VARCHAR2,
    p_updated_by               IN VARCHAR2,
    p_min_service_years        IN NUMBER   DEFAULT NULL,
    p_max_service_years        IN NUMBER   DEFAULT NULL,
    p_employee_category_code   IN VARCHAR2 DEFAULT NULL,
    p_employment_type_code     IN VARCHAR2 DEFAULT NULL,
    p_contract_type_code       IN VARCHAR2 DEFAULT NULL,
    p_gender_code              IN VARCHAR2 DEFAULT NULL,
    p_religion_code            IN VARCHAR2 DEFAULT NULL,
    p_marital_status_code      IN VARCHAR2 DEFAULT NULL,
    p_probation_allowed        IN VARCHAR2 DEFAULT NULL,
    p_min_notice_days          IN NUMBER   DEFAULT NULL,
    p_max_consecutive_days     IN NUMBER   DEFAULT NULL,
    p_requires_document        IN VARCHAR2 DEFAULT NULL,
    p_allow_carry_forward      IN VARCHAR2 DEFAULT NULL,
    p_allow_encashment         IN VARCHAR2 DEFAULT NULL,
    p_carry_forward_limit      IN NUMBER   DEFAULT NULL,
    p_grace_period_days        IN NUMBER   DEFAULT NULL,
    p_auto_forfeit_flag        IN VARCHAR2 DEFAULT NULL,
    p_notify_before_days       IN NUMBER   DEFAULT NULL,
    p_encashment_limit_days    IN NUMBER   DEFAULT NULL,
    p_encashment_rate_pct      IN NUMBER   DEFAULT NULL,
    p_grade_rows_json          IN CLOB,
    p_effective_start_date     IN DATE     DEFAULT NULL,
    p_effective_end_date       IN DATE     DEFAULT NULL,
    p_enable_pro_rata          IN VARCHAR2 DEFAULT 'N'
  );
END ABS_POLICY_PKG;
/

CREATE OR REPLACE PACKAGE BODY ABS.ABS_POLICY_PKG AS
  PROCEDURE CREATE_POLICY_WITH_GRADES(
    p_tenant_id               IN NUMBER,
    p_leave_type_id            IN NUMBER,
    p_policy_name              IN VARCHAR2,
    p_entitlement_days         IN NUMBER,
    p_accrual_method_code      IN VARCHAR2,
    p_created_by               IN VARCHAR2,
    p_min_service_years        IN NUMBER   DEFAULT NULL,
    p_max_service_years        IN NUMBER   DEFAULT NULL,
    p_employee_category_code   IN VARCHAR2 DEFAULT NULL,
    p_employment_type_code     IN VARCHAR2 DEFAULT NULL,
    p_contract_type_code       IN VARCHAR2 DEFAULT NULL,
    p_gender_code              IN VARCHAR2 DEFAULT NULL,
    p_religion_code            IN VARCHAR2 DEFAULT NULL,
    p_marital_status_code      IN VARCHAR2 DEFAULT NULL,
    p_probation_allowed        IN VARCHAR2 DEFAULT NULL,
    p_min_notice_days          IN NUMBER   DEFAULT NULL,
    p_max_consecutive_days     IN NUMBER   DEFAULT NULL,
    p_requires_document        IN VARCHAR2 DEFAULT NULL,
    p_allow_carry_forward      IN VARCHAR2 DEFAULT NULL,
    p_allow_encashment         IN VARCHAR2 DEFAULT NULL,
    p_carry_forward_limit      IN NUMBER   DEFAULT NULL,
    p_grace_period_days        IN NUMBER   DEFAULT NULL,
    p_auto_forfeit_flag        IN VARCHAR2 DEFAULT NULL,
    p_notify_before_days       IN NUMBER   DEFAULT NULL,
    p_encashment_limit_days    IN NUMBER   DEFAULT NULL,
    p_encashment_rate_pct      IN NUMBER   DEFAULT NULL,
    p_grade_rows_json          IN CLOB,
    p_effective_start_date     IN DATE     DEFAULT NULL,
    p_effective_end_date       IN DATE     DEFAULT NULL,
    p_enable_pro_rata          IN VARCHAR2 DEFAULT 'N'
  ) IS
    l_policy_id      NUMBER;
    l_policy_guid    RAW(16);
    l_leave_type_en  VARCHAR2(200);
    l_leave_type_ar  VARCHAR2(200);
  BEGIN
    -- Lookup leave type names from ABS_LEAVE_TYPES (columns are LEAVE_NAME_EN, LEAVE_NAME_AR)
    SELECT leave_name_en, leave_name_ar
      INTO l_leave_type_en, l_leave_type_ar
      FROM ABS.ABS_LEAVE_TYPES
     WHERE tenant_id = p_tenant_id
       AND leave_type_id = p_leave_type_id
       AND ROWNUM = 1;

    l_policy_guid := HEXTORAW(REPLACE(SYS_GUID(), '-', ''));
    INSERT INTO ABS.ABS_LEAVE_POLICIES (
      POLICY_GUID,
      TENANT_ID,
      LEAVE_TYPE_ID,
      LEAVE_TYPE_EN,
      LEAVE_TYPE_AR,
      POLICY_NAME,
      ENTITLEMENT_DAYS,
      ACCRUAL_METHOD_CODE,
      STATUS,
      KUWAIT_LABOR_COMPLIANT,
      CREATED_BY,
      CREATED_DATE,
      EFFECTIVE_START_DATE,
      EFFECTIVE_END_DATE,
      ENABLE_PRO_RATA
    ) VALUES (
      l_policy_guid,
      p_tenant_id,
      p_leave_type_id,
      l_leave_type_en,
      l_leave_type_ar,
      p_policy_name,
      p_entitlement_days,
      p_accrual_method_code,
      'ACTIVE',
      'N',
      p_created_by,
      SYSDATE,
      p_effective_start_date,
      p_effective_end_date,
      NVL(UPPER(TRIM(p_enable_pro_rata)), 'N')
    ) RETURNING POLICY_ID INTO l_policy_id;

    -- Eligibility (min_service_years, max_service_years, employee_category_code, etc.)
    INSERT INTO ABS.ABS_LEAVE_POLICY_ELIGIBILITY (
      POLICY_ID, TENANT_ID, MIN_SERVICE_YEARS, MAX_SERVICE_YEARS,
      EMPLOYEE_CATEGORY_CODE, EMPLOYMENT_TYPE_CODE, CONTRACT_TYPE_CODE,
      GENDER_CODE, RELIGION_CODE, MARITAL_STATUS_CODE, PROBATION_ALLOWED
    ) VALUES (
      l_policy_id, p_tenant_id, p_min_service_years, p_max_service_years,
      p_employee_category_code, p_employment_type_code, p_contract_type_code,
      p_gender_code, p_religion_code, p_marital_status_code, p_probation_allowed
    );

    -- Rules (min_notice_days, max_consecutive_days, requires_document, allow_carry_forward, allow_encashment)
    INSERT INTO ABS.ABS_LEAVE_POLICY_RULES (
      POLICY_ID, TENANT_ID, MIN_NOTICE_DAYS, MAX_CONSECUTIVE_DAYS,
      REQUIRES_DOCUMENT, ALLOW_CARRY_FORWARD, ALLOW_ENCASHMENT
    ) VALUES (
      l_policy_id, p_tenant_id, p_min_notice_days, p_max_consecutive_days,
      p_requires_document, p_allow_carry_forward, p_allow_encashment
    );

    -- Carry forward (carry_forward_limit_days, grace_period_days, auto_forfeit_flag, notify_before_days)
    INSERT INTO ABS.ABS_LEAVE_POLICY_CARRY_FORWARD (
      POLICY_ID, TENANT_ID, ALLOW_CARRY_FORWARD, CARRY_FORWARD_LIMIT_DAYS,
      GRACE_PERIOD_DAYS, AUTO_FORFEIT_FLAG, NOTIFY_BEFORE_DAYS
    ) VALUES (
      l_policy_id, p_tenant_id, p_allow_carry_forward, p_carry_forward_limit,
      p_grace_period_days, p_auto_forfeit_flag, p_notify_before_days
    );

    -- Encashment (encashment_limit_days, encashment_rate_pct)
    INSERT INTO ABS.ABS_LEAVE_POLICY_ENCASHMENT (
      POLICY_ID, TENANT_ID, ALLOW_ENCASHMENT, ENCASHMENT_LIMIT_DAYS, ENCASHMENT_RATE_PCT
    ) VALUES (
      l_policy_id, p_tenant_id, p_allow_encashment, p_encashment_limit_days, p_encashment_rate_pct
    );

    -- Grade entitlements (from p_grade_rows_json; ACCRUAL_METHOD_CODE from policy)
    INSERT INTO ABS.ABS_LEAVE_POLICY_ENTITLEMENTS (
      POLICY_ID, TENANT_ID, GRADE_FROM, GRADE_TO, ENTITLEMENT_DAYS, ACCRUAL_RATE, STATUS, ACCRUAL_METHOD_CODE
    )
    SELECT l_policy_id, p_tenant_id, j.grade_from, j.grade_to, j.entitlement_days, j.accrual_rate, NVL(j.status, 'ACTIVE'), p_accrual_method_code
      FROM JSON_TABLE(p_grade_rows_json, '$[*]' COLUMNS (
        grade_from        NUMBER PATH '$.grade_from',
        grade_to          NUMBER PATH '$.grade_to',
        entitlement_days  NUMBER PATH '$.entitlement_days',
        accrual_rate      NUMBER PATH '$.accrual_rate',
        status            VARCHAR2(20) PATH '$.status'
      )) j;

    COMMIT;
  END CREATE_POLICY_WITH_GRADES;

  PROCEDURE UPDATE_POLICY_WITH_GRADES(
    p_tenant_id               IN NUMBER,
    p_policy_id                IN NUMBER,
    p_leave_type_id            IN NUMBER,
    p_policy_name              IN VARCHAR2,
    p_entitlement_days         IN NUMBER,
    p_accrual_method_code      IN VARCHAR2,
    p_policy_status            IN VARCHAR2,
    p_updated_by               IN VARCHAR2,
    p_min_service_years       IN NUMBER   DEFAULT NULL,
    p_max_service_years       IN NUMBER   DEFAULT NULL,
    p_employee_category_code  IN VARCHAR2 DEFAULT NULL,
    p_employment_type_code    IN VARCHAR2 DEFAULT NULL,
    p_contract_type_code      IN VARCHAR2 DEFAULT NULL,
    p_gender_code             IN VARCHAR2 DEFAULT NULL,
    p_religion_code           IN VARCHAR2 DEFAULT NULL,
    p_marital_status_code      IN VARCHAR2 DEFAULT NULL,
    p_probation_allowed       IN VARCHAR2 DEFAULT NULL,
    p_min_notice_days         IN NUMBER   DEFAULT NULL,
    p_max_consecutive_days     IN NUMBER   DEFAULT NULL,
    p_requires_document       IN VARCHAR2 DEFAULT NULL,
    p_allow_carry_forward     IN VARCHAR2 DEFAULT NULL,
    p_allow_encashment        IN VARCHAR2 DEFAULT NULL,
    p_carry_forward_limit      IN NUMBER   DEFAULT NULL,
    p_grace_period_days       IN NUMBER   DEFAULT NULL,
    p_auto_forfeit_flag       IN VARCHAR2 DEFAULT NULL,
    p_notify_before_days      IN NUMBER   DEFAULT NULL,
    p_encashment_limit_days   IN NUMBER   DEFAULT NULL,
    p_encashment_rate_pct     IN NUMBER   DEFAULT NULL,
    p_grade_rows_json         IN CLOB,
    p_effective_start_date    IN DATE     DEFAULT NULL,
    p_effective_end_date      IN DATE     DEFAULT NULL,
    p_enable_pro_rata         IN VARCHAR2 DEFAULT 'N'
  ) IS
    l_leave_type_en  VARCHAR2(200);
    l_leave_type_ar  VARCHAR2(200);
  BEGIN
    -- Lookup leave type names from ABS_LEAVE_TYPES (columns are LEAVE_NAME_EN, LEAVE_NAME_AR)
    SELECT leave_name_en, leave_name_ar
      INTO l_leave_type_en, l_leave_type_ar
      FROM ABS.ABS_LEAVE_TYPES
     WHERE tenant_id = p_tenant_id
       AND leave_type_id = p_leave_type_id
       AND ROWNUM = 1;

    UPDATE ABS.ABS_LEAVE_POLICIES
    SET
      LEAVE_TYPE_ID             = p_leave_type_id,
      LEAVE_TYPE_EN             = l_leave_type_en,
      LEAVE_TYPE_AR             = l_leave_type_ar,
      POLICY_NAME               = p_policy_name,
      ENTITLEMENT_DAYS          = p_entitlement_days,
      ACCRUAL_METHOD_CODE       = p_accrual_method_code,
      STATUS                    = p_policy_status,
      LAST_UPDATED_BY           = p_updated_by,
      EFFECTIVE_START_DATE      = NVL(p_effective_start_date, EFFECTIVE_START_DATE),
      EFFECTIVE_END_DATE        = NVL(p_effective_end_date, EFFECTIVE_END_DATE),
      ENABLE_PRO_RATA           = NVL(UPPER(TRIM(p_enable_pro_rata)), ENABLE_PRO_RATA)
    WHERE POLICY_ID = p_policy_id
      AND TENANT_ID = p_tenant_id;

    -- Eligibility
    UPDATE ABS.ABS_LEAVE_POLICY_ELIGIBILITY
    SET MIN_SERVICE_YEARS = p_min_service_years, MAX_SERVICE_YEARS = p_max_service_years,
        EMPLOYEE_CATEGORY_CODE = p_employee_category_code, EMPLOYMENT_TYPE_CODE = p_employment_type_code,
        CONTRACT_TYPE_CODE = p_contract_type_code, GENDER_CODE = p_gender_code,
        RELIGION_CODE = p_religion_code, MARITAL_STATUS_CODE = p_marital_status_code,
        PROBATION_ALLOWED = p_probation_allowed
    WHERE POLICY_ID = p_policy_id AND TENANT_ID = p_tenant_id;

    -- Rules
    UPDATE ABS.ABS_LEAVE_POLICY_RULES
    SET MIN_NOTICE_DAYS = p_min_notice_days, MAX_CONSECUTIVE_DAYS = p_max_consecutive_days,
        REQUIRES_DOCUMENT = p_requires_document, ALLOW_CARRY_FORWARD = p_allow_carry_forward,
        ALLOW_ENCASHMENT = p_allow_encashment
    WHERE POLICY_ID = p_policy_id AND TENANT_ID = p_tenant_id;

    -- Carry forward
    UPDATE ABS.ABS_LEAVE_POLICY_CARRY_FORWARD
    SET ALLOW_CARRY_FORWARD = p_allow_carry_forward, CARRY_FORWARD_LIMIT_DAYS = p_carry_forward_limit,
        GRACE_PERIOD_DAYS = p_grace_period_days, AUTO_FORFEIT_FLAG = p_auto_forfeit_flag,
        NOTIFY_BEFORE_DAYS = p_notify_before_days
    WHERE POLICY_ID = p_policy_id AND TENANT_ID = p_tenant_id;

    -- Encashment
    UPDATE ABS.ABS_LEAVE_POLICY_ENCASHMENT
    SET ALLOW_ENCASHMENT = p_allow_encashment, ENCASHMENT_LIMIT_DAYS = p_encashment_limit_days,
        ENCASHMENT_RATE_PCT = p_encashment_rate_pct
    WHERE POLICY_ID = p_policy_id AND TENANT_ID = p_tenant_id;

    -- Grade entitlements: replace with new rows from JSON (ACCRUAL_METHOD_CODE from policy)
    DELETE FROM ABS.ABS_LEAVE_POLICY_ENTITLEMENTS
     WHERE POLICY_ID = p_policy_id AND TENANT_ID = p_tenant_id;
    INSERT INTO ABS.ABS_LEAVE_POLICY_ENTITLEMENTS (
      POLICY_ID, TENANT_ID, GRADE_FROM, GRADE_TO, ENTITLEMENT_DAYS, ACCRUAL_RATE, STATUS, ACCRUAL_METHOD_CODE
    )
    SELECT p_policy_id, p_tenant_id, j.grade_from, j.grade_to, j.entitlement_days, j.accrual_rate, NVL(j.status, 'ACTIVE'), p_accrual_method_code
      FROM JSON_TABLE(p_grade_rows_json, '$[*]' COLUMNS (
        grade_from        NUMBER PATH '$.grade_from',
        grade_to          NUMBER PATH '$.grade_to',
        entitlement_days  NUMBER PATH '$.entitlement_days',
        accrual_rate      NUMBER PATH '$.accrual_rate',
        status            VARCHAR2(20) PATH '$.status'
      )) j;

    COMMIT;
  END UPDATE_POLICY_WITH_GRADES;
END ABS_POLICY_PKG;
/

ALTER PACKAGE ABS.ABS_POLICY_PKG COMPILE;
ALTER PACKAGE ABS.ABS_POLICY_PKG COMPILE BODY;

SELECT object_name, object_type, status
FROM all_objects
WHERE owner = 'ABS' AND object_name = 'ABS_POLICY_PKG';
