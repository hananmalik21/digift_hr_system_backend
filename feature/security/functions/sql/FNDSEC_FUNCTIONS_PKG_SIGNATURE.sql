-- Run as a user with access to ALL_ARGUMENTS.
-- Use the result to align Node.js bind names and types for FNDSEC.FNDSEC_FUNCTIONS_PKG.
-- Note: on Oracle 23+, filter with package_name = 'FNDSEC_FUNCTIONS_PKG' (object_name = procedure).

-- All procedures in the package:
SELECT
  a.object_name AS procedure_name,
  a.overload,
  a.sequence,
  a.argument_name,
  a.data_type,
  a.in_out
FROM all_arguments a
WHERE a.owner = 'FNDSEC'
  AND a.package_name = 'FNDSEC_FUNCTIONS_PKG'
  AND a.argument_name IS NOT NULL
ORDER BY a.object_name, a.overload, a.sequence;

-- Expected signatures (as of last sync):
-- CREATE_FUNCTION:  P_MODULE_ID, P_FUNCTION_CODE, P_FUNCTION_NAME, P_DESCRIPTION,
--                   P_FUNCTION_TYPE, P_PERMISSION_KEY, P_ROUTE_URL, P_DISPLAY_ORDER,
--                   P_ACTIVE_FLAG, P_IS_SYSTEM_FLAG, P_CREATED_BY, P_RESPONSE OUT
-- UPDATE_FUNCTION:  P_FUNCTION_ID, P_MODULE_ID, ... scalars ..., P_UPDATED_BY, P_RESPONSE OUT
-- DELETE_FUNCTION:  P_FUNCTION_ID, P_DELETED_BY, P_RESPONSE OUT
-- GET_FUNCTION:     P_FUNCTION_ID, P_RESPONSE OUT
-- GET_FUNCTIONS:    P_MODULE_ID, P_ACTIVE_FLAG, P_RESPONSE OUT
