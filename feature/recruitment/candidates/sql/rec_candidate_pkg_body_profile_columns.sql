-- =============================================================================
-- REC.CANDIDATE_PKG — merge these helpers and column bindings into the existing
-- package body (do NOT deploy this file as a full body replacement).
-- =============================================================================

-- ----- Private helpers (add near top of PACKAGE BODY) -----

/*
  FUNCTION trim_link(p_value IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    IF p_value IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN NULLIF(TRIM(p_value), '');
  END trim_link;

  FUNCTION resolve_willing_to_relocate(
    p_value      IN VARCHAR2,
    p_for_update IN BOOLEAN,
    p_status     OUT VARCHAR2,
    p_message    OUT VARCHAR2
  ) RETURN VARCHAR2 IS
    v VARCHAR2(1);
  BEGIN
    p_status  := NULL;
    p_message := NULL;

    IF p_value IS NULL OR TRIM(p_value) IS NULL THEN
      IF p_for_update THEN
        RETURN NULL;
      END IF;
      RETURN 'N';
    END IF;

    v := UPPER(TRIM(p_value));
    IF v NOT IN ('Y', 'N') THEN
      p_status  := 'ERROR';
      p_message := 'willing_to_relocate must be Y or N';
      RETURN NULL;
    END IF;
    RETURN v;
  END resolve_willing_to_relocate;
*/

-- ----- CREATE_CANDIDATE / UPDATE_CANDIDATE: demographic binds -----
-- p_date_of_birth, p_gender, p_nationality, p_visa_status,
-- p_alternate_phone, p_alternate_email, p_preferred_location, p_source_from
-- (API field `dob` maps to p_date_of_birth)

-- ----- CREATE_CANDIDATE: add to INSERT -----
-- CURRENT_SALARY, PORTFOLIO_LINK, GITHUB_LINK, WILLING_TO_RELOCATE
-- p_current_salary, trim_link(p_portfolio_link), trim_link(p_github_link), v_willing_to_relocate

-- ----- UPDATE_CANDIDATE: add to SET -----
-- CURRENT_SALARY = p_current_salary,
-- PORTFOLIO_LINK = trim_link(p_portfolio_link),
-- GITHUB_LINK = trim_link(p_github_link),
-- WILLING_TO_RELOCATE = NVL(v_willing_to_relocate, WILLING_TO_RELOCATE)
