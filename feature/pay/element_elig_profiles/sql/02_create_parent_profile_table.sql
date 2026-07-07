-- =============================================================================
-- 02. Create PAY.PAY_ELEMENT_ELIG_PROFILES
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

DECLARE
  l_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_count
    FROM all_tables
   WHERE owner = 'PAY'
     AND table_name = 'PAY_ELEMENT_ELIG_PROFILES';

  IF l_count > 0 THEN
    DBMS_OUTPUT.PUT_LINE('PAY_ELEMENT_ELIG_PROFILES already exists.');
    RETURN;
  END IF;

  EXECUTE IMMEDIATE '
    CREATE TABLE PAY.PAY_ELEMENT_ELIG_PROFILES (
      PROFILE_ID            NUMBER          NOT NULL,
      PROFILE_GUID          RAW(16)         DEFAULT SYS_GUID() NOT NULL,
      ENTERPRISE_ID         NUMBER          NOT NULL,
      PROFILE_NAME          VARCHAR2(240)   NOT NULL,
      PROFILE_DESCRIPTION   VARCHAR2(1000),
      STATUS                VARCHAR2(30)    DEFAULT ''ACTIVE'' NOT NULL,
      CREATED_BY            VARCHAR2(100)   NOT NULL,
      CREATION_DATE         DATE            NOT NULL,
      LAST_UPDATED_BY       VARCHAR2(100)   NOT NULL,
      LAST_UPDATE_DATE      DATE            NOT NULL,
      CONSTRAINT PAY_EEL_PROFILES_PK PRIMARY KEY (PROFILE_ID),
      CONSTRAINT PAY_EEL_PROFILES_GUID_UK UNIQUE (PROFILE_GUID),
      CONSTRAINT PAY_EEL_PROFILES_NAME_UK UNIQUE (ENTERPRISE_ID, PROFILE_NAME),
      CONSTRAINT PAY_EEL_PROFILES_STATUS_CK CHECK (STATUS IN (''ACTIVE'', ''INACTIVE''))
    )';

  DBMS_OUTPUT.PUT_LINE('Created PAY_ELEMENT_ELIG_PROFILES.');
END;
/

PROMPT 02_create_parent_profile_table.sql completed.
