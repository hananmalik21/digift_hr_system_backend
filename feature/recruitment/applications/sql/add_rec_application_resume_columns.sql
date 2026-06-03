-- Resume storage on REC.REC_APPLICATIONS (run as REC schema owner).
-- After applying, expose RESUME_FILE_NAME, RESUME_FILE_TYPE, RESUME_FILE_SIZE on REC.V_APPLICATIONS
-- (do not select RESUME_FILE_CONTENT in the view — use download API).

ALTER TABLE REC.REC_APPLICATIONS ADD (
  RESUME_FILE_NAME    VARCHAR2(500),
  RESUME_FILE_TYPE    VARCHAR2(200),
  RESUME_FILE_SIZE    NUMBER,
  RESUME_FILE_CONTENT BLOB
);

-- Example V_APPLICATIONS column additions — see rec_v_applications_add_resume_url_columns.sql
-- for HAS_RESUME and RESUME_URL computed expressions.
