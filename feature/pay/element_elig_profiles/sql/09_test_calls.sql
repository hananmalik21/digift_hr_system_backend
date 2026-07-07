-- =============================================================================
-- 09. Smoke-test PAY.PAY_ELEMENT_ELIG_PROFILES_PKG procedures and view
-- Requires at least one ACTIVE eligibility rule for enterprise 1.
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;
SET SERVEROUTPUT ON;

PROMPT === 11. CREATE_PROFILE test ===
DECLARE
    l_enterprise_id   NUMBER := 1;
    l_rule_guid_hex   VARCHAR2(32);
    l_rules_json      CLOB;
    l_success         VARCHAR2(10);
    l_message         VARCHAR2(4000);
    l_profile_id      NUMBER;
    l_profile_guid    VARCHAR2(32);
    l_now             DATE := SYSDATE;
BEGIN
    SELECT RAWTOHEX(ELIGIBILITY_RULE_GUID)
      INTO l_rule_guid_hex
      FROM (
            SELECT ELIGIBILITY_RULE_GUID
              FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULES
             WHERE ENTERPRISE_ID = l_enterprise_id
               AND STATUS = 'ACTIVE'
             ORDER BY ELIGIBILITY_RULE_ID
           )
     WHERE ROWNUM = 1;

    l_rules_json := '[{"eligibility_rule_guid":"' || l_rule_guid_hex || '"}]';

    PAY.PAY_ELEMENT_ELIG_PROFILES_PKG.CREATE_PROFILE(
        p_enterprise_id          => l_enterprise_id,
        p_profile_name           => 'API Test Profile ' || TO_CHAR(SYSTIMESTAMP, 'YYYYMMDDHH24MISS'),
        p_profile_description    => 'Created by 09_test_calls.sql',
        p_status                 => 'ACTIVE',
        p_eligibility_rules_json => l_rules_json,
        p_created_by             => 'TEST_USER',
        p_creation_date          => l_now,
        p_last_updated_by        => 'TEST_USER',
        p_last_update_date       => l_now,
        x_success                => l_success,
        x_message                => l_message,
        x_profile_id             => l_profile_id,
        x_profile_guid           => l_profile_guid
    );

    DBMS_OUTPUT.PUT_LINE('CREATE success=' || l_success || ' message=' || l_message);
    DBMS_OUTPUT.PUT_LINE('profile_id=' || l_profile_id || ' profile_guid=' || l_profile_guid);

    IF NVL(l_success, 'N') <> 'Y' THEN
        RAISE_APPLICATION_ERROR(-20010, 'CREATE_PROFILE failed: ' || l_message);
    END IF;

    DBMS_OUTPUT.PUT_LINE('--- UPDATE_PROFILE test ---');

    l_rules_json := '["' || l_rule_guid_hex || '"]';

    PAY.PAY_ELEMENT_ELIG_PROFILES_PKG.UPDATE_PROFILE(
        p_enterprise_id          => l_enterprise_id,
        p_profile_guid           => l_profile_guid,
        p_profile_name           => 'API Test Profile Updated',
        p_profile_description    => 'Updated by 09_test_calls.sql',
        p_status                 => 'ACTIVE',
        p_eligibility_rules_json => l_rules_json,
        p_last_updated_by        => 'TEST_USER',
        p_last_update_date       => SYSDATE,
        x_success                => l_success,
        x_message                => l_message
    );

    DBMS_OUTPUT.PUT_LINE('UPDATE success=' || l_success || ' message=' || l_message);

    IF NVL(l_success, 'N') <> 'Y' THEN
        RAISE_APPLICATION_ERROR(-20011, 'UPDATE_PROFILE failed: ' || l_message);
    END IF;

    DBMS_OUTPUT.PUT_LINE('--- SET_STATUS test ---');

    PAY.PAY_ELEMENT_ELIG_PROFILES_PKG.SET_STATUS(
        p_enterprise_id       => l_enterprise_id,
        p_profile_guid        => l_profile_guid,
        p_status              => 'INACTIVE',
        p_last_updated_by     => 'TEST_USER',
        p_last_update_date    => SYSDATE,
        x_success             => l_success,
        x_message             => l_message
    );

    DBMS_OUTPUT.PUT_LINE('SET_STATUS success=' || l_success || ' message=' || l_message);

    IF NVL(l_success, 'N') <> 'Y' THEN
        RAISE_APPLICATION_ERROR(-20012, 'SET_STATUS failed: ' || l_message);
    END IF;

    DBMS_OUTPUT.PUT_LINE('--- DELETE_PROFILE soft delete test ---');

    PAY.PAY_ELEMENT_ELIG_PROFILES_PKG.DELETE_PROFILE(
        p_enterprise_id       => l_enterprise_id,
        p_profile_guid        => l_profile_guid,
        p_hard_delete         => 'N',
        p_last_updated_by     => 'TEST_USER',
        p_last_update_date    => SYSDATE,
        x_success             => l_success,
        x_message             => l_message
    );

    DBMS_OUTPUT.PUT_LINE('DELETE (soft) success=' || l_success || ' message=' || l_message);

    IF NVL(l_success, 'N') <> 'Y' THEN
        RAISE_APPLICATION_ERROR(-20013, 'DELETE_PROFILE failed: ' || l_message);
    END IF;

    DBMS_OUTPUT.PUT_LINE('--- DELETE_PROFILE hard delete test ---');

    PAY.PAY_ELEMENT_ELIG_PROFILES_PKG.DELETE_PROFILE(
        p_enterprise_id       => l_enterprise_id,
        p_profile_guid        => l_profile_guid,
        p_hard_delete         => 'Y',
        p_last_updated_by     => 'TEST_USER',
        p_last_update_date    => SYSDATE,
        x_success             => l_success,
        x_message             => l_message
    );

    DBMS_OUTPUT.PUT_LINE('DELETE (hard) success=' || l_success || ' message=' || l_message);

    IF NVL(l_success, 'N') <> 'Y' THEN
        RAISE_APPLICATION_ERROR(-20014, 'DELETE_PROFILE hard failed: ' || l_message);
    END IF;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20015, 'No ACTIVE eligibility rule found for enterprise ' || l_enterprise_id);
END;
/

PROMPT === 15. View test query ===
SELECT
    PROFILE_ID,
    PROFILE_GUID,
    ENTERPRISE_ID,
    PROFILE_NAME,
    STATUS,
    ELIGIBILITY_RULE_COUNT,
    DBMS_LOB.SUBSTR(ELIGIBILITY_RULES_JSON, 4000, 1) AS ELIGIBILITY_RULES_JSON_PREVIEW
  FROM PAY.V_PAY_ELEMENT_ELIG_PROFILES
 WHERE ROWNUM <= 5
 ORDER BY CREATION_DATE DESC;

PROMPT 09_test_calls.sql completed.
