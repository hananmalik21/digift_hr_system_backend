-- =============================================================================
-- REC.V_JOB_OFFER_MANAGEMENT — offer management list for UI (reads only).
-- Sources: REC.REC_JOB_OFFERS, REC.REC_APPLICATIONS, REC.CANDIDATES,
--          REC.V_JOB_POSTINGS, ENT.POSITIONS, ENT.ORG_UNITS, ENT.GRADES,
--          REC.REC_JOB_OFFER_COMPONENTS, REC.REC_JOB_OFFER_BENEFITS,
--          REC.REC_JOB_OFFER_TERMS
-- Run as REC (or ADMIN with privileges on REC / ENT objects).
-- =============================================================================

CREATE OR REPLACE VIEW REC.V_JOB_OFFER_MANAGEMENT AS
SELECT
    o.OFFER_ID,
    RAWTOHEX(o.OFFER_GUID) AS OFFER_GUID,
    o.ENTERPRISE_ID,
    o.APPLICATION_ID,
    RAWTOHEX(o.CANDIDATE_GUID) AS CANDIDATE_GUID,
    o.POSTING_ID,
    o.OFFER_NUMBER,

    RAWTOHEX(jp.POSTING_GUID) AS POSTING_GUID,
    jp.POSTING_TITLE,

    o.JOB_TITLE,
    o.LOCATION,
    o.WORK_MODE_CODE,
    o.EMPLOYMENT_TYPE_CODE,

    o.START_DATE,
    o.OFFER_DATE,
    o.EXPIRY_DATE,

    o.STATUS_CODE,
    CASE
        WHEN o.STATUS_CODE = 'DRAFT' THEN 'DRAFT'
        WHEN o.STATUS_CODE = 'REJECTED' THEN 'REJECTED'
        WHEN o.STATUS_CODE IN ('APPROVED', 'EXTENDED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN') THEN 'APPROVED'
        ELSE NULL
    END AS APPROVAL_STATUS,
    o.STATUS_CODE AS DISPLAY_STATUS,
    o.STAGE,
    o.STAGE_DESCRIPTION,

    (
        SELECT SUM(
            CASE UPPER(TRIM(oc.FREQUENCY_CODE))
                WHEN 'ANNUAL' THEN NVL(oc.AMOUNT, 0)
                WHEN 'YEARLY' THEN NVL(oc.AMOUNT, 0)
                WHEN 'MONTHLY' THEN NVL(oc.AMOUNT, 0) * 12
                WHEN 'QUARTERLY' THEN NVL(oc.AMOUNT, 0) * 4
                WHEN 'WEEKLY' THEN NVL(oc.AMOUNT, 0) * 52
                WHEN 'BIWEEKLY' THEN NVL(oc.AMOUNT, 0) * 26
                ELSE NVL(oc.AMOUNT, 0)
            END
        )
        FROM REC.REC_JOB_OFFER_COMPONENTS oc
        WHERE oc.OFFER_ID = o.OFFER_ID
    ) AS ANNUAL_SALARY,

    JSON_OBJECT(
        'candidate_guid' VALUE RAWTOHEX(c.CANDIDATE_GUID),
        'candidate_name' VALUE TRIM(
            c.FIRST_NAME || ' ' ||
            NVL(c.MIDDLE_NAME || ' ', '') ||
            c.LAST_NAME
        ),
        'email' VALUE c.EMAIL,
        'phone' VALUE c.PHONE,
        RETURNING CLOB
    ) AS CANDIDATE_OBJ,

    JSON_OBJECT(
        'posting_id' VALUE jp.POSTING_ID,
        'posting_guid' VALUE RAWTOHEX(jp.POSTING_GUID),
        'posting_title' VALUE jp.POSTING_TITLE,
        RETURNING CLOB
    ) AS POSTING_OBJ,

    JSON_OBJECT(
        'position_id' VALUE RAWTOHEX(o.POSITION_ID),
        'position_name' VALUE p.POSITION_TITLE_EN,
        RETURNING CLOB
    ) AS POSITION_OBJ,

    JSON_OBJECT(
        'department_id' VALUE RAWTOHEX(o.DEPARTMENT_ID),
        'department_name' VALUE ou.ORG_UNIT_NAME_EN,
        RETURNING CLOB
    ) AS DEPARTMENT_OBJ,

    JSON_OBJECT(
        'grade_id' VALUE g.GRADE_ID,
        'grade_number' VALUE g.GRADE_NUMBER,
        'grade_category' VALUE g.GRADE_CATEGORY,
        RETURNING CLOB
    ) AS GRADE_OBJ,

    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'plan_id' VALUE oc.PLAN_ID,
                'component_id' VALUE oc.COMPONENT_ID,
                'amount' VALUE oc.AMOUNT,
                'currency_code' VALUE oc.CURRENCY_CODE,
                'frequency_code' VALUE oc.FREQUENCY_CODE
            )
            ORDER BY oc.OFFER_COMPONENT_ID
            RETURNING CLOB
        )
        FROM REC.REC_JOB_OFFER_COMPONENTS oc
        WHERE oc.OFFER_ID = o.OFFER_ID
    ) AS COMPONENTS_JSON,

    (
        SELECT JSON_OBJECT(
            'health_insurance' VALUE b.HEALTH_INSURANCE,
            'dental_insurance' VALUE b.DENTAL_INSURANCE,
            'vision_insurance' VALUE b.VISION_INSURANCE,
            'life_insurance' VALUE b.LIFE_INSURANCE,
            'retirement_plan' VALUE b.RETIREMENT_PLAN,
            'pto_days' VALUE b.PTO_DAYS,
            'sick_days' VALUE b.SICK_DAYS,
            'personal_days' VALUE b.PERSONAL_DAYS,
            'parental_leave' VALUE b.PARENTAL_LEAVE,
            'additional_benefits' VALUE b.ADDITIONAL_BENEFITS
            RETURNING CLOB
        )
        FROM REC.REC_JOB_OFFER_BENEFITS b
        WHERE b.OFFER_ID = o.OFFER_ID
        FETCH FIRST 1 ROWS ONLY
    ) AS BENEFITS_JSON,

    (
        SELECT JSON_OBJECT(
            'probation_period' VALUE t.PROBATION_PERIOD,
            'offer_expiry_date' VALUE t.OFFER_EXPIRY_DATE,
            'background_check_required' VALUE t.BACKGROUND_CHECK_REQUIRED,
            'drug_test_required' VALUE t.DRUG_TEST_REQUIRED,
            'nda_required' VALUE t.NDA_REQUIRED,
            'non_compete_required' VALUE t.NON_COMPETE_REQUIRED,
            'additional_terms' VALUE t.ADDITIONAL_TERMS
            RETURNING CLOB
        )
        FROM REC.REC_JOB_OFFER_TERMS t
        WHERE t.OFFER_ID = o.OFFER_ID
        FETCH FIRST 1 ROWS ONLY
    ) AS TERMS_JSON,

    o.COMMENTS,
    o.DECLINE_COMMENTS,

    o.CREATED_BY,
    o.CREATION_DATE,
    o.LAST_UPDATED_BY,
    o.LAST_UPDATE_DATE
FROM REC.REC_JOB_OFFERS o
LEFT JOIN REC.REC_APPLICATIONS a
    ON a.APPLICATION_ID = o.APPLICATION_ID
   AND a.ENTERPRISE_ID = o.ENTERPRISE_ID
LEFT JOIN REC.CANDIDATES c
    ON c.CANDIDATE_GUID = o.CANDIDATE_GUID
   AND c.ENTERPRISE_ID = o.ENTERPRISE_ID
LEFT JOIN REC.V_JOB_POSTINGS jp
    ON jp.POSTING_ID = o.POSTING_ID
   AND jp.ENTERPRISE_ID = o.ENTERPRISE_ID
LEFT JOIN ENT.POSITIONS p
    ON p.POSITION_ID = o.POSITION_ID
LEFT JOIN ENT.ORG_UNITS ou
    ON ou.ORG_UNIT_ID = o.DEPARTMENT_ID
LEFT JOIN ENT.GRADES g
    ON g.GRADE_ID = o.GRADE_ID
   AND g.TENANT_ID = o.ENTERPRISE_ID;
