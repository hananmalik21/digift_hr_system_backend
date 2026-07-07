-- =============================================================================
-- PAY.V_PAY_ELEMENT_ELIG_PROFILES (with linked elements)
-- =============================================================================

CREATE OR REPLACE FORCE EDITIONABLE VIEW PAY.V_PAY_ELEMENT_ELIG_PROFILES AS
SELECT
    p.PROFILE_ID,
    RAWTOHEX(p.PROFILE_GUID) AS PROFILE_GUID,
    p.ENTERPRISE_ID,
    p.PROFILE_NAME,
    p.PROFILE_DESCRIPTION,
    p.STATUS,
    p.CREATED_BY,
    p.CREATION_DATE,
    p.LAST_UPDATED_BY,
    p.LAST_UPDATE_DATE,
    (
        SELECT COUNT(*)
          FROM PAY.PAY_ELEMENT_ELIG_PROFILE_RULES pr
         WHERE pr.PROFILE_ID = p.PROFILE_ID
    ) AS ELIGIBILITY_RULE_COUNT,
    (
        SELECT JSON_ARRAYAGG(
                   JSON_OBJECT(
                       KEY 'profile_rule_id'       VALUE x.PROFILE_RULE_ID,
                       KEY 'profile_rule_guid'     VALUE RAWTOHEX(x.PROFILE_RULE_GUID),
                       KEY 'eligibility_rule_id'   VALUE x.ELIGIBILITY_RULE_ID,
                       KEY 'eligibility_rule_guid' VALUE x.ELIGIBILITY_RULE_GUID,
                       KEY 'rule_name'             VALUE x.RULE_NAME,
                       KEY 'rule_status'           VALUE x.RULE_STATUS,
                       KEY 'effective_start_date'  VALUE TO_CHAR(x.EFFECTIVE_START_DATE, 'YYYY-MM-DD'),
                       KEY 'effective_end_date'    VALUE TO_CHAR(x.EFFECTIVE_END_DATE, 'YYYY-MM-DD'),
                       KEY 'criteria_values'       VALUE x.CRITERIA_VALUES_JSON FORMAT JSON,
                       KEY 'created_by'            VALUE x.CREATED_BY,
                       KEY 'creation_date'         VALUE TO_CHAR(x.CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS'),
                       KEY 'last_updated_by'       VALUE x.LAST_UPDATED_BY,
                       KEY 'last_update_date'      VALUE TO_CHAR(x.LAST_UPDATE_DATE, 'YYYY-MM-DD"T"HH24:MI:SS')
                       ABSENT ON NULL
                       RETURNING CLOB
                   )
                   ORDER BY x.PROFILE_RULE_ID
                   RETURNING CLOB
               )
          FROM (
                SELECT
                    pr.PROFILE_RULE_ID,
                    pr.PROFILE_RULE_GUID,
                    pr.ELIGIBILITY_RULE_ID,
                    pr.CREATED_BY,
                    pr.CREATION_DATE,
                    pr.LAST_UPDATED_BY,
                    pr.LAST_UPDATE_DATE,
                    RAWTOHEX(vr.ELIGIBILITY_RULE_GUID) AS ELIGIBILITY_RULE_GUID,
                    vr.RULE_NAME,
                    vr.STATUS AS RULE_STATUS,
                    vr.EFFECTIVE_START_DATE,
                    vr.EFFECTIVE_END_DATE,
                    vr.CRITERIA_VALUES_JSON
                  FROM PAY.PAY_ELEMENT_ELIG_PROFILE_RULES pr
                  JOIN PAY.V_PAY_ELEMENT_ELIGIBILITY_RULES vr
                    ON vr.ELIGIBILITY_RULE_ID = pr.ELIGIBILITY_RULE_ID
                 WHERE pr.PROFILE_ID = p.PROFILE_ID
               ) x
    ) AS ELIGIBILITY_RULES_JSON,
    (
        SELECT COUNT(*)
          FROM PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS pe
         WHERE pe.PROFILE_ID = p.PROFILE_ID
    ) AS LINKED_ELEMENT_COUNT,
    (
        SELECT JSON_ARRAYAGG(
                   JSON_OBJECT(
                       KEY 'profile_element_id'    VALUE y.PROFILE_ELEMENT_ID,
                       KEY 'profile_element_guid'  VALUE RAWTOHEX(y.PROFILE_ELEMENT_GUID),
                       KEY 'element_id'            VALUE y.ELEMENT_ID,
                       KEY 'element_guid'          VALUE RAWTOHEX(y.ELEMENT_GUID),
                       KEY 'element_code'          VALUE y.ELEMENT_CODE,
                       KEY 'element_name'          VALUE y.ELEMENT_NAME,
                       KEY 'description'           VALUE y.DESCRIPTION,
                       KEY 'category_code'         VALUE y.CATEGORY_CODE,
                       KEY 'classification_code'   VALUE y.CLASSIFICATION_CODE,
                       KEY 'effective_start_date'  VALUE TO_CHAR(y.EFFECTIVE_START_DATE, 'YYYY-MM-DD'),
                       KEY 'effective_end_date'    VALUE TO_CHAR(y.EFFECTIVE_END_DATE, 'YYYY-MM-DD'),
                       KEY 'created_by'            VALUE y.CREATED_BY,
                       KEY 'creation_date'         VALUE TO_CHAR(y.CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS'),
                       KEY 'last_updated_by'       VALUE y.LAST_UPDATED_BY,
                       KEY 'last_update_date'      VALUE TO_CHAR(y.LAST_UPDATE_DATE, 'YYYY-MM-DD"T"HH24:MI:SS')
                       ABSENT ON NULL
                       RETURNING CLOB
                   )
                   ORDER BY y.PROFILE_ELEMENT_ID
                   RETURNING CLOB
               )
          FROM (
                SELECT
                    pe.PROFILE_ELEMENT_ID,
                    pe.PROFILE_ELEMENT_GUID,
                    pe.ELEMENT_ID,
                    pe.CREATED_BY,
                    pe.CREATION_DATE,
                    pe.LAST_UPDATED_BY,
                    pe.LAST_UPDATE_DATE,
                    e.ELEMENT_GUID,
                    e.ELEMENT_CODE,
                    e.ELEMENT_NAME,
                    e.DESCRIPTION,
                    e.CATEGORY_CODE,
                    e.CLASSIFICATION_CODE,
                    e.EFFECTIVE_START_DATE,
                    e.EFFECTIVE_END_DATE
                  FROM PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS pe
                  JOIN PAY.PAY_ELEMENTS e
                    ON e.ELEMENT_ID = pe.ELEMENT_ID
                 WHERE pe.PROFILE_ID = p.PROFILE_ID
               ) y
    ) AS LINKED_ELEMENTS_JSON
FROM PAY.PAY_ELEMENT_ELIG_PROFILES p;
