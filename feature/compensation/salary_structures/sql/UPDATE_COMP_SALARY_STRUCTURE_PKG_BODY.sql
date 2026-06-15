-- =============================================================================
-- COMP.UPDATE_COMP_SALARY_STRUCTURE_PKG — package body
-- Deploy after UPDATE_COMP_SALARY_STRUCTURE_PKG_SPEC.sql
-- Uses COMP.CREATE_COMP_SALARY_STRUCTURE_PKG.GET_SCOPE_ORG_UNITS_JSON for org expansion.
-- =============================================================================

CREATE OR REPLACE PACKAGE BODY COMP.UPDATE_COMP_SALARY_STRUCTURE_PKG AS

  G_USER_ERROR_CODE CONSTANT NUMBER := -20001;

  ---------------------------------------------------------------------------
  -- Helpers
  ---------------------------------------------------------------------------
  PROCEDURE raise_err(p_msg IN VARCHAR2) IS
  BEGIN
    RAISE_APPLICATION_ERROR(G_USER_ERROR_CODE, p_msg);
  END raise_err;

  FUNCTION normalize_yn(p_val IN CHAR, p_default IN CHAR DEFAULT 'N') RETURN CHAR IS
  BEGIN
    IF p_val IS NULL THEN
      RETURN p_default;
    END IF;
    IF UPPER(TRIM(p_val)) = 'Y' THEN
      RETURN 'Y';
    END IF;
    RETURN 'N';
  END normalize_yn;

  FUNCTION is_blank_json(p_json IN CLOB) RETURN BOOLEAN IS
    l_txt VARCHAR2(32767);
  BEGIN
    IF p_json IS NULL THEN
      RETURN TRUE;
    END IF;
    l_txt := TRIM(p_json);
    RETURN l_txt IS NULL OR l_txt = '[]';
  END is_blank_json;

  FUNCTION hex_to_raw(p_hex IN VARCHAR2) RETURN RAW IS
    l_hex VARCHAR2(32);
  BEGIN
    IF p_hex IS NULL OR TRIM(p_hex) IS NULL THEN
      RETURN NULL;
    END IF;
    l_hex := UPPER(REPLACE(TRIM(p_hex), '-', ''));
    IF LENGTH(l_hex) <> 32 OR NOT REGEXP_LIKE(l_hex, '^[0-9A-F]{32}$') THEN
      raise_err('Invalid org unit or position identifier. Expected 32-character hexadecimal string.');
    END IF;
    RETURN HEXTORAW(l_hex);
  END hex_to_raw;

  PROCEDURE assert_country_code(
    p_enterprise_id IN NUMBER,
    p_country_code  IN VARCHAR2
  ) IS
    l_cnt NUMBER;
  BEGIN
    IF p_country_code IS NULL OR TRIM(p_country_code) IS NULL THEN
      raise_err('Country code is required for org scope.');
    END IF;

    SELECT COUNT(*)
      INTO l_cnt
      FROM ent.ent_lookup_values lv
      JOIN ent.ent_lookup_types lt
        ON lt.lookup_type_id = lv.lookup_type_id
     WHERE UPPER(TRIM(lt.lookup_type_code)) = 'COUNTRY'
       AND UPPER(TRIM(lv.lookup_value_code)) = UPPER(TRIM(p_country_code))
       AND NVL(lv.active_flag, 'Y') = 'Y'
       AND (lv.enterprise_id IS NULL OR lv.enterprise_id = p_enterprise_id);

    IF l_cnt = 0 THEN
      raise_err('Invalid country_code: ' || TRIM(p_country_code));
    END IF;
  END assert_country_code;

  PROCEDURE assert_effective_dates(
    p_effective_from IN DATE,
    p_effective_to     IN DATE
  ) IS
  BEGIN
    IF p_effective_from IS NOT NULL
       AND p_effective_to IS NOT NULL
       AND p_effective_to < p_effective_from THEN
      raise_err('effective_to must be on or after effective_from.');
    END IF;
  END assert_effective_dates;

  PROCEDURE assert_fin_effective_dates(
    p_fin_effective_from IN DATE,
    p_fin_effective_to   IN DATE
  ) IS
  BEGIN
    IF p_fin_effective_from IS NOT NULL
       AND p_fin_effective_to IS NOT NULL
       AND p_fin_effective_to < p_fin_effective_from THEN
      raise_err('Financial effective_to must be on or after financial effective_from.');
    END IF;
  END assert_fin_effective_dates;

  FUNCTION resolve_country_code(
    p_country_code     IN VARCHAR2,
    p_structure_id     IN NUMBER,
    p_enterprise_id    IN NUMBER
  ) RETURN VARCHAR2 IS
    l_country_code comp.comp_salary_org_scope.country_code%TYPE;
  BEGIN
    IF p_country_code IS NOT NULL AND TRIM(p_country_code) IS NOT NULL THEN
      RETURN UPPER(TRIM(p_country_code));
    END IF;

    BEGIN
      SELECT country_code
        INTO l_country_code
        FROM comp.comp_salary_org_scope
       WHERE salary_structure_id = p_structure_id
         AND enterprise_id = p_enterprise_id
         AND ROWNUM = 1;
      RETURN l_country_code;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        raise_err('country_code is required when updating org scope.');
    END;
  END resolve_country_code;

  ---------------------------------------------------------------------------
  -- Org scope: delete + reinsert using expanded hierarchy (no employee categories)
  ---------------------------------------------------------------------------
  PROCEDURE sync_org_scope(
    p_structure_id        IN NUMBER,
    p_enterprise_id       IN NUMBER,
    p_country_code        IN VARCHAR2,
    p_business_units_json IN CLOB,
    p_updated_by          IN VARCHAR2
  ) IS
    l_country_code   comp.comp_salary_org_scope.country_code%TYPE;
    l_expanded_json  CLOB;
  BEGIN
    l_country_code := resolve_country_code(p_country_code, p_structure_id, p_enterprise_id);
    assert_country_code(p_enterprise_id, l_country_code);

    DELETE FROM comp.comp_salary_org_scope
     WHERE salary_structure_id = p_structure_id;

    IF is_blank_json(p_business_units_json) THEN
      INSERT INTO comp.comp_salary_org_scope (
        org_scope_id,
        salary_structure_id,
        enterprise_id,
        country_code,
        business_unit_id,
        created_by,
        creation_date,
        last_updated_by,
        last_update_date
      ) VALUES (
        comp.comp_salary_org_scope_seq.NEXTVAL,
        p_structure_id,
        p_enterprise_id,
        l_country_code,
        NULL,
        p_updated_by,
        SYSDATE,
        p_updated_by,
        SYSDATE
      );
      RETURN;
    END IF;

    l_expanded_json := comp.create_comp_salary_structure_pkg.get_scope_org_units_json(
      p_enterprise_id       => p_enterprise_id,
      p_business_units_json => p_business_units_json
    );

    IF is_blank_json(l_expanded_json) THEN
      INSERT INTO comp.comp_salary_org_scope (
        org_scope_id,
        salary_structure_id,
        enterprise_id,
        country_code,
        business_unit_id,
        created_by,
        creation_date,
        last_updated_by,
        last_update_date
      ) VALUES (
        comp.comp_salary_org_scope_seq.NEXTVAL,
        p_structure_id,
        p_enterprise_id,
        l_country_code,
        NULL,
        p_updated_by,
        SYSDATE,
        p_updated_by,
        SYSDATE
      );
      RETURN;
    END IF;

    INSERT INTO comp.comp_salary_org_scope (
      org_scope_id,
      salary_structure_id,
      enterprise_id,
      country_code,
      business_unit_id,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    SELECT comp.comp_salary_org_scope_seq.NEXTVAL,
           p_structure_id,
           p_enterprise_id,
           l_country_code,
           hex_to_raw(jt.org_unit_hex),
           p_updated_by,
           SYSDATE,
           p_updated_by,
           SYSDATE
      FROM JSON_TABLE(
             l_expanded_json,
             '$[*]'
             COLUMNS (
               org_unit_hex VARCHAR2(32) PATH '$'
             )
           ) jt
     WHERE jt.org_unit_hex IS NOT NULL;
  END sync_org_scope;

  ---------------------------------------------------------------------------
  -- Employment types child table
  ---------------------------------------------------------------------------
  PROCEDURE sync_employment_types(
    p_structure_id          IN NUMBER,
    p_enterprise_id         IN NUMBER,
    p_employment_types_json IN CLOB,
    p_updated_by            IN VARCHAR2
  ) IS
  BEGIN
    DELETE FROM comp.comp_sal_employment_types
     WHERE salary_structure_id = p_structure_id;

    IF is_blank_json(p_employment_types_json) THEN
      RETURN;
    END IF;

    INSERT INTO comp.comp_sal_employment_types (
      salary_structure_employment_type_id,
      salary_structure_id,
      enterprise_id,
      employment_type_code,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    SELECT comp.comp_sal_employment_types_seq.NEXTVAL,
           p_structure_id,
           p_enterprise_id,
           UPPER(TRIM(jt.employment_type_code)),
           p_updated_by,
           SYSDATE,
           p_updated_by,
           SYSDATE
      FROM JSON_TABLE(
             p_employment_types_json,
             '$[*]'
             COLUMNS (
               employment_type_code VARCHAR2(60) PATH '$'
             )
           ) jt
     WHERE jt.employment_type_code IS NOT NULL
       AND TRIM(jt.employment_type_code) IS NOT NULL;
  END sync_employment_types;

  ---------------------------------------------------------------------------
  -- Components
  ---------------------------------------------------------------------------
  PROCEDURE sync_components(
    p_structure_id   IN NUMBER,
    p_enterprise_id  IN NUMBER,
    p_components_json IN CLOB,
    p_updated_by     IN VARCHAR2
  ) IS
  BEGIN
    DELETE FROM comp.comp_sal_structure_components
     WHERE salary_structure_id = p_structure_id;

    IF is_blank_json(p_components_json) THEN
      RETURN;
    END IF;

    INSERT INTO comp.comp_sal_structure_components (
      structure_component_id,
      salary_structure_id,
      enterprise_id,
      component_id,
      display_sequence,
      calculation_method_code,
      default_value,
      min_value,
      max_value,
      active_flag,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    SELECT comp.comp_sal_structure_components_seq.NEXTVAL,
           p_structure_id,
           p_enterprise_id,
           jt.component_id,
           jt.display_sequence,
           UPPER(TRIM(jt.calculation_method_code)),
           jt.default_value,
           jt.min_value,
           jt.max_value,
           normalize_yn(jt.active_flag, 'Y'),
           p_updated_by,
           SYSDATE,
           p_updated_by,
           SYSDATE
      FROM JSON_TABLE(
             p_components_json,
             '$[*]'
             COLUMNS (
               component_id            NUMBER        PATH '$.component_id',
               display_sequence        NUMBER        PATH '$.display_sequence',
               calculation_method_code VARCHAR2(60)  PATH '$.calculation_method_code',
               default_value           NUMBER        PATH '$.default_value',
               min_value               NUMBER        PATH '$.min_value',
               max_value               NUMBER        PATH '$.max_value',
               active_flag             CHAR(1)       PATH '$.active_flag'
             )
           ) jt
     WHERE jt.component_id IS NOT NULL;
  END sync_components;

  ---------------------------------------------------------------------------
  -- Job families
  ---------------------------------------------------------------------------
  PROCEDURE sync_job_families(
    p_structure_id      IN NUMBER,
    p_enterprise_id     IN NUMBER,
    p_job_families_json IN CLOB,
    p_updated_by        IN VARCHAR2
  ) IS
  BEGIN
    DELETE FROM comp.comp_sal_job_families
     WHERE salary_structure_id = p_structure_id;

    IF is_blank_json(p_job_families_json) THEN
      RETURN;
    END IF;

    INSERT INTO comp.comp_sal_job_families (
      salary_structure_job_family_id,
      salary_structure_id,
      enterprise_id,
      job_family_id,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    SELECT comp.comp_sal_job_families_seq.NEXTVAL,
           p_structure_id,
           p_enterprise_id,
           jt.job_family_id,
           p_updated_by,
           SYSDATE,
           p_updated_by,
           SYSDATE
      FROM JSON_TABLE(
             p_job_families_json,
             '$[*]'
             COLUMNS (
               job_family_id NUMBER PATH '$'
             )
           ) jt
     WHERE jt.job_family_id IS NOT NULL;
  END sync_job_families;

  ---------------------------------------------------------------------------
  -- Positions
  ---------------------------------------------------------------------------
  PROCEDURE sync_positions(
    p_structure_id   IN NUMBER,
    p_enterprise_id  IN NUMBER,
    p_positions_json IN CLOB,
    p_updated_by     IN VARCHAR2
  ) IS
  BEGIN
    DELETE FROM comp.comp_sal_positions
     WHERE salary_structure_id = p_structure_id;

    IF is_blank_json(p_positions_json) THEN
      RETURN;
    END IF;

    INSERT INTO comp.comp_sal_positions (
      salary_structure_position_id,
      salary_structure_id,
      enterprise_id,
      position_id,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    SELECT comp.comp_sal_positions_seq.NEXTVAL,
           p_structure_id,
           p_enterprise_id,
           hex_to_raw(jt.position_hex),
           p_updated_by,
           SYSDATE,
           p_updated_by,
           SYSDATE
      FROM JSON_TABLE(
             p_positions_json,
             '$[*]'
             COLUMNS (
               position_hex VARCHAR2(32) PATH '$'
             )
           ) jt
     WHERE jt.position_hex IS NOT NULL;
  END sync_positions;

  ---------------------------------------------------------------------------
  -- Grade ranges
  ---------------------------------------------------------------------------
  PROCEDURE sync_grade_ranges(
    p_structure_id     IN NUMBER,
    p_enterprise_id    IN NUMBER,
    p_grade_ranges_json IN CLOB,
    p_updated_by       IN VARCHAR2
  ) IS
  BEGIN
    DELETE FROM comp.comp_sal_grade_ranges
     WHERE salary_structure_id = p_structure_id;

    IF is_blank_json(p_grade_ranges_json) THEN
      RETURN;
    END IF;

    INSERT INTO comp.comp_sal_grade_ranges (
      salary_structure_grade_range_id,
      salary_structure_id,
      enterprise_id,
      grade_id,
      active_flag,
      created_by,
      creation_date,
      last_updated_by,
      last_update_date
    )
    SELECT comp.comp_sal_grade_ranges_seq.NEXTVAL,
           p_structure_id,
           p_enterprise_id,
           jt.grade_id,
           normalize_yn(jt.active_flag, 'Y'),
           p_updated_by,
           SYSDATE,
           p_updated_by,
           SYSDATE
      FROM JSON_TABLE(
             p_grade_ranges_json,
             '$[*]'
             COLUMNS (
               grade_id    NUMBER  PATH '$.grade_id',
               active_flag CHAR(1) PATH '$.active_flag'
             )
           ) jt
     WHERE jt.grade_id IS NOT NULL;
  END sync_grade_ranges;

  ---------------------------------------------------------------------------
  -- Financial details (unchanged behaviour: upsert when any fin param supplied)
  ---------------------------------------------------------------------------
  PROCEDURE sync_financial_details(
    p_structure_id         IN NUMBER,
    p_enterprise_id        IN NUMBER,
    p_cost_center_code     IN VARCHAR2,
    p_fin_effective_from   IN DATE,
    p_fin_effective_to     IN DATE,
    p_annual_budget_amount IN NUMBER,
    p_updated_by           IN VARCHAR2
  ) IS
    l_cnt NUMBER;
  BEGIN
    assert_fin_effective_dates(p_fin_effective_from, p_fin_effective_to);

    SELECT COUNT(*)
      INTO l_cnt
      FROM comp.comp_salary_financial_details
     WHERE salary_structure_id = p_structure_id;

    IF l_cnt = 0 THEN
      INSERT INTO comp.comp_salary_financial_details (
        financial_detail_id,
        salary_structure_id,
        enterprise_id,
        cost_center_code,
        effective_from,
        effective_to,
        annual_budget_amount,
        created_by,
        creation_date,
        last_updated_by,
        last_update_date
      ) VALUES (
        comp.comp_salary_financial_details_seq.NEXTVAL,
        p_structure_id,
        p_enterprise_id,
        p_cost_center_code,
        p_fin_effective_from,
        p_fin_effective_to,
        p_annual_budget_amount,
        p_updated_by,
        SYSDATE,
        p_updated_by,
        SYSDATE
      );
    ELSE
      UPDATE comp.comp_salary_financial_details fd
         SET fd.cost_center_code     = NVL(p_cost_center_code, fd.cost_center_code),
             fd.effective_from       = NVL(p_fin_effective_from, fd.effective_from),
             fd.effective_to         = NVL(p_fin_effective_to, fd.effective_to),
             fd.annual_budget_amount = NVL(p_annual_budget_amount, fd.annual_budget_amount),
             fd.last_updated_by      = p_updated_by,
             fd.last_update_date     = SYSDATE
       WHERE fd.salary_structure_id = p_structure_id;
    END IF;
  END sync_financial_details;

  ---------------------------------------------------------------------------
  -- Main update procedure
  ---------------------------------------------------------------------------
  PROCEDURE UPDATE_SALARY_STRUCTURE (
    P_STRUCTURE_GUID               IN RAW,
    P_STRUCTURE_CODE               IN VARCHAR2                    DEFAULT NULL,
    P_STRUCTURE_NAME               IN VARCHAR2                    DEFAULT NULL,
    P_STRUCTURE_TYPE_CODE          IN VARCHAR2                    DEFAULT NULL,
    P_CURRENCY_CODE                IN VARCHAR2                    DEFAULT NULL,
    P_COUNTRY_ID                   IN NUMBER                      DEFAULT NULL,
    P_ENTERPRISE_ID                IN NUMBER                      DEFAULT NULL,
    P_DESCRIPTION                  IN VARCHAR2                    DEFAULT NULL,
    P_STATUS                       IN VARCHAR2                    DEFAULT NULL,
    P_ACTIVE_FLAG                  IN CHAR                        DEFAULT NULL,
    P_EFFECTIVE_FROM               IN DATE                        DEFAULT NULL,
    P_EFFECTIVE_TO                 IN DATE                        DEFAULT NULL,
    P_ENABLE_PAYROLL_INTEGRATION   IN CHAR                        DEFAULT NULL,
    P_AUTO_CALC_COMPONENTS         IN CHAR                        DEFAULT NULL,
    P_ENABLE_VERSION_CONTROL       IN CHAR                        DEFAULT NULL,
    P_REQUIRE_MULTI_APPROVAL       IN CHAR                        DEFAULT NULL,
    P_ENABLE_AUDIT_LOGGING         IN CHAR                        DEFAULT NULL,
    P_ALLOW_MANUAL_OVERRIDE        IN CHAR                        DEFAULT NULL,
    P_COST_CENTER_CODE             IN VARCHAR2                    DEFAULT NULL,
    P_FIN_EFFECTIVE_FROM           IN DATE                        DEFAULT NULL,
    P_FIN_EFFECTIVE_TO             IN DATE                        DEFAULT NULL,
    P_ANNUAL_BUDGET_AMOUNT         IN NUMBER                      DEFAULT NULL,
    P_COUNTRY_CODE                 IN VARCHAR2                    DEFAULT NULL,
    P_COMPONENTS_JSON              IN CLOB                        DEFAULT NULL,
    P_BUSINESS_UNITS_JSON          IN CLOB                        DEFAULT NULL,
    P_EMPLOYMENT_TYPES_JSON        IN CLOB                        DEFAULT NULL,
    P_JOB_FAMILIES_JSON            IN CLOB                        DEFAULT NULL,
    P_POSITIONS_JSON               IN CLOB                        DEFAULT NULL,
    P_GRADE_RANGES_JSON            IN CLOB                        DEFAULT NULL,
    P_UPDATED_BY                   IN VARCHAR2                    DEFAULT NULL
  ) IS
    l_structure_id   comp.comp_salary_structures.salary_structure_id%TYPE;
    l_enterprise_id  comp.comp_salary_structures.enterprise_id%TYPE;
    l_eff_from       DATE;
    l_eff_to         DATE;
    l_updated_by     VARCHAR2(100);
  BEGIN
    IF P_STRUCTURE_GUID IS NULL THEN
      raise_err('structure_guid is required.');
    END IF;

    l_updated_by := NVL(NULLIF(TRIM(P_UPDATED_BY), ''), 'SYSTEM');

    SELECT s.salary_structure_id,
           s.enterprise_id
      INTO l_structure_id,
           l_enterprise_id
      FROM comp.comp_salary_structures s
     WHERE s.structure_guid = P_STRUCTURE_GUID
       FOR UPDATE;

    IF P_ENTERPRISE_ID IS NOT NULL AND P_ENTERPRISE_ID <> l_enterprise_id THEN
      raise_err('enterprise_id does not match the salary structure.');
    END IF;

    l_eff_from := NVL(P_EFFECTIVE_FROM, NULL);
    l_eff_to   := NVL(P_EFFECTIVE_TO, NULL);
    assert_effective_dates(l_eff_from, l_eff_to);

    IF P_COUNTRY_CODE IS NOT NULL THEN
      assert_country_code(l_enterprise_id, P_COUNTRY_CODE);
    END IF;

    UPDATE comp.comp_salary_structures s
       SET s.structure_code               = NVL(NULLIF(TRIM(P_STRUCTURE_CODE), ''), s.structure_code),
           s.structure_name               = NVL(NULLIF(TRIM(P_STRUCTURE_NAME), ''), s.structure_name),
           s.structure_type_code          = NVL(NULLIF(TRIM(P_STRUCTURE_TYPE_CODE), ''), s.structure_type_code),
           s.currency_code                = NVL(NULLIF(TRIM(P_CURRENCY_CODE), ''), s.currency_code),
           s.country_id                   = NVL(P_COUNTRY_ID, s.country_id),
           s.enterprise_id                = NVL(P_ENTERPRISE_ID, s.enterprise_id),
           s.description                  = NVL(P_DESCRIPTION, s.description),
           s.status                       = NVL(NULLIF(TRIM(P_STATUS), ''), s.status),
           s.active_flag                  = NVL(P_ACTIVE_FLAG, s.active_flag),
           s.effective_from               = NVL(P_EFFECTIVE_FROM, s.effective_from),
           s.effective_to                 = NVL(P_EFFECTIVE_TO, s.effective_to),
           s.enable_payroll_integration   = NVL(P_ENABLE_PAYROLL_INTEGRATION, s.enable_payroll_integration),
           s.auto_calc_components         = NVL(P_AUTO_CALC_COMPONENTS, s.auto_calc_components),
           s.enable_version_control       = NVL(P_ENABLE_VERSION_CONTROL, s.enable_version_control),
           s.require_multi_approval       = NVL(P_REQUIRE_MULTI_APPROVAL, s.require_multi_approval),
           s.enable_audit_logging         = NVL(P_ENABLE_AUDIT_LOGGING, s.enable_audit_logging),
           s.allow_manual_override        = NVL(P_ALLOW_MANUAL_OVERRIDE, s.allow_manual_override),
           s.last_updated_by              = l_updated_by,
           s.last_update_date             = SYSDATE
     WHERE s.salary_structure_id = l_structure_id;

    IF P_COST_CENTER_CODE IS NOT NULL
       OR P_FIN_EFFECTIVE_FROM IS NOT NULL
       OR P_FIN_EFFECTIVE_TO IS NOT NULL
       OR P_ANNUAL_BUDGET_AMOUNT IS NOT NULL THEN
      sync_financial_details(
        p_structure_id         => l_structure_id,
        p_enterprise_id        => l_enterprise_id,
        p_cost_center_code     => P_COST_CENTER_CODE,
        p_fin_effective_from   => P_FIN_EFFECTIVE_FROM,
        p_fin_effective_to     => P_FIN_EFFECTIVE_TO,
        p_annual_budget_amount => P_ANNUAL_BUDGET_AMOUNT,
        p_updated_by           => l_updated_by
      );
    END IF;

    IF P_COUNTRY_CODE IS NOT NULL OR P_BUSINESS_UNITS_JSON IS NOT NULL THEN
      sync_org_scope(
        p_structure_id        => l_structure_id,
        p_enterprise_id       => l_enterprise_id,
        p_country_code        => P_COUNTRY_CODE,
        p_business_units_json => P_BUSINESS_UNITS_JSON,
        p_updated_by          => l_updated_by
      );
    END IF;

    IF P_EMPLOYMENT_TYPES_JSON IS NOT NULL THEN
      sync_employment_types(
        p_structure_id          => l_structure_id,
        p_enterprise_id         => l_enterprise_id,
        p_employment_types_json => P_EMPLOYMENT_TYPES_JSON,
        p_updated_by            => l_updated_by
      );
    END IF;

    IF P_COMPONENTS_JSON IS NOT NULL THEN
      sync_components(
        p_structure_id    => l_structure_id,
        p_enterprise_id   => l_enterprise_id,
        p_components_json => P_COMPONENTS_JSON,
        p_updated_by      => l_updated_by
      );
    END IF;

    IF P_JOB_FAMILIES_JSON IS NOT NULL THEN
      sync_job_families(
        p_structure_id      => l_structure_id,
        p_enterprise_id     => l_enterprise_id,
        p_job_families_json => P_JOB_FAMILIES_JSON,
        p_updated_by        => l_updated_by
      );
    END IF;

    IF P_POSITIONS_JSON IS NOT NULL THEN
      sync_positions(
        p_structure_id   => l_structure_id,
        p_enterprise_id  => l_enterprise_id,
        p_positions_json => P_POSITIONS_JSON,
        p_updated_by     => l_updated_by
      );
    END IF;

    IF P_GRADE_RANGES_JSON IS NOT NULL THEN
      sync_grade_ranges(
        p_structure_id      => l_structure_id,
        p_enterprise_id     => l_enterprise_id,
        p_grade_ranges_json => P_GRADE_RANGES_JSON,
        p_updated_by        => l_updated_by
      );
    END IF;

  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE;
    WHEN OTHERS THEN
      IF SQLCODE = G_USER_ERROR_CODE THEN
        RAISE;
      END IF;
      RAISE_APPLICATION_ERROR(
        G_USER_ERROR_CODE,
        'Unable to update salary structure: ' || SQLERRM
      );
  END UPDATE_SALARY_STRUCTURE;

END UPDATE_COMP_SALARY_STRUCTURE_PKG;
/
