CREATE OR REPLACE PACKAGE BODY     PAY_ELEMENT_ELIG_PROFILES_PKG AS

    FUNCTION friendly_error (
        p_sqlcode IN NUMBER,
        p_sqlerrm IN VARCHAR2
    ) RETURN VARCHAR2
    IS
    BEGIN
        IF p_sqlcode = -1 THEN
            RETURN 'This profile or eligibility rule attachment already exists.';
        ELSIF p_sqlcode = -2291 THEN
            RETURN 'Selected eligibility rule is invalid. Please choose a valid rule.';
        ELSIF p_sqlcode = -1400 THEN
            RETURN 'Required information is missing. Please complete all mandatory fields.';
        ELSE
            RETURN 'Unable to process profile. Please review the selected values and try again.';
        END IF;
    END friendly_error;


    FUNCTION to_raw_guid (
        p_value   IN VARCHAR2,
        p_label   IN VARCHAR2,
        x_message OUT VARCHAR2
    ) RETURN RAW
    IS
        l_hex VARCHAR2(100);
    BEGIN
        IF p_value IS NULL OR TRIM(p_value) IS NULL THEN
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


    FUNCTION validate_create_who (
        p_created_by        IN VARCHAR2,
        p_creation_date     IN DATE,
        p_last_updated_by   IN VARCHAR2,
        p_last_update_date  IN DATE,
        x_message           OUT VARCHAR2
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
    END validate_create_who;


    FUNCTION validate_update_who (
        p_last_updated_by   IN VARCHAR2,
        p_last_update_date  IN DATE,
        x_message           OUT VARCHAR2
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
    END validate_update_who;


    FUNCTION get_profile_id (
        p_enterprise_id IN NUMBER,
        p_profile_guid  IN VARCHAR2,
        x_message       OUT VARCHAR2
    ) RETURN NUMBER
    IS
        l_profile_guid RAW(16);
        l_profile_id   NUMBER;
    BEGIN
        l_profile_guid := to_raw_guid(p_profile_guid, 'Profile', x_message);

        IF l_profile_guid IS NULL THEN
            RETURN NULL;
        END IF;

        SELECT PROFILE_ID
        INTO l_profile_id
        FROM PAY.PAY_ELEMENT_ELIG_PROFILES
        WHERE ENTERPRISE_ID = p_enterprise_id
          AND PROFILE_GUID = l_profile_guid;

        RETURN l_profile_id;

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            x_message := 'Profile was not found.';
            RETURN NULL;

        WHEN OTHERS THEN
            x_message := friendly_error(SQLCODE, SQLERRM);
            RETURN NULL;
    END get_profile_id;


    FUNCTION add_one_rule (
        p_enterprise_id       IN NUMBER,
        p_profile_id          IN NUMBER,
        p_rule_guid_text      IN VARCHAR2,

        p_created_by          IN VARCHAR2,
        p_creation_date       IN DATE,
        p_last_updated_by     IN VARCHAR2,
        p_last_update_date    IN DATE,

        x_message             OUT VARCHAR2
    ) RETURN BOOLEAN
    IS
        l_rule_guid RAW(16);
        l_rule_id   NUMBER;
    BEGIN
        l_rule_guid := to_raw_guid(p_rule_guid_text, 'Eligibility Rule', x_message);

        IF l_rule_guid IS NULL THEN
            RETURN FALSE;
        END IF;

        BEGIN
            SELECT ELIGIBILITY_RULE_ID
            INTO l_rule_id
            FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULES
            WHERE ENTERPRISE_ID = p_enterprise_id
              AND ELIGIBILITY_RULE_GUID = l_rule_guid;

        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                x_message := 'Selected eligibility rule is not valid for this Enterprise.';
                RETURN FALSE;
        END;

        INSERT INTO PAY.PAY_ELEMENT_ELIG_PROFILE_RULES
        (
            PROFILE_ID,
            ELIGIBILITY_RULE_ID,
            CREATED_BY,
            CREATION_DATE,
            LAST_UPDATED_BY,
            LAST_UPDATE_DATE
        )
        VALUES
        (
            p_profile_id,
            l_rule_id,
            TRIM(p_created_by),
            p_creation_date,
            TRIM(p_last_updated_by),
            p_last_update_date
        );

        RETURN TRUE;

    EXCEPTION
        WHEN DUP_VAL_ON_INDEX THEN
            x_message := 'Duplicate eligibility rules are not allowed in the same profile.';
            RETURN FALSE;

        WHEN OTHERS THEN
            x_message := friendly_error(SQLCODE, SQLERRM);
            RETURN FALSE;
    END add_one_rule;


    FUNCTION insert_rules_json (
        p_enterprise_id              IN NUMBER,
        p_profile_id                 IN NUMBER,
        p_eligibility_rules_json     IN CLOB,

        p_created_by                 IN VARCHAR2,
        p_creation_date              IN DATE,
        p_last_updated_by            IN VARCHAR2,
        p_last_update_date           IN DATE,

        x_message                    OUT VARCHAR2
    ) RETURN BOOLEAN
    IS
        l_count NUMBER := 0;
    BEGIN
        IF p_eligibility_rules_json IS NULL
           OR DBMS_LOB.GETLENGTH(p_eligibility_rules_json) = 0 THEN
            x_message := 'At least one eligibility rule is required.';
            RETURN FALSE;
        END IF;

        /*
          Supported format 1:
          [
            {"eligibility_rule_guid":"..."},
            {"eligibility_rule_guid":"..."}
          ]
        */
        FOR r IN (
            SELECT NVL(rule_guid1, rule_guid2) AS rule_guid
            FROM JSON_TABLE(
                p_eligibility_rules_json,
                '$[*]'
                COLUMNS
                (
                    rule_guid1 VARCHAR2(100) PATH '$.eligibility_rule_guid' NULL ON ERROR,
                    rule_guid2 VARCHAR2(100) PATH '$.eligibilityRuleGuid'    NULL ON ERROR
                )
            )
            WHERE NVL(rule_guid1, rule_guid2) IS NOT NULL
        )
        LOOP
            l_count := l_count + 1;

            IF NOT add_one_rule(
                p_enterprise_id    => p_enterprise_id,
                p_profile_id       => p_profile_id,
                p_rule_guid_text   => r.rule_guid,
                p_created_by       => p_created_by,
                p_creation_date    => p_creation_date,
                p_last_updated_by  => p_last_updated_by,
                p_last_update_date => p_last_update_date,
                x_message          => x_message
            ) THEN
                RETURN FALSE;
            END IF;
        END LOOP;


        /*
          Supported format 2:
          ["GUID1", "GUID2"]
        */
        FOR r IN (
            SELECT rule_guid
            FROM JSON_TABLE(
                p_eligibility_rules_json,
                '$[*]'
                COLUMNS
                (
                    rule_guid VARCHAR2(100) PATH '$' NULL ON ERROR
                )
            )
            WHERE rule_guid IS NOT NULL
              AND REGEXP_LIKE(REPLACE(REPLACE(REPLACE(REPLACE(rule_guid, '-', ''), '{', ''), '}', ''), ' ', ''), '^[0-9A-Fa-f]{32}$')
        )
        LOOP
            l_count := l_count + 1;

            IF NOT add_one_rule(
                p_enterprise_id    => p_enterprise_id,
                p_profile_id       => p_profile_id,
                p_rule_guid_text   => r.rule_guid,
                p_created_by       => p_created_by,
                p_creation_date    => p_creation_date,
                p_last_updated_by  => p_last_updated_by,
                p_last_update_date => p_last_update_date,
                x_message          => x_message
            ) THEN
                RETURN FALSE;
            END IF;
        END LOOP;


        /*
          Supported format 3:
          {
            "eligibility_rules": [
              {"eligibility_rule_guid":"..."}
            ]
          }
        */
        FOR r IN (
            SELECT NVL(rule_guid1, rule_guid2) AS rule_guid
            FROM JSON_TABLE(
                p_eligibility_rules_json,
                '$.eligibility_rules[*]'
                COLUMNS
                (
                    rule_guid1 VARCHAR2(100) PATH '$.eligibility_rule_guid' NULL ON ERROR,
                    rule_guid2 VARCHAR2(100) PATH '$.eligibilityRuleGuid'    NULL ON ERROR
                )
            )
            WHERE NVL(rule_guid1, rule_guid2) IS NOT NULL
        )
        LOOP
            l_count := l_count + 1;

            IF NOT add_one_rule(
                p_enterprise_id    => p_enterprise_id,
                p_profile_id       => p_profile_id,
                p_rule_guid_text   => r.rule_guid,
                p_created_by       => p_created_by,
                p_creation_date    => p_creation_date,
                p_last_updated_by  => p_last_updated_by,
                p_last_update_date => p_last_update_date,
                x_message          => x_message
            ) THEN
                RETURN FALSE;
            END IF;
        END LOOP;


        /*
          Supported format 3B: camelCase eligibilityRules
        */
        FOR r IN (
            SELECT NVL(rule_guid1, rule_guid2) AS rule_guid
            FROM JSON_TABLE(
                p_eligibility_rules_json,
                '$.eligibilityRules[*]'
                COLUMNS
                (
                    rule_guid1 VARCHAR2(100) PATH '$.eligibility_rule_guid' NULL ON ERROR,
                    rule_guid2 VARCHAR2(100) PATH '$.eligibilityRuleGuid'    NULL ON ERROR
                )
            )
            WHERE NVL(rule_guid1, rule_guid2) IS NOT NULL
        )
        LOOP
            l_count := l_count + 1;

            IF NOT add_one_rule(
                p_enterprise_id    => p_enterprise_id,
                p_profile_id       => p_profile_id,
                p_rule_guid_text   => r.rule_guid,
                p_created_by       => p_created_by,
                p_creation_date    => p_creation_date,
                p_last_updated_by  => p_last_updated_by,
                p_last_update_date => p_last_update_date,
                x_message          => x_message
            ) THEN
                RETURN FALSE;
            END IF;
        END LOOP;


        IF l_count = 0 THEN
            x_message := 'At least one eligibility rule is required.';
            RETURN FALSE;
        END IF;

        RETURN TRUE;

    EXCEPTION
        WHEN DUP_VAL_ON_INDEX THEN
            x_message := 'Duplicate eligibility rules are not allowed in the same profile.';
            RETURN FALSE;

        WHEN OTHERS THEN
            IF UPPER(SQLERRM) LIKE '%JSON%' THEN
                x_message := 'Invalid eligibility rules JSON. Please pass a valid JSON array.';
            ELSE
                x_message := friendly_error(SQLCODE, SQLERRM);
            END IF;

            RETURN FALSE;
    END insert_rules_json;


    PROCEDURE create_profile (
        p_enterprise_id              IN  NUMBER,
        p_profile_name               IN  VARCHAR2,
        p_profile_description        IN  VARCHAR2,
        p_status                     IN  VARCHAR2,
        p_eligibility_rules_json     IN  CLOB,

        p_created_by                 IN  VARCHAR2,
        p_creation_date              IN  DATE,
        p_last_updated_by            IN  VARCHAR2,
        p_last_update_date           IN  DATE,

        x_success                    OUT VARCHAR2,
        x_message                    OUT VARCHAR2,
        x_profile_id                 OUT NUMBER,
        x_profile_guid               OUT VARCHAR2
    )
    IS
        l_status       VARCHAR2(30);
        l_profile_guid RAW(16);
    BEGIN
        SAVEPOINT pay_eel_prof_create_sp;

        x_success      := 'N';
        x_message      := NULL;
        x_profile_id   := NULL;
        x_profile_guid := NULL;

        l_status := UPPER(TRIM(NVL(p_status, 'ACTIVE')));

        IF NOT validate_enterprise(p_enterprise_id, x_message) THEN
            RETURN;
        END IF;

        IF p_profile_name IS NULL OR TRIM(p_profile_name) IS NULL THEN
            x_message := 'Profile name is required.';
            RETURN;
        END IF;

        IF NOT validate_status(l_status, x_message) THEN
            RETURN;
        END IF;

        IF NOT validate_create_who(
            p_created_by        => p_created_by,
            p_creation_date     => p_creation_date,
            p_last_updated_by   => p_last_updated_by,
            p_last_update_date  => p_last_update_date,
            x_message           => x_message
        ) THEN
            RETURN;
        END IF;

        INSERT INTO PAY.PAY_ELEMENT_ELIG_PROFILES
        (
            ENTERPRISE_ID,
            PROFILE_NAME,
            PROFILE_DESCRIPTION,
            STATUS,
            CREATED_BY,
            CREATION_DATE,
            LAST_UPDATED_BY,
            LAST_UPDATE_DATE
        )
        VALUES
        (
            p_enterprise_id,
            TRIM(p_profile_name),
            p_profile_description,
            l_status,
            TRIM(p_created_by),
            p_creation_date,
            TRIM(p_last_updated_by),
            p_last_update_date
        )
        RETURNING PROFILE_ID, PROFILE_GUID
        INTO x_profile_id, l_profile_guid;

        IF NOT insert_rules_json(
            p_enterprise_id          => p_enterprise_id,
            p_profile_id             => x_profile_id,
            p_eligibility_rules_json => p_eligibility_rules_json,
            p_created_by             => p_created_by,
            p_creation_date          => p_creation_date,
            p_last_updated_by        => p_last_updated_by,
            p_last_update_date       => p_last_update_date,
            x_message                => x_message
        ) THEN
            ROLLBACK TO pay_eel_prof_create_sp;
            x_profile_id   := NULL;
            x_profile_guid := NULL;
            RETURN;
        END IF;

        x_profile_guid := RAWTOHEX(l_profile_guid);
        x_success := 'Y';
        x_message := 'Profile created successfully.';

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK TO pay_eel_prof_create_sp;
            x_success      := 'N';
            x_profile_id   := NULL;
            x_profile_guid := NULL;
            x_message      := friendly_error(SQLCODE, SQLERRM);
    END create_profile;


    PROCEDURE update_profile (
        p_enterprise_id              IN  NUMBER,
        p_profile_guid               IN  VARCHAR2,
        p_profile_name               IN  VARCHAR2,
        p_profile_description        IN  VARCHAR2,
        p_status                     IN  VARCHAR2,
        p_eligibility_rules_json     IN  CLOB,

        p_last_updated_by            IN  VARCHAR2,
        p_last_update_date           IN  DATE,

        x_success                    OUT VARCHAR2,
        x_message                    OUT VARCHAR2
    )
    IS
        l_profile_id NUMBER;
        l_status     VARCHAR2(30);
    BEGIN
        SAVEPOINT pay_eel_prof_update_sp;

        x_success := 'N';
        x_message := NULL;

        l_status := UPPER(TRIM(NVL(p_status, 'ACTIVE')));

        IF NOT validate_enterprise(p_enterprise_id, x_message) THEN
            RETURN;
        END IF;

        IF NOT validate_update_who(
            p_last_updated_by   => p_last_updated_by,
            p_last_update_date  => p_last_update_date,
            x_message           => x_message
        ) THEN
            RETURN;
        END IF;

        IF p_profile_name IS NULL OR TRIM(p_profile_name) IS NULL THEN
            x_message := 'Profile name is required.';
            RETURN;
        END IF;

        IF NOT validate_status(l_status, x_message) THEN
            RETURN;
        END IF;

        l_profile_id := get_profile_id(p_enterprise_id, p_profile_guid, x_message);

        IF l_profile_id IS NULL THEN
            RETURN;
        END IF;

        UPDATE PAY.PAY_ELEMENT_ELIG_PROFILES
        SET
            PROFILE_NAME        = TRIM(p_profile_name),
            PROFILE_DESCRIPTION = p_profile_description,
            STATUS              = l_status,
            LAST_UPDATED_BY     = TRIM(p_last_updated_by),
            LAST_UPDATE_DATE    = p_last_update_date
        WHERE PROFILE_ID = l_profile_id
          AND ENTERPRISE_ID = p_enterprise_id;

        DELETE FROM PAY.PAY_ELEMENT_ELIG_PROFILE_RULES
        WHERE PROFILE_ID = l_profile_id;

        IF NOT insert_rules_json(
            p_enterprise_id          => p_enterprise_id,
            p_profile_id             => l_profile_id,
            p_eligibility_rules_json => p_eligibility_rules_json,
            p_created_by             => p_last_updated_by,
            p_creation_date          => p_last_update_date,
            p_last_updated_by        => p_last_updated_by,
            p_last_update_date       => p_last_update_date,
            x_message                => x_message
        ) THEN
            ROLLBACK TO pay_eel_prof_update_sp;
            RETURN;
        END IF;

        x_success := 'Y';
        x_message := 'Profile updated successfully.';

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK TO pay_eel_prof_update_sp;
            x_success := 'N';
            x_message := friendly_error(SQLCODE, SQLERRM);
    END update_profile;


    PROCEDURE delete_profile (
        p_enterprise_id              IN  NUMBER,
        p_profile_guid               IN  VARCHAR2,
        p_hard_delete                IN  VARCHAR2,

        p_last_updated_by            IN  VARCHAR2,
        p_last_update_date           IN  DATE,

        x_success                    OUT VARCHAR2,
        x_message                    OUT VARCHAR2
    )
    IS
        l_profile_id NUMBER;
    BEGIN
        x_success := 'N';
        x_message := NULL;

        IF NOT validate_enterprise(p_enterprise_id, x_message) THEN
            RETURN;
        END IF;

        IF NOT validate_update_who(
            p_last_updated_by   => p_last_updated_by,
            p_last_update_date  => p_last_update_date,
            x_message           => x_message
        ) THEN
            RETURN;
        END IF;

        l_profile_id := get_profile_id(p_enterprise_id, p_profile_guid, x_message);

        IF l_profile_id IS NULL THEN
            RETURN;
        END IF;

        IF UPPER(TRIM(NVL(p_hard_delete, 'N'))) = 'Y' THEN

            DELETE FROM PAY.PAY_ELEMENT_ELIG_PROFILES
            WHERE PROFILE_ID = l_profile_id
              AND ENTERPRISE_ID = p_enterprise_id;

            x_success := 'Y';
            x_message := 'Profile deleted successfully.';

        ELSE

            UPDATE PAY.PAY_ELEMENT_ELIG_PROFILES
            SET
                STATUS           = 'INACTIVE',
                LAST_UPDATED_BY  = TRIM(p_last_updated_by),
                LAST_UPDATE_DATE = p_last_update_date
            WHERE PROFILE_ID = l_profile_id
              AND ENTERPRISE_ID = p_enterprise_id;

            x_success := 'Y';
            x_message := 'Profile inactivated successfully.';

        END IF;

    EXCEPTION
        WHEN OTHERS THEN
            x_success := 'N';
            x_message := friendly_error(SQLCODE, SQLERRM);
    END delete_profile;


    PROCEDURE set_status (
        p_enterprise_id              IN  NUMBER,
        p_profile_guid               IN  VARCHAR2,
        p_status                     IN  VARCHAR2,

        p_last_updated_by            IN  VARCHAR2,
        p_last_update_date           IN  DATE,

        x_success                    OUT VARCHAR2,
        x_message                    OUT VARCHAR2
    )
    IS
        l_profile_id NUMBER;
        l_status     VARCHAR2(30);
    BEGIN
        x_success := 'N';
        x_message := NULL;

        l_status := UPPER(TRIM(p_status));

        IF NOT validate_enterprise(p_enterprise_id, x_message) THEN
            RETURN;
        END IF;

        IF NOT validate_update_who(
            p_last_updated_by   => p_last_updated_by,
            p_last_update_date  => p_last_update_date,
            x_message           => x_message
        ) THEN
            RETURN;
        END IF;

        IF NOT validate_status(l_status, x_message) THEN
            RETURN;
        END IF;

        l_profile_id := get_profile_id(p_enterprise_id, p_profile_guid, x_message);

        IF l_profile_id IS NULL THEN
            RETURN;
        END IF;

        UPDATE PAY.PAY_ELEMENT_ELIG_PROFILES
        SET
            STATUS           = l_status,
            LAST_UPDATED_BY  = TRIM(p_last_updated_by),
            LAST_UPDATE_DATE = p_last_update_date
        WHERE PROFILE_ID = l_profile_id
          AND ENTERPRISE_ID = p_enterprise_id;

        x_success := 'Y';
        x_message := 'Profile status updated successfully.';

    EXCEPTION
        WHEN OTHERS THEN
            x_success := 'N';
            x_message := friendly_error(SQLCODE, SQLERRM);
    END set_status;

END PAY_ELEMENT_ELIG_PROFILES_PKG;
