CREATE OR REPLACE PACKAGE BODY PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG AS

    FUNCTION friendly_error (
        p_sqlcode IN NUMBER,
        p_sqlerrm IN VARCHAR2
    ) RETURN VARCHAR2
    IS
    BEGIN
        IF p_sqlcode = -1 THEN
            RETURN 'This Profile is already linked with this Element.';
        ELSIF p_sqlcode = -2291 THEN
            RETURN 'Selected Profile or Element is invalid. Please choose valid values.';
        ELSIF p_sqlcode = -1400 THEN
            RETURN 'Required information is missing. Please complete all mandatory fields.';
        ELSIF p_sqlcode = -4098 THEN
            RETURN 'Profile Element link setup is not complete. Please contact support.';
        ELSE
            RETURN 'Unable to process Profile Element link. Please review the selected values and try again.';
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
            x_message := 'Selected Profile is not valid for this Enterprise.';
            RETURN NULL;

        WHEN OTHERS THEN
            x_message := friendly_error(SQLCODE, SQLERRM);
            RETURN NULL;
    END get_profile_id;


    FUNCTION get_element_id (
        p_enterprise_id IN NUMBER,
        p_element_guid  IN VARCHAR2,
        x_message       OUT VARCHAR2
    ) RETURN NUMBER
    IS
        l_element_guid RAW(16);
        l_element_id   NUMBER;
    BEGIN
        l_element_guid := to_raw_guid(p_element_guid, 'Element', x_message);

        IF l_element_guid IS NULL THEN
            RETURN NULL;
        END IF;

        SELECT ELEMENT_ID
          INTO l_element_id
          FROM PAY.PAY_ELEMENTS
         WHERE ENTERPRISE_ID = p_enterprise_id
           AND ELEMENT_GUID = l_element_guid;

        RETURN l_element_id;

    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            x_message := 'Selected Element is not valid for this Enterprise.';
            RETURN NULL;

        WHEN OTHERS THEN
            x_message := friendly_error(SQLCODE, SQLERRM);
            RETURN NULL;
    END get_element_id;


    PROCEDURE link_element (
        p_enterprise_id        IN  NUMBER,
        p_profile_guid         IN  VARCHAR2,
        p_element_guid         IN  VARCHAR2,

        p_created_by           IN  VARCHAR2,
        p_creation_date        IN  DATE,
        p_last_updated_by      IN  VARCHAR2,
        p_last_update_date     IN  DATE,

        x_success              OUT VARCHAR2,
        x_message              OUT VARCHAR2,
        x_profile_element_id   OUT NUMBER,
        x_profile_element_guid OUT VARCHAR2
    )
    IS
        l_profile_id NUMBER;
        l_element_id NUMBER;
        l_dup_count  NUMBER;
    BEGIN
        x_success              := 'N';
        x_message              := NULL;
        x_profile_element_id   := NULL;
        x_profile_element_guid := NULL;

        IF NOT validate_enterprise(p_enterprise_id, x_message) THEN
            RETURN;
        END IF;

        IF NOT validate_create_who(
            p_created_by,
            p_creation_date,
            p_last_updated_by,
            p_last_update_date,
            x_message
        ) THEN
            RETURN;
        END IF;

        l_profile_id := get_profile_id(p_enterprise_id, p_profile_guid, x_message);
        IF l_profile_id IS NULL THEN
            RETURN;
        END IF;

        l_element_id := get_element_id(p_enterprise_id, p_element_guid, x_message);
        IF l_element_id IS NULL THEN
            RETURN;
        END IF;

        SELECT COUNT(*)
          INTO l_dup_count
          FROM PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS
         WHERE PROFILE_ID = l_profile_id
           AND ELEMENT_ID = l_element_id;

        IF l_dup_count > 0 THEN
            x_message := 'This Profile is already linked with this Element.';
            RETURN;
        END IF;

        INSERT INTO PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS (
            PROFILE_ID,
            ELEMENT_ID,
            CREATED_BY,
            CREATION_DATE,
            LAST_UPDATED_BY,
            LAST_UPDATE_DATE
        ) VALUES (
            l_profile_id,
            l_element_id,
            TRIM(p_created_by),
            p_creation_date,
            TRIM(p_last_updated_by),
            p_last_update_date
        )
        RETURNING PROFILE_ELEMENT_ID, RAWTOHEX(PROFILE_ELEMENT_GUID)
             INTO x_profile_element_id, x_profile_element_guid;

        x_success := 'Y';
        x_message := 'Profile linked with Element successfully.';

    EXCEPTION
        WHEN OTHERS THEN
            x_success              := 'N';
            x_profile_element_id   := NULL;
            x_profile_element_guid := NULL;
            x_message              := friendly_error(SQLCODE, SQLERRM);
    END link_element;


    PROCEDURE unlink_element (
        p_enterprise_id IN  NUMBER,
        p_profile_guid  IN  VARCHAR2,
        p_element_guid  IN  VARCHAR2,

        x_success       OUT VARCHAR2,
        x_message       OUT VARCHAR2
    )
    IS
        l_profile_id NUMBER;
        l_element_id NUMBER;
        l_deleted    NUMBER;
    BEGIN
        x_success := 'N';
        x_message := NULL;

        IF NOT validate_enterprise(p_enterprise_id, x_message) THEN
            RETURN;
        END IF;

        l_profile_id := get_profile_id(p_enterprise_id, p_profile_guid, x_message);
        IF l_profile_id IS NULL THEN
            RETURN;
        END IF;

        l_element_id := get_element_id(p_enterprise_id, p_element_guid, x_message);
        IF l_element_id IS NULL THEN
            RETURN;
        END IF;

        DELETE FROM PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS
         WHERE PROFILE_ID = l_profile_id
           AND ELEMENT_ID = l_element_id;

        l_deleted := SQL%ROWCOUNT;

        IF l_deleted = 0 THEN
            x_message := 'Profile Element link was not found.';
            RETURN;
        END IF;

        x_success := 'Y';
        x_message := 'Profile unlinked from Element successfully.';

    EXCEPTION
        WHEN OTHERS THEN
            x_success := 'N';
            x_message := friendly_error(SQLCODE, SQLERRM);
    END unlink_element;

END PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG;
/
