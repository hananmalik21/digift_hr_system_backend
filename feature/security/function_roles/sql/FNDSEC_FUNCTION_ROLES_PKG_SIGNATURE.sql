-- Run as a user with access to ALL_ARGUMENTS.
-- Align Node binds with FNDSEC.FNDSEC_FUNCTION_ROLES_PKG if you see PLS-00306.

SELECT
  a.overload,
  a.position,
  a.argument_name,
  a.data_type,
  a.type_name,
  a.in_out
FROM all_arguments a
WHERE a.owner = 'FNDSEC'
  AND a.object_name = 'FNDSEC_FUNCTION_ROLES_PKG'
  AND a.package_name IS NULL
  AND a.argument_name IS NOT NULL
  AND a.procedure_name IN ('CREATE_FUNCTION_ROLE', 'UPDATE_FUNCTION_ROLE', 'DELETE_FUNCTION_ROLE', 'HARD_DELETE_FUNCTION_ROLE')
ORDER BY a.procedure_name, a.overload, a.position;
