-- =============================================================================
-- REC.CANDIDATES — demographic / alternate-contact columns
-- Run as REC (or user with ALTER on REC.CANDIDATES).
-- Columns are expected to already exist in environments where the API is deployed;
-- this script documents the DDL for local / migration use.
-- =============================================================================

ALTER TABLE REC.CANDIDATES ADD (
  DATE_OF_BIRTH       DATE,
  GENDER              VARCHAR2(50),
  NATIONALITY         VARCHAR2(200),
  VISA_STATUS         VARCHAR2(100),
  ALTERNATE_PHONE     VARCHAR2(50),
  ALTERNATE_EMAIL     VARCHAR2(320),
  PREFERRED_LOCATION  VARCHAR2(500),
  SOURCE_FROM         VARCHAR2(500)
);

-- Next: refresh REC.CANDIDATES_FULL_V (rec_candidates_full_v_add_profile_columns.sql)
-- and ensure REC.CANDIDATE_PKG CREATE_CANDIDATE / UPDATE_CANDIDATE accept the new params.
