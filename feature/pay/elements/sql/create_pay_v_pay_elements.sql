-- =============================================================================
-- PAY.V_PAY_ELEMENTS — pay element list/detail view
-- Sources: PAY.PAY_ELEMENTS, PAY.PAY_ELEMENT_PROCESSING_CONTROLS,
--          PAY.PAY_ELEMENT_COSTING_SETUP, flexfield segment tables
-- Run as PAY (or ADMIN with privileges on PAY objects).
-- =============================================================================

CREATE OR REPLACE VIEW PAY.V_PAY_ELEMENTS AS
SELECT
    e.ELEMENT_ID,
    RAWTOHEX(e.ELEMENT_GUID) AS ELEMENT_GUID,
    e.ENTERPRISE_ID,
    e.ELEMENT_CODE,
    e.ELEMENT_NAME,
    e.DESCRIPTION,
    e.CATEGORY_CODE,
    e.CLASSIFICATION_CODE,
    e.SECONDARY_CLASSIFICATION,
    e.LEGISLATIVE_DATA_GROUP,
    e.EFFECTIVE_START_DATE,
    e.EFFECTIVE_END_DATE,
    pc.RECURRING_FLAG,
    pc.COSTABLE_FLAG,
    pc.TAXABLE_FLAG,
    pc.PENSIONABLE_FLAG,
    pc.RETRO_ENABLED_FLAG,
    pc.PRORATION_ENABLED_FLAG,
    pc.PRIORITY,
    pc.PROCESSING_FREQUENCY,
    (
        SELECT JSON_ARRAYAGG(
                   JSON_OBJECT(
                       'segment_id' VALUE cs.SEGMENT_ID,
                       'segment_name' VALUE fs.SEGMENT_NAME,
                       'segment_value_id' VALUE cs.SEGMENT_VALUE_ID,
                       'segment_value_name' VALUE sv.VALUE_NAME
                       ABSENT ON NULL
                   ) RETURNING CLOB
               )
          FROM PAY.PAY_ELEMENT_COSTING_SETUP cs
          LEFT JOIN PAY.PAY_FLEXFIELD_STRUCTURE_SEGMENTS fs
            ON fs.SEGMENT_ID = cs.SEGMENT_ID
           AND fs.ENTERPRISE_ID = e.ENTERPRISE_ID
          LEFT JOIN PAY.PAY_FLEXFIELD_SEGMENT_VALUES sv
            ON sv.SEGMENT_VALUE_ID = cs.SEGMENT_VALUE_ID
           AND sv.ENTERPRISE_ID = e.ENTERPRISE_ID
         WHERE cs.ELEMENT_ID = e.ELEMENT_ID
    ) AS COSTING_JSON,
    e.CREATED_BY,
    e.CREATION_DATE,
    e.LAST_UPDATED_BY,
    e.LAST_UPDATE_DATE
FROM PAY.PAY_ELEMENTS e
LEFT JOIN PAY.PAY_ELEMENT_PROCESSING_CONTROLS pc
  ON pc.ELEMENT_ID = e.ELEMENT_ID
 AND pc.ENTERPRISE_ID = e.ENTERPRISE_ID;
