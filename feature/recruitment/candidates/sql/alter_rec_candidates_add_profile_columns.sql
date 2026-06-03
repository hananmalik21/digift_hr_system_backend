-- =============================================================================
-- REC.CANDIDATES — professional profile & compensation columns
-- Run as REC (or user with ALTER on REC.CANDIDATES).
-- =============================================================================

ALTER TABLE REC.CANDIDATES ADD (
  CURRENT_SALARY       NUMBER,
  PORTFOLIO_LINK       VARCHAR2(1000),
  GITHUB_LINK          VARCHAR2(1000),
  WILLING_TO_RELOCATE  VARCHAR2(1) DEFAULT 'N'
);

UPDATE REC.CANDIDATES SET WILLING_TO_RELOCATE = 'N' WHERE WILLING_TO_RELOCATE IS NULL;

ALTER TABLE REC.CANDIDATES ADD CONSTRAINT CHK_REC_CANDIDATES_WILLING_RELOC
  CHECK (WILLING_TO_RELOCATE IN ('Y', 'N'));

-- If REC.CANDIDATES_FULL_V lists columns explicitly, add the four columns to its SELECT.
-- Views built as SELECT c.* FROM REC.CANDIDATES c pick up new columns automatically.
