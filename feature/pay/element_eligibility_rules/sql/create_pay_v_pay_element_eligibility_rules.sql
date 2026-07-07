-- =============================================================================
-- PAY.V_PAY_ELEMENT_ELIGIBILITY_RULES
-- Parent rule fields + CRITERIA_VALUES_JSON from child table with display names.
-- Run as PAY (or schema owner with privileges on PAY / ENT objects).
-- =============================================================================

CREATE OR REPLACE FORCE EDITIONABLE VIEW PAY.V_PAY_ELEMENT_ELIGIBILITY_RULES AS
SELECT
    R.ELIGIBILITY_RULE_ID,
    RAWTOHEX(R.ELIGIBILITY_RULE_GUID) AS ELIGIBILITY_RULE_GUID,
    R.ENTERPRISE_ID,
    R.RULE_NAME,
    R.EFFECTIVE_START_DATE,
    R.EFFECTIVE_END_DATE,
    R.STATUS,
    CASE R.STATUS
      WHEN 'ACTIVE'   THEN 'Active'
      WHEN 'INACTIVE' THEN 'Inactive'
      ELSE R.STATUS
    END AS STATUS_NAME,
    NVL(CV.CRITERIA_VALUE_COUNT, 0) AS CRITERIA_VALUE_COUNT,
    NVL(CV.CRITERIA_VALUE_COUNT, 0) AS CRITERIA_COUNT,
    NVL(CV.CRITERIA_VALUE_COUNT, 0) AS ACTIVE_CRITERIA_COUNT,
    CV.CRITERIA_VALUES_JSON,
    R.CREATED_BY,
    R.CREATION_DATE,
    R.LAST_UPDATED_BY,
    R.LAST_UPDATE_DATE
FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULES R
LEFT JOIN (
    SELECT
        CVW.ELIGIBILITY_RULE_ID,
        COUNT(*) AS CRITERIA_VALUE_COUNT,
        JSON_ARRAYAGG(
            JSON_OBJECT(
                KEY 'eligibility_rule_value_id'   VALUE CVW.ELIGIBILITY_RULE_VALUE_ID,
                KEY 'eligibility_rule_value_guid' VALUE RAWTOHEX(CVW.ELIGIBILITY_RULE_VALUE_GUID),
                KEY 'criteria_type_code'          VALUE CVW.CRITERIA_TYPE_CODE,
                KEY 'criteria_value'              VALUE CVW.CRITERIA_VALUE,
                KEY 'criteria_value_name'         VALUE CVW.CRITERIA_VALUE_NAME,
                KEY 'legal_employer_id'           VALUE RAWTOHEX(CVW.LEGAL_EMPLOYER_ID),
                KEY 'org_unit_id'                 VALUE RAWTOHEX(CVW.ORG_UNIT_ID),
                KEY 'grade_id'                    VALUE CVW.GRADE_ID,
                KEY 'position_id'                 VALUE RAWTOHEX(CVW.POSITION_ID),
                KEY 'employment_type_code'        VALUE CVW.EMPLOYMENT_TYPE_CODE,
                KEY 'location_code'               VALUE CVW.LOCATION_CODE,
                KEY 'created_by'                  VALUE CVW.CREATED_BY,
                KEY 'creation_date'               VALUE CVW.CREATION_DATE,
                KEY 'last_updated_by'             VALUE CVW.LAST_UPDATED_BY,
                KEY 'last_update_date'            VALUE CVW.LAST_UPDATE_DATE
                ABSENT ON NULL
            )
            ORDER BY CVW.ELIGIBILITY_RULE_VALUE_ID
            RETURNING CLOB
        ) AS CRITERIA_VALUES_JSON
    FROM (
        SELECT
            V.ELIGIBILITY_RULE_ID,
            V.ELIGIBILITY_RULE_VALUE_ID,
            V.ELIGIBILITY_RULE_VALUE_GUID,
            V.CRITERIA_TYPE_CODE,
            V.CRITERIA_VALUE,
            V.LEGAL_EMPLOYER_ID,
            V.ORG_UNIT_ID,
            V.GRADE_ID,
            V.POSITION_ID,
            V.EMPLOYMENT_TYPE_CODE,
            V.LOCATION_CODE,
            V.CREATED_BY,
            V.CREATION_DATE,
            V.LAST_UPDATED_BY,
            V.LAST_UPDATE_DATE,
            NVL(
                CASE V.CRITERIA_TYPE_CODE
                    WHEN 'LEGAL_EMPLOYER' THEN LE.ORG_UNIT_NAME_EN
                    WHEN 'BUSINESS_UNIT'   THEN OU.ORG_UNIT_NAME_EN
                    WHEN 'DEPARTMENT'      THEN OU.ORG_UNIT_NAME_EN
                    WHEN 'GRADE'           THEN TO_CHAR(G.GRADE_NUMBER)
                    WHEN 'POSITION'        THEN NVL(POS.POSITION_CODE, POS.POSITION_TITLE_EN)
                    WHEN 'EMPLOYMENT_TYPE' THEN V.EMPLOYMENT_TYPE_CODE
                    WHEN 'LOCATION'        THEN V.LOCATION_CODE
                    ELSE V.CRITERIA_VALUE
                END,
                V.CRITERIA_VALUE
            ) AS CRITERIA_VALUE_NAME
        FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULE_VALUES V
        LEFT JOIN ENT.ORG_UNITS LE
               ON LE.ORG_UNIT_ID = V.LEGAL_EMPLOYER_ID
        LEFT JOIN ENT.ORG_UNITS OU
               ON OU.ORG_UNIT_ID = V.ORG_UNIT_ID
        LEFT JOIN ENT.GRADES G
               ON G.GRADE_ID = V.GRADE_ID
        LEFT JOIN ENT.POSITIONS POS
               ON POS.POSITION_ID = V.POSITION_ID
    ) CVW
    GROUP BY CVW.ELIGIBILITY_RULE_ID
) CV
  ON CV.ELIGIBILITY_RULE_ID = R.ELIGIBILITY_RULE_ID;
