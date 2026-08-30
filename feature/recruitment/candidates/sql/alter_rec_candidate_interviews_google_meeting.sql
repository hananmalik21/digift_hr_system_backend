-- =============================================================================
-- REC.CANDIDATE_INTERVIEWS — Google Meet / Calendar metadata columns
-- Idempotent column adds for OAuth-based Google Meet integration.
-- =============================================================================

DECLARE
    PROCEDURE add_column_if_missing(p_column_name VARCHAR2, p_ddl VARCHAR2) IS
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*)
          INTO v_count
          FROM all_tab_columns
         WHERE owner = 'REC'
           AND table_name = 'CANDIDATE_INTERVIEWS'
           AND column_name = p_column_name;

        IF v_count = 0 THEN
            EXECUTE IMMEDIATE p_ddl;
        END IF;
    END;
BEGIN
    add_column_if_missing('MEETING_PROVIDER', 'ALTER TABLE REC.CANDIDATE_INTERVIEWS ADD (MEETING_PROVIDER VARCHAR2(50))');
    add_column_if_missing('GOOGLE_EVENT_ID', 'ALTER TABLE REC.CANDIDATE_INTERVIEWS ADD (GOOGLE_EVENT_ID VARCHAR2(255))');
    add_column_if_missing('GOOGLE_MEET_CODE', 'ALTER TABLE REC.CANDIDATE_INTERVIEWS ADD (GOOGLE_MEET_CODE VARCHAR2(100))');
    add_column_if_missing('GOOGLE_CALENDAR_URL', 'ALTER TABLE REC.CANDIDATE_INTERVIEWS ADD (GOOGLE_CALENDAR_URL VARCHAR2(1000))');
    add_column_if_missing('GOOGLE_ORGANIZER_EMAIL', 'ALTER TABLE REC.CANDIDATE_INTERVIEWS ADD (GOOGLE_ORGANIZER_EMAIL VARCHAR2(320))');
    add_column_if_missing('MEETING_STATUS', 'ALTER TABLE REC.CANDIDATE_INTERVIEWS ADD (MEETING_STATUS VARCHAR2(50))');
    add_column_if_missing('MEETING_CREATED_DATE', 'ALTER TABLE REC.CANDIDATE_INTERVIEWS ADD (MEETING_CREATED_DATE TIMESTAMP(6) WITH TIME ZONE)');
END;
/
