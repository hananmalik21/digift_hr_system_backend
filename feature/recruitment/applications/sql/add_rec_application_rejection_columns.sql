-- Rejection fields on REC.REC_APPLICATIONS (run as REC schema owner).
-- After applying, add the same columns to REC.V_APPLICATIONS if list/detail reads use the view.

ALTER TABLE REC.REC_APPLICATIONS ADD (
  REJECTION_REASON_CODE VARCHAR2(50),
  REJECTION_COMMENTS    CLOB,
  REJECTION_EMAIL_FLAG  CHAR(1) DEFAULT 'N' CHECK (REJECTION_EMAIL_FLAG IN ('Y', 'N'))
);

-- Example view column additions (adjust to your existing V_APPLICATIONS definition):
-- REJECTION_REASON_CODE,
-- REJECTION_COMMENTS,
-- REJECTION_EMAIL_FLAG
