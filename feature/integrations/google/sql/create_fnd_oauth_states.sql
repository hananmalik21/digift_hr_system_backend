-- =============================================================================
-- FNDSEC.FND_OAUTH_STATES — short-lived OAuth state tokens
-- =============================================================================

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*)
      INTO v_count
      FROM all_tables
     WHERE owner = 'FNDSEC'
       AND table_name = 'FND_OAUTH_STATES';

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE '
            CREATE TABLE FNDSEC.FND_OAUTH_STATES (
                STATE_TOKEN     VARCHAR2(128) NOT NULL,
                ENTERPRISE_ID   NUMBER NOT NULL,
                USER_ID         NUMBER NOT NULL,
                PROVIDER_CODE   VARCHAR2(50) NOT NULL,
                EXPIRES_AT      TIMESTAMP(6) WITH TIME ZONE NOT NULL,
                CREATION_DATE   DATE DEFAULT SYSDATE NOT NULL,
                CONSTRAINT FND_OAUTH_STATES_PK PRIMARY KEY (STATE_TOKEN)
            )';

        EXECUTE IMMEDIATE '
            CREATE INDEX FNDSEC.FND_OAUTH_STATES_N1
                ON FNDSEC.FND_OAUTH_STATES (EXPIRES_AT)';
    END IF;
END;
/
