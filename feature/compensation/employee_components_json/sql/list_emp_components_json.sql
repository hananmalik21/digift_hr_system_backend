-- COMP.COMP_EMP_COMPONENTS_JSON_V — employee active components (JSON per employee row).
-- Used by POST /api/comp/bulk-employee-components
--
-- Request filters (all bind variables):
--   :enterprise_id       (required)
--   :employee_guid_hex    (optional, single GUID)
--   :employee_guids_json  (optional, JSON array of 32-char hex strings)
--   :plan_id              (optional; applied in service layer on parsed components)
--
-- Employee GUID filters:
--   • none     → all employees under enterprise
--   • one GUID → EMPLOYEE_GUID = HEXTORAW(:employee_guid_hex)
--   • many     → EMPLOYEE_GUID IN (SELECT HEXTORAW(...) FROM JSON_TABLE(:employee_guids_json, ...))
--
-- Pagination: ORDER BY employee_guid OFFSET :offset ROWS FETCH NEXT :page_size ROWS ONLY

-- Count employees matching filters
SELECT COUNT(*) AS cnt
  FROM COMP.COMP_EMP_COMPONENTS_JSON_V v
 WHERE v.enterprise_id = :enterprise_id
   /* optional single/multiple employee GUID clauses appended dynamically */

-- List page of employees with JSON components
SELECT v.enterprise_id,
       UPPER(RAWTOHEX(v.employee_guid)) AS employee_guid_hex,
       v.components_json
  FROM COMP.COMP_EMP_COMPONENTS_JSON_V v
 WHERE v.enterprise_id = :enterprise_id
   /* optional single/multiple employee GUID clauses appended dynamically */
 ORDER BY UPPER(RAWTOHEX(v.employee_guid))
 OFFSET :offset ROWS FETCH NEXT :page_size ROWS ONLY
