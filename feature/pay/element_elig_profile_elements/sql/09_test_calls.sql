-- =============================================================================
-- 09. LINK_ELEMENT and UNLINK_ELEMENT test calls
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;
SET SERVEROUTPUT ON;

PROMPT === Helper: profile GUIDs ===
SELECT
    profile_id,
    profile_guid,
    profile_name,
    status
  FROM PAY.V_PAY_ELEMENT_ELIG_PROFILES
 WHERE enterprise_id = 1
 ORDER BY profile_id DESC;

PROMPT === Helper: element GUIDs ===
SELECT
    element_id,
    RAWTOHEX(element_guid) AS element_guid,
    element_code,
    element_name
  FROM PAY.PAY_ELEMENTS
 WHERE enterprise_id = 1
 ORDER BY element_id DESC;

PROMPT === LINK_ELEMENT test ===
DECLARE
    l_profile_guid          VARCHAR2(32);
    l_element_guid          VARCHAR2(32);
    l_success               VARCHAR2(10);
    l_message               VARCHAR2(4000);
    l_profile_element_id    NUMBER;
    l_profile_element_guid  VARCHAR2(100);
BEGIN
    SELECT profile_guid
      INTO l_profile_guid
      FROM (
            SELECT profile_guid
              FROM PAY.V_PAY_ELEMENT_ELIG_PROFILES
             WHERE enterprise_id = 1
             ORDER BY profile_id DESC
           )
     WHERE ROWNUM = 1;

    SELECT RAWTOHEX(element_guid)
      INTO l_element_guid
      FROM (
            SELECT element_guid
              FROM PAY.PAY_ELEMENTS
             WHERE enterprise_id = 1
             ORDER BY element_id DESC
           )
     WHERE ROWNUM = 1;

    PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG.LINK_ELEMENT(
        p_enterprise_id           => 1,
        p_profile_guid            => l_profile_guid,
        p_element_guid            => l_element_guid,
        p_created_by              => 'ADMIN',
        p_creation_date           => SYSDATE,
        p_last_updated_by         => 'ADMIN',
        p_last_update_date        => SYSDATE,
        x_success                 => l_success,
        x_message                 => l_message,
        x_profile_element_id      => l_profile_element_id,
        x_profile_element_guid    => l_profile_element_guid
    );

    DBMS_OUTPUT.PUT_LINE('Success              : ' || l_success);
    DBMS_OUTPUT.PUT_LINE('Message              : ' || l_message);
    DBMS_OUTPUT.PUT_LINE('Profile Element ID   : ' || l_profile_element_id);
    DBMS_OUTPUT.PUT_LINE('Profile Element GUID : ' || l_profile_element_guid);

    IF NVL(l_success, 'N') <> 'Y' THEN
        RAISE_APPLICATION_ERROR(-20020, 'LINK_ELEMENT failed: ' || l_message);
    END IF;

    DBMS_OUTPUT.PUT_LINE('--- UNLINK_ELEMENT test ---');

    PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG.UNLINK_ELEMENT(
        p_enterprise_id => 1,
        p_profile_guid  => l_profile_guid,
        p_element_guid  => l_element_guid,
        x_success       => l_success,
        x_message       => l_message
    );

    DBMS_OUTPUT.PUT_LINE('Success : ' || l_success);
    DBMS_OUTPUT.PUT_LINE('Message : ' || l_message);

    IF NVL(l_success, 'N') <> 'Y' THEN
        RAISE_APPLICATION_ERROR(-20021, 'UNLINK_ELEMENT failed: ' || l_message);
    END IF;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20022, 'No profile or element found for enterprise 1.');
END;
/

PROMPT === View check (linked elements) ===
SELECT
    profile_id,
    profile_guid,
    profile_name,
    linked_element_count,
    DBMS_LOB.SUBSTR(linked_elements_json, 4000, 1) AS linked_elements_json_preview
  FROM PAY.V_PAY_ELEMENT_ELIG_PROFILES
 WHERE enterprise_id = 1
   AND ROWNUM <= 5
 ORDER BY profile_id DESC;

PROMPT 09_test_calls.sql completed.
