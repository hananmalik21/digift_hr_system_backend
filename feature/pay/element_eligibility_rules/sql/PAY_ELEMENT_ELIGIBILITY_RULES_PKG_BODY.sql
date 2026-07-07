CREATE OR REPLACE PACKAGE BODY PAY.PAY_ELEMENT_ELIGIBILITY_RULES_PKG AS

    ----------------------------------------------------------------------
    -- Friendly unexpected error mapper
    ----------------------------------------------------------------------
    FUNCTION friendly_error (
        p_sqlcode IN NUMBER,
        p_sqlerrm IN VARCHAR2
    ) RETURN VARCHAR2
    IS
    BEGIN
        IF p_sqlcode = -1 THEN
            RETURN 'Duplicate criteria values are not allowed for the same eligibility rule.';
        ELSIF p_sqlcode = -2291 THEN
            RETURN 'Selected value is invalid. Please choose a valid value from the list.';
        ELSIF p_sqlcode = -1400 THEN
            RETURN 'Required information is missing. Please complete all mandatory fields.';
        ELSIF p_sqlcode = -932 THEN
            RETURN 'Data type mismatch. Please check that GUID columns are RAW(16) and numeric columns are NUMBER.';
        ELSE
            RETURN 'Unable to process eligibility rule. Please review the selected values and try again.';
        END IF;
    END friendly_error;


    ----------------------------------------------------------------------
    -- Validate enterprise
    ----------------------------------------------------------------------
    FUNCTION validate_enterprise (
        p_enterprise_id IN NUMBER,
        x_message       OUT VARCHAR2
    ) RETURN BOOLEAN
    IS
        l_count NUMBER;
    BEGIN
        IF p_enterprise_id IS NULL THEN
            x_message := 'Enterprise is required.';
            RETURN FALSE;
        END IF;

        SELECT COUNT(*)
        INTO l_count
        FROM ENT.ENTERPRISES
        WHERE ENTERPRISE_ID = p_enterprise_id;

        IF l_count = 0 THEN
            x_message := 'Selected Enterprise is not valid.';
            RETURN FALSE;
        END IF;

        RETURN TRUE;

    EXCEPTION
        WHEN OTHERS THEN
            x_message := 'Unable to validate Enterprise. Please check enterprise setup.';
            RETURN FALSE;
    END validate_enterprise;


    ----------------------------------------------------------------------
    -- Validate WHO fields for create
    ----------------------------------------------------------------------
    FUNCTION validate_create_who_fields (
        p_created_by       IN VARCHAR2,
        p_creation_date    IN DATE,
        p_last_updated_by  IN VARCHAR2,
        p_last_update_date IN DATE,
        x_message          OUT VARCHAR2
    ) RETURN BOOLEAN
    IS
    BEGIN
        IF p_created_by IS NULL OR TRIM(p_created_by) IS NULL THEN
            x_message := 'Created by is required.';
            RETURN FALSE;
        END IF;

        IF p_creation_date IS NULL THEN
            x_message := 'Creation date is required.';
            RETURN FALSE;
        END IF;

        IF p_last_updated_by IS NULL OR TRIM(p_last_updated_by) IS NULL THEN
            x_message := 'Last updated by is required.';
            RETURN FALSE;
        END IF;

        IF p_last_update_date IS NULL THEN
            x_message := 'Last update date is required.';
            RETURN FALSE;
        END IF;

        RETURN TRUE;
    END validate_create_who_fields;


    ----------------------------------------------------------------------
    -- Validate WHO fields for update/delete/status
    ----------------------------------------------------------------------
    FUNCTION validate_update_who_fields (
        p_last_updated_by  IN VARCHAR2,
        p_last_update_date IN DATE,
        x_message          OUT VARCHAR2
    ) RETURN BOOLEAN
    IS
    BEGIN
        IF p_last_updated_by IS NULL OR TRIM(p_last_updated_by) IS NULL THEN
            x_message := 'Last updated by is required.';
            RETURN FALSE;
        END IF;

        IF p_last_update_date IS NULL THEN
            x_message := 'Last update date is required.';
            RETURN FALSE;
        END IF;

        RETURN TRUE;
    END validate_update_who_fields;


    ----------------------------------------------------------------------
    -- Normalize criteria type
    ----------------------------------------------------------------------
    FUNCTION normalize_type (
        p_criteria_type_code IN VARCHAR2,
        x_message            OUT VARCHAR2
    ) RETURN VARCHAR2
    IS
        l_type VARCHAR2(50);
    BEGIN
        l_type := UPPER(TRIM(p_criteria_type_code));

        IF l_type IN ('LEGAL EMPLOYER', 'LEGAL_EMPLOYER') THEN
            RETURN 'LEGAL_EMPLOYER';

        ELSIF l_type IN ('BUSINESS UNIT', 'BUSINESS_UNIT') THEN
            RETURN 'BUSINESS_UNIT';

        ELSIF l_type IN ('DEPARTMENT UNIT', 'DEPARTMENT', 'DEPARTMENT_UNIT') THEN
            RETURN 'DEPARTMENT';

        ELSIF l_type IN ('EMPLOYMENT TYPE', 'EMPLOYMENT_TYPE') THEN
            RETURN 'EMPLOYMENT_TYPE';

        ELSIF l_type = 'GRADE' THEN
            RETURN 'GRADE';

        ELSIF l_type = 'POSITION' THEN
            RETURN 'POSITION';

        ELSIF l_type = 'LOCATION' THEN
            RETURN 'LOCATION';

        ELSE
            x_message := 'Invalid criteria type. Please select a valid criteria type.';
            RETURN NULL;
        END IF;
    END normalize_type;


    ----------------------------------------------------------------------
    -- Display label for messages
    ----------------------------------------------------------------------
    FUNCTION criteria_label (
        p_type IN VARCHAR2
    ) RETURN VARCHAR2
    IS
    BEGIN
        IF p_type = 'LEGAL_EMPLOYER' THEN
            RETURN 'Legal Employer';
        ELSIF p_type = 'BUSINESS_UNIT' THEN
            RETURN 'Business Unit';
        ELSIF p_type = 'DEPARTMENT' THEN
            RETURN 'Department';
        ELSIF p_type = 'EMPLOYMENT_TYPE' THEN
            RETURN 'Employment Type';
        ELSIF p_type = 'GRADE' THEN
            RETURN 'Grade';
        ELSIF p_type = 'POSITION' THEN
            RETURN 'Position';
        ELSIF p_type = 'LOCATION' THEN
            RETURN 'Location';
        ELSE
            RETURN 'Criteria Value';
        END IF;
    END criteria_label;


    ----------------------------------------------------------------------
    -- Convert hex GUID string to RAW
    ----------------------------------------------------------------------
    FUNCTION to_raw_guid (
        p_value   IN VARCHAR2,
        p_label   IN VARCHAR2,
        x_message OUT VARCHAR2
    ) RETURN RAW
    IS
        l_hex VARCHAR2(100);
    BEGIN
        IF p_value IS NULL THEN
            x_message := p_label || ' is required.';
            RETURN NULL;
        END IF;

        l_hex := UPPER(TRIM(p_value));
        l_hex := REPLACE(l_hex, '-', '');
        l_hex := REPLACE(l_hex, '{', '');
        l_hex := REPLACE(l_hex, '}', '');
        l_hex := REPLACE(l_hex, ' ', '');

        IF LENGTH(l_hex) <> 32
           OR NOT REGEXP_LIKE(l_hex, '^[0-9A-F]{32}$') THEN
            x_message := 'Invalid ' || p_label || '. Please select a valid value from the list.';
            RETURN NULL;
        END IF;

        RETURN HEXTORAW(l_hex);

    EXCEPTION
        WHEN OTHERS THEN
            x_message := 'Invalid ' || p_label || '. Please select a valid value from the list.';
            RETURN NULL;
    END to_raw_guid;


    ----------------------------------------------------------------------
    -- Validate dates
    ----------------------------------------------------------------------
    FUNCTION validate_dates (
        p_start_date IN DATE,
        p_end_date   IN DATE,
        x_message    OUT VARCHAR2
    ) RETURN BOOLEAN
    IS
    BEGIN
        IF p_start_date IS NULL THEN
            x_message := 'Effective start date is required.';
            RETURN FALSE;
        END IF;

        IF p_end_date IS NULL THEN
            x_message := 'Effective end date is required.';
            RETURN FALSE;
        END IF;

        IF p_end_date < p_start_date THEN
            x_message := 'Effective end date cannot be earlier than effective start date.';
            RETURN FALSE;
        END IF;

        RETURN TRUE;
    END validate_dates;


    ----------------------------------------------------------------------
    -- Validate status
    ----------------------------------------------------------------------
    FUNCTION validate_status (
        p_status  IN VARCHAR2,
        x_message OUT VARCHAR2
    ) RETURN BOOLEAN
    IS
    BEGIN
        IF UPPER(TRIM(NVL(p_status, 'ACTIVE'))) NOT IN ('ACTIVE', 'INACTIVE') THEN
            x_message := 'Invalid status. Allowed values are Active or Inactive.';
            RETURN FALSE;
        END IF;

        RETURN TRUE;
    END validate_status;


    ----------------------------------------------------------------------
    -- Resolve selected criteria value into correct child table columns
    ----------------------------------------------------------------------
    FUNCTION resolve_criteria_value (
        p_criteria_type_code     IN  VARCHAR2,
        p_criteria_value         IN  VARCHAR2,

        x_employment_type_code   OUT VARCHAR2,
        x_grade_id               OUT NUMBER,
        x_position_id            OUT RAW,
        x_legal_employer_id      OUT RAW,
        x_org_unit_id            OUT RAW,
        x_location_code          OUT VARCHAR2,
        x_store_criteria_value   OUT VARCHAR2,
        x_message                OUT VARCHAR2
    ) RETURN BOOLEAN
    IS
        l_type        VARCHAR2(50);
        l_level_code  ENT.ORG_UNITS.LEVEL_CODE%TYPE;
        l_count       NUMBER;
        l_label       VARCHAR2(100);
        l_org_raw     RAW(16);
    BEGIN
        x_employment_type_code := NULL;
        x_grade_id             := NULL;
        x_position_id          := NULL;
        x_legal_employer_id    := NULL;
        x_org_unit_id          := NULL;
        x_location_code        := NULL;
        x_store_criteria_value := NULL;

        l_type := normalize_type(p_criteria_type_code, x_message);

        IF l_type IS NULL THEN
            RETURN FALSE;
        END IF;

        l_label := criteria_label(l_type);

        IF p_criteria_value IS NULL OR TRIM(p_criteria_value) IS NULL THEN
            x_message := l_label || ' is required.';
            RETURN FALSE;
        END IF;

        IF l_type = 'EMPLOYMENT_TYPE' THEN

            x_employment_type_code := TRIM(p_criteria_value);
            x_store_criteria_value := TRIM(p_criteria_value);
            RETURN TRUE;

        ELSIF l_type = 'GRADE' THEN

            BEGIN
                x_grade_id := TO_NUMBER(TRIM(p_criteria_value));
            EXCEPTION
                WHEN VALUE_ERROR THEN
                    x_message := 'Invalid Grade. Please select a valid grade from the list.';
                    RETURN FALSE;
            END;

            SELECT COUNT(*)
            INTO l_count
            FROM ENT.GRADES
            WHERE GRADE_ID = x_grade_id;

            IF l_count = 0 THEN
                x_message := 'Selected Grade is not valid. Please select a valid grade from the list.';
                RETURN FALSE;
            END IF;

            x_store_criteria_value := TO_CHAR(x_grade_id);
            RETURN TRUE;

        ELSIF l_type = 'POSITION' THEN

            x_position_id := to_raw_guid(p_criteria_value, 'Position', x_message);

            IF x_position_id IS NULL THEN
                RETURN FALSE;
            END IF;

            SELECT COUNT(*)
            INTO l_count
            FROM ENT.POSITIONS
            WHERE POSITION_ID = x_position_id;

            IF l_count = 0 THEN
                x_message := 'Selected Position is not valid. Please select a valid position from the list.';
                RETURN FALSE;
            END IF;

            x_store_criteria_value := RAWTOHEX(x_position_id);
            RETURN TRUE;

        ELSIF l_type IN ('LEGAL_EMPLOYER', 'BUSINESS_UNIT', 'DEPARTMENT') THEN

            l_org_raw := to_raw_guid(p_criteria_value, l_label, x_message);

            IF l_org_raw IS NULL THEN
                RETURN FALSE;
            END IF;

            BEGIN
                SELECT LEVEL_CODE
                INTO l_level_code
                FROM ENT.ORG_UNITS
                WHERE ORG_UNIT_ID = l_org_raw;

            EXCEPTION
                WHEN NO_DATA_FOUND THEN
                    x_message := 'Selected ' || l_label || ' is not valid. Please select a valid ' || l_label || ' from the list.';
                    RETURN FALSE;

                WHEN TOO_MANY_ROWS THEN
                    x_message := 'Selected ' || l_label || ' is not valid. Please select it again from the list.';
                    RETURN FALSE;
            END;

            l_level_code := UPPER(TRIM(l_level_code));

            IF l_type = 'LEGAL_EMPLOYER'
               AND l_level_code <> 'COMPANY' THEN

                x_message := 'Selected value is not a Legal Employer. Please select a Legal Employer from the list.';
                RETURN FALSE;

            ELSIF l_type = 'BUSINESS_UNIT'
               AND l_level_code <> 'BUSINESS_UNIT' THEN

                x_message := 'Selected value is not a Business Unit. Please select a Business Unit from the list.';
                RETURN FALSE;

            ELSIF l_type = 'DEPARTMENT'
               AND l_level_code <> 'DEPARTMENT' THEN

                x_message := 'Selected value is not a Department. Please select a Department from the list.';
                RETURN FALSE;

            END IF;

            IF l_type = 'LEGAL_EMPLOYER' THEN
                x_legal_employer_id := l_org_raw;
                x_org_unit_id       := NULL;
            ELSE
                x_legal_employer_id := NULL;
                x_org_unit_id       := l_org_raw;
            END IF;

            x_store_criteria_value := RAWTOHEX(l_org_raw);
            RETURN TRUE;

        ELSIF l_type = 'LOCATION' THEN

            x_location_code        := TRIM(p_criteria_value);
            x_store_criteria_value := TRIM(p_criteria_value);
            RETURN TRUE;

        END IF;

        x_message := 'Invalid criteria value.';
        RETURN FALSE;

    EXCEPTION
        WHEN OTHERS THEN
            x_message := friendly_error(SQLCODE, SQLERRM);
            RETURN FALSE;
    END resolve_criteria_value;


    ----------------------------------------------------------------------
    -- Insert one criteria value
    ----------------------------------------------------------------------
    FUNCTION insert_single_criteria_value (
        p_eligibility_rule_id    IN  NUMBER,
        p_criteria_type_code     IN  VARCHAR2,
        p_criteria_value         IN  VARCHAR2,
        p_created_by             IN  VARCHAR2,
        p_creation_date          IN  DATE,
        p_last_updated_by        IN  VARCHAR2,
        p_last_update_date       IN  DATE,
        x_message                OUT VARCHAR2
    ) RETURN BOOLEAN
    IS
        l_type                  VARCHAR2(50);
        l_emp_type_code         VARCHAR2(50);
        l_grade_id              NUMBER;
        l_position_id           RAW(16);
        l_legal_employer_id     RAW(16);
        l_org_unit_id           RAW(16);
        l_location_code         VARCHAR2(100);
        l_store_value           VARCHAR2(500);
    BEGIN
        IF p_criteria_type_code IS NULL OR TRIM(p_criteria_type_code) IS NULL THEN
            x_message := 'Criteria type is required.';
            RETURN FALSE;
        END IF;

        IF p_criteria_value IS NULL OR TRIM(p_criteria_value) IS NULL THEN
            x_message := 'Criteria value is required.';
            RETURN FALSE;
        END IF;

        l_type := normalize_type(p_criteria_type_code, x_message);

        IF l_type IS NULL THEN
            RETURN FALSE;
        END IF;

        IF NOT resolve_criteria_value(
            p_criteria_type_code   => l_type,
            p_criteria_value       => p_criteria_value,
            x_employment_type_code => l_emp_type_code,
            x_grade_id             => l_grade_id,
            x_position_id          => l_position_id,
            x_legal_employer_id    => l_legal_employer_id,
            x_org_unit_id          => l_org_unit_id,
            x_location_code        => l_location_code,
            x_store_criteria_value => l_store_value,
            x_message              => x_message
        ) THEN
            RETURN FALSE;
        END IF;

        INSERT INTO PAY.PAY_ELEMENT_ELIGIBILITY_RULE_VALUES
        (
            ELIGIBILITY_RULE_ID,
            CRITERIA_TYPE_CODE,
            CRITERIA_VALUE,
            LEGAL_EMPLOYER_ID,
            ORG_UNIT_ID,
            GRADE_ID,
            POSITION_ID,
            EMPLOYMENT_TYPE_CODE,
            LOCATION_CODE,
            CREATED_BY,
            CREATION_DATE,
            LAST_UPDATED_BY,
            LAST_UPDATE_DATE
        )
        VALUES
        (
            p_eligibility_rule_id,
            l_type,
            l_store_value,
            l_legal_employer_id,
            l_org_unit_id,
            l_grade_id,
            l_position_id,
            l_emp_type_code,
            l_location_code,
            TRIM(p_created_by),
            p_creation_date,
            TRIM(p_last_updated_by),
            p_last_update_date
        );

        RETURN TRUE;

    EXCEPTION
        WHEN DUP_VAL_ON_INDEX THEN
            x_message := 'Duplicate criteria values are not allowed for the same eligibility rule.';
            RETURN FALSE;

        WHEN OTHERS THEN
            x_message := friendly_error(SQLCODE, SQLERRM);
            RETURN FALSE;
    END insert_single_criteria_value;


    ----------------------------------------------------------------------
    -- Insert multiple criteria values from JSON
    ----------------------------------------------------------------------
    FUNCTION insert_criteria_values (
        p_eligibility_rule_id    IN  NUMBER,
        p_criteria_values_json   IN  CLOB,
        p_created_by             IN  VARCHAR2,
        p_creation_date          IN  DATE,
        p_last_updated_by        IN  VARCHAR2,
        p_last_update_date       IN  DATE,
        x_message                OUT VARCHAR2
    ) RETURN BOOLEAN
    IS
        l_count NUMBER := 0;
    BEGIN
        IF p_criteria_values_json IS NULL
           OR DBMS_LOB.GETLENGTH(p_criteria_values_json) = 0 THEN
            x_message := 'At least one criteria value is required.';
            RETURN FALSE;
        END IF;

        FOR r IN (
            SELECT
                NVL(criteria_type_code, criteria_type_code2) AS criteria_type_code,
                NVL(criteria_value, criteria_value2)         AS criteria_value
            FROM JSON_TABLE(
                p_criteria_values_json,
                '$[*]'
                COLUMNS
                (
                    criteria_type_code   VARCHAR2(50)  PATH '$.criteria_type_code' NULL ON ERROR,
                    criteria_type_code2  VARCHAR2(50)  PATH '$.criteriaTypeCode'    NULL ON ERROR,
                    criteria_value       VARCHAR2(500) PATH '$.criteria_value'      NULL ON ERROR,
                    criteria_value2      VARCHAR2(500) PATH '$.criteriaValue'       NULL ON ERROR
                )
            )
            WHERE NVL(criteria_value, criteria_value2) IS NOT NULL
        )
        LOOP
            l_count := l_count + 1;

            IF NOT insert_single_criteria_value(
                p_eligibility_rule_id => p_eligibility_rule_id,
                p_criteria_type_code  => r.criteria_type_code,
                p_criteria_value      => r.criteria_value,
                p_created_by          => p_created_by,
                p_creation_date       => p_creation_date,
                p_last_updated_by     => p_last_updated_by,
                p_last_update_date    => p_last_update_date,
                x_message             => x_message
            ) THEN
                RETURN FALSE;
            END IF;
        END LOOP;

        FOR r IN (
            SELECT
                NVL(criteria_type_code, criteria_type_code2) AS criteria_type_code,
                criteria_value                              AS criteria_value
            FROM JSON_TABLE(
                p_criteria_values_json,
                '$[*]'
                COLUMNS
                (
                    criteria_type_code   VARCHAR2(50) PATH '$.criteria_type_code' NULL ON ERROR,
                    criteria_type_code2  VARCHAR2(50) PATH '$.criteriaTypeCode'    NULL ON ERROR,

                    NESTED PATH '$.criteria_values[*]'
                    COLUMNS
                    (
                        criteria_value VARCHAR2(500) PATH '$' NULL ON ERROR
                    )
                )
            )
            WHERE criteria_value IS NOT NULL
        )
        LOOP
            l_count := l_count + 1;

            IF NOT insert_single_criteria_value(
                p_eligibility_rule_id => p_eligibility_rule_id,
                p_criteria_type_code  => r.criteria_type_code,
                p_criteria_value      => r.criteria_value,
                p_created_by          => p_created_by,
                p_creation_date       => p_creation_date,
                p_last_updated_by     => p_last_updated_by,
                p_last_update_date    => p_last_update_date,
                x_message             => x_message
            ) THEN
                RETURN FALSE;
            END IF;
        END LOOP;

        FOR r IN (
            SELECT
                NVL(criteria_type_code, criteria_type_code2) AS criteria_type_code,
                criteria_value                              AS criteria_value
            FROM JSON_TABLE(
                p_criteria_values_json,
                '$[*]'
                COLUMNS
                (
                    criteria_type_code   VARCHAR2(50) PATH '$.criteria_type_code' NULL ON ERROR,
                    criteria_type_code2  VARCHAR2(50) PATH '$.criteriaTypeCode'    NULL ON ERROR,

                    NESTED PATH '$.criteriaValues[*]'
                    COLUMNS
                    (
                        criteria_value VARCHAR2(500) PATH '$' NULL ON ERROR
                    )
                )
            )
            WHERE criteria_value IS NOT NULL
        )
        LOOP
            l_count := l_count + 1;

            IF NOT insert_single_criteria_value(
                p_eligibility_rule_id => p_eligibility_rule_id,
                p_criteria_type_code  => r.criteria_type_code,
                p_criteria_value      => r.criteria_value,
                p_created_by          => p_created_by,
                p_creation_date       => p_creation_date,
                p_last_updated_by     => p_last_updated_by,
                p_last_update_date    => p_last_update_date,
                x_message             => x_message
            ) THEN
                RETURN FALSE;
            END IF;
        END LOOP;

        IF l_count = 0 THEN
            x_message := 'At least one criteria value is required.';
            RETURN FALSE;
        END IF;

        RETURN TRUE;

    EXCEPTION
        WHEN DUP_VAL_ON_INDEX THEN
            x_message := 'Duplicate criteria values are not allowed for the same eligibility rule.';
            RETURN FALSE;

        WHEN OTHERS THEN
            IF UPPER(SQLERRM) LIKE '%JSON%' THEN
                x_message := 'Invalid criteria values JSON. Please pass a valid JSON array.';
            ELSE
                x_message := friendly_error(SQLCODE, SQLERRM);
            END IF;

            RETURN FALSE;
    END insert_criteria_values;


    ----------------------------------------------------------------------
    -- Create Rule
    ----------------------------------------------------------------------
    PROCEDURE create_rule (
        p_enterprise_id          IN  NUMBER,
        p_rule_name              IN  VARCHAR2,
        p_criteria_values_json   IN  CLOB,
        p_effective_start_date   IN  DATE,
        p_effective_end_date     IN  DATE,
        p_status                 IN  VARCHAR2,

        p_created_by             IN  VARCHAR2,
        p_creation_date          IN  DATE,
        p_last_updated_by        IN  VARCHAR2,
        p_last_update_date       IN  DATE,

        x_success                OUT VARCHAR2,
        x_message                OUT VARCHAR2,
        x_eligibility_rule_id    OUT NUMBER,
        x_eligibility_rule_guid  OUT VARCHAR2
    )
    IS
        l_guid_raw    RAW(16);
        l_start_date  DATE;
        l_end_date    DATE;
        l_status      VARCHAR2(30);
    BEGIN
        SAVEPOINT pay_eer_create_sp;

        x_success               := 'N';
        x_message               := NULL;
        x_eligibility_rule_id   := NULL;
        x_eligibility_rule_guid := NULL;

        l_start_date := NVL(p_effective_start_date, TRUNC(SYSDATE));
        l_end_date   := NVL(p_effective_end_date, DATE '4712-12-31');
        l_status     := UPPER(TRIM(NVL(p_status, 'ACTIVE')));

        IF NOT validate_create_who_fields(
            p_created_by       => p_created_by,
            p_creation_date    => p_creation_date,
            p_last_updated_by  => p_last_updated_by,
            p_last_update_date => p_last_update_date,
            x_message          => x_message
        ) THEN
            RETURN;
        END IF;

        IF NOT validate_enterprise(p_enterprise_id, x_message) THEN
            RETURN;
        END IF;

        IF p_rule_name IS NULL OR TRIM(p_rule_name) IS NULL THEN
            x_message := 'Rule name is required.';
            RETURN;
        END IF;

        IF NOT validate_dates(l_start_date, l_end_date, x_message) THEN
            RETURN;
        END IF;

        IF NOT validate_status(l_status, x_message) THEN
            RETURN;
        END IF;

        INSERT INTO PAY.PAY_ELEMENT_ELIGIBILITY_RULES
        (
            ENTERPRISE_ID,
            RULE_NAME,
            EFFECTIVE_START_DATE,
            EFFECTIVE_END_DATE,
            STATUS,
            CREATED_BY,
            CREATION_DATE,
            LAST_UPDATED_BY,
            LAST_UPDATE_DATE
        )
        VALUES
        (
            p_enterprise_id,
            TRIM(p_rule_name),
            l_start_date,
            l_end_date,
            l_status,
            TRIM(p_created_by),
            p_creation_date,
            TRIM(p_last_updated_by),
            p_last_update_date
        )
        RETURNING
            ELIGIBILITY_RULE_ID,
            ELIGIBILITY_RULE_GUID
        INTO
            x_eligibility_rule_id,
            l_guid_raw;

        IF NOT insert_criteria_values(
            p_eligibility_rule_id  => x_eligibility_rule_id,
            p_criteria_values_json => p_criteria_values_json,
            p_created_by           => p_created_by,
            p_creation_date        => p_creation_date,
            p_last_updated_by      => p_last_updated_by,
            p_last_update_date     => p_last_update_date,
            x_message              => x_message
        ) THEN
            ROLLBACK TO pay_eer_create_sp;
            x_eligibility_rule_id   := NULL;
            x_eligibility_rule_guid := NULL;
            RETURN;
        END IF;

        x_eligibility_rule_guid := RAWTOHEX(l_guid_raw);
        x_success := 'Y';
        x_message := 'Eligibility rule created successfully.';

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK TO pay_eer_create_sp;
            x_success               := 'N';
            x_eligibility_rule_id   := NULL;
            x_eligibility_rule_guid := NULL;
            x_message := friendly_error(SQLCODE, SQLERRM);
    END create_rule;


    ----------------------------------------------------------------------
    -- Update Rule
    ----------------------------------------------------------------------
    PROCEDURE update_rule (
        p_enterprise_id          IN  NUMBER,
        p_eligibility_rule_guid  IN  VARCHAR2,
        p_rule_name              IN  VARCHAR2,
        p_criteria_values_json   IN  CLOB,
        p_effective_start_date   IN  DATE,
        p_effective_end_date     IN  DATE,
        p_status                 IN  VARCHAR2,

        p_last_updated_by        IN  VARCHAR2,
        p_last_update_date       IN  DATE,

        x_success                OUT VARCHAR2,
        x_message                OUT VARCHAR2
    )
    IS
        l_rule_guid   RAW(16);
        l_rule_id     NUMBER;
        l_start_date  DATE;
        l_end_date    DATE;
        l_status      VARCHAR2(30);
    BEGIN
        SAVEPOINT pay_eer_update_sp;

        x_success := 'N';
        x_message := NULL;

        l_start_date := NVL(p_effective_start_date, TRUNC(SYSDATE));
        l_end_date   := NVL(p_effective_end_date, DATE '4712-12-31');
        l_status     := UPPER(TRIM(NVL(p_status, 'ACTIVE')));

        IF NOT validate_update_who_fields(
            p_last_updated_by  => p_last_updated_by,
            p_last_update_date => p_last_update_date,
            x_message          => x_message
        ) THEN
            RETURN;
        END IF;

        IF NOT validate_enterprise(p_enterprise_id, x_message) THEN
            RETURN;
        END IF;

        l_rule_guid := to_raw_guid(
            p_eligibility_rule_guid,
            'Eligibility Rule',
            x_message
        );

        IF l_rule_guid IS NULL THEN
            RETURN;
        END IF;

        IF p_rule_name IS NULL OR TRIM(p_rule_name) IS NULL THEN
            x_message := 'Rule name is required.';
            RETURN;
        END IF;

        IF NOT validate_dates(l_start_date, l_end_date, x_message) THEN
            RETURN;
        END IF;

        IF NOT validate_status(l_status, x_message) THEN
            RETURN;
        END IF;

        BEGIN
            SELECT ELIGIBILITY_RULE_ID
            INTO l_rule_id
            FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULES
            WHERE ELIGIBILITY_RULE_GUID = l_rule_guid
              AND ENTERPRISE_ID = p_enterprise_id;

        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                x_message := 'Eligibility rule was not found.';
                RETURN;
        END;

        UPDATE PAY.PAY_ELEMENT_ELIGIBILITY_RULES
        SET
            RULE_NAME            = TRIM(p_rule_name),
            EFFECTIVE_START_DATE = l_start_date,
            EFFECTIVE_END_DATE   = l_end_date,
            STATUS               = l_status,
            LAST_UPDATED_BY      = TRIM(p_last_updated_by),
            LAST_UPDATE_DATE     = p_last_update_date
        WHERE ELIGIBILITY_RULE_ID = l_rule_id
          AND ENTERPRISE_ID       = p_enterprise_id;

        DELETE FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULE_VALUES
        WHERE ELIGIBILITY_RULE_ID = l_rule_id;

        IF NOT insert_criteria_values(
            p_eligibility_rule_id  => l_rule_id,
            p_criteria_values_json => p_criteria_values_json,
            p_created_by           => p_last_updated_by,
            p_creation_date        => p_last_update_date,
            p_last_updated_by      => p_last_updated_by,
            p_last_update_date     => p_last_update_date,
            x_message              => x_message
        ) THEN
            ROLLBACK TO pay_eer_update_sp;
            RETURN;
        END IF;

        x_success := 'Y';
        x_message := 'Eligibility rule updated successfully.';

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK TO pay_eer_update_sp;
            x_success := 'N';
            x_message := friendly_error(SQLCODE, SQLERRM);
    END update_rule;


    ----------------------------------------------------------------------
    -- Delete Rule
    ----------------------------------------------------------------------
    PROCEDURE delete_rule (
        p_enterprise_id          IN  NUMBER,
        p_eligibility_rule_guid  IN  VARCHAR2,
        p_hard_delete            IN  VARCHAR2,

        p_last_updated_by        IN  VARCHAR2,
        p_last_update_date       IN  DATE,

        x_success                OUT VARCHAR2,
        x_message                OUT VARCHAR2
    )
    IS
        l_rule_guid RAW(16);
        l_rule_id   NUMBER;
    BEGIN
        x_success := 'N';
        x_message := NULL;

        IF NOT validate_update_who_fields(
            p_last_updated_by  => p_last_updated_by,
            p_last_update_date => p_last_update_date,
            x_message          => x_message
        ) THEN
            RETURN;
        END IF;

        IF NOT validate_enterprise(p_enterprise_id, x_message) THEN
            RETURN;
        END IF;

        l_rule_guid := to_raw_guid(
            p_eligibility_rule_guid,
            'Eligibility Rule',
            x_message
        );

        IF l_rule_guid IS NULL THEN
            RETURN;
        END IF;

        BEGIN
            SELECT ELIGIBILITY_RULE_ID
            INTO l_rule_id
            FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULES
            WHERE ELIGIBILITY_RULE_GUID = l_rule_guid
              AND ENTERPRISE_ID = p_enterprise_id;

        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                x_message := 'Eligibility rule was not found.';
                RETURN;
        END;

        IF UPPER(TRIM(NVL(p_hard_delete, 'N'))) = 'Y' THEN

            DELETE FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULES
            WHERE ELIGIBILITY_RULE_ID = l_rule_id
              AND ENTERPRISE_ID       = p_enterprise_id;

            x_success := 'Y';
            x_message := 'Eligibility rule deleted successfully.';

        ELSE

            UPDATE PAY.PAY_ELEMENT_ELIGIBILITY_RULES
            SET
                STATUS           = 'INACTIVE',
                LAST_UPDATED_BY  = TRIM(p_last_updated_by),
                LAST_UPDATE_DATE = p_last_update_date
            WHERE ELIGIBILITY_RULE_ID = l_rule_id
              AND ENTERPRISE_ID       = p_enterprise_id;

            x_success := 'Y';
            x_message := 'Eligibility rule inactivated successfully.';

        END IF;

    EXCEPTION
        WHEN OTHERS THEN
            x_success := 'N';
            x_message := friendly_error(SQLCODE, SQLERRM);
    END delete_rule;


    ----------------------------------------------------------------------
    -- Set Status
    ----------------------------------------------------------------------
    PROCEDURE set_status (
        p_enterprise_id          IN  NUMBER,
        p_eligibility_rule_guid  IN  VARCHAR2,
        p_status                 IN  VARCHAR2,

        p_last_updated_by        IN  VARCHAR2,
        p_last_update_date       IN  DATE,

        x_success                OUT VARCHAR2,
        x_message                OUT VARCHAR2
    )
    IS
        l_rule_guid RAW(16);
        l_rule_id   NUMBER;
        l_status    VARCHAR2(30);
    BEGIN
        x_success := 'N';
        x_message := NULL;

        l_status := UPPER(TRIM(p_status));

        IF NOT validate_update_who_fields(
            p_last_updated_by  => p_last_updated_by,
            p_last_update_date => p_last_update_date,
            x_message          => x_message
        ) THEN
            RETURN;
        END IF;

        IF NOT validate_enterprise(p_enterprise_id, x_message) THEN
            RETURN;
        END IF;

        l_rule_guid := to_raw_guid(
            p_eligibility_rule_guid,
            'Eligibility Rule',
            x_message
        );

        IF l_rule_guid IS NULL THEN
            RETURN;
        END IF;

        IF NOT validate_status(l_status, x_message) THEN
            RETURN;
        END IF;

        BEGIN
            SELECT ELIGIBILITY_RULE_ID
            INTO l_rule_id
            FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULES
            WHERE ELIGIBILITY_RULE_GUID = l_rule_guid
              AND ENTERPRISE_ID = p_enterprise_id;

        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                x_message := 'Eligibility rule was not found.';
                RETURN;
        END;

        UPDATE PAY.PAY_ELEMENT_ELIGIBILITY_RULES
        SET
            STATUS           = l_status,
            LAST_UPDATED_BY  = TRIM(p_last_updated_by),
            LAST_UPDATE_DATE = p_last_update_date
        WHERE ELIGIBILITY_RULE_ID = l_rule_id
          AND ENTERPRISE_ID       = p_enterprise_id;

        x_success := 'Y';
        x_message := 'Eligibility rule status updated successfully.';

    EXCEPTION
        WHEN OTHERS THEN
            x_success := 'N';
            x_message := friendly_error(SQLCODE, SQLERRM);
    END set_status;

END PAY_ELEMENT_ELIGIBILITY_RULES_PKG;
