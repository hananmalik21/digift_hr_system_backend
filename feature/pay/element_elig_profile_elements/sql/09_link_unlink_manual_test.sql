-- =============================================================================
-- 09b. Manual LINK_ELEMENT / UNLINK_ELEMENT test calls (paste GUIDs)
-- =============================================================================

SET SERVEROUTPUT ON;

PROMPT === Helper: Get profile GUID ===
SELECT
    profile_id,
    profile_guid,
    profile_name,
    status
  FROM PAY.V_PAY_ELEMENT_ELIG_PROFILES
 WHERE enterprise_id = 1
 ORDER BY profile_id DESC;

PROMPT === Helper: Get element GUID ===
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
    l_success               VARCHAR2(10);
    l_message               VARCHAR2(4000);
    l_profile_element_id    NUMBER;
    l_profile_element_guid  VARCHAR2(100);
BEGIN
    PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG.LINK_ELEMENT(
        p_enterprise_id           => 1,
        p_profile_guid            => 'PASTE_PROFILE_GUID_HERE',
        p_element_guid            => 'PASTE_ELEMENT_GUID_HERE',

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
END;
/

PROMPT === UNLINK_ELEMENT test ===
DECLARE
    l_success VARCHAR2(10);
    l_message VARCHAR2(4000);
BEGIN
    PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG.UNLINK_ELEMENT(
        p_enterprise_id => 1,
        p_profile_guid  => 'PASTE_PROFILE_GUID_HERE',
        p_element_guid  => 'PASTE_ELEMENT_GUID_HERE',

        x_success       => l_success,
        x_message       => l_message
    );

    DBMS_OUTPUT.PUT_LINE('Success : ' || l_success);
    DBMS_OUTPUT.PUT_LINE('Message : ' || l_message);
END;
/
