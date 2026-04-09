-- Run as a user with access to ALL_ARGUMENTS.
-- Use the result to align Node.js bind names and types for FNDSEC.FNDSEC_FUNCTIONS_PKG.

-- CREATE_FUNCTION:
SELECT
  a.overload,
  a.position,
  a.argument_name,
  a.data_type,
  a.type_name,
  a.in_out
FROM all_arguments a
WHERE a.owner = 'FNDSEC'
  AND a.object_name = 'FNDSEC_FUNCTIONS_PKG'
  AND a.package_name IS NULL
  AND a.argument_name IS NOT NULL
  AND a.procedure_name = 'CREATE_FUNCTION'
ORDER BY a.overload, a.position;

-- UPDATE_FUNCTION:
SELECT
  a.overload,
  a.position,
  a.argument_name,
  a.data_type,
  a.type_name,
  a.in_out
FROM all_arguments a
WHERE a.owner = 'FNDSEC'
  AND a.object_name = 'FNDSEC_FUNCTIONS_PKG'
  AND a.package_name IS NULL
  AND a.argument_name IS NOT NULL
  AND a.procedure_name = 'UPDATE_FUNCTION'
ORDER BY a.overload, a.position;

-- DELETE_FUNCTION:
SELECT
  a.overload,
  a.position,
  a.argument_name,
  a.data_type,
  a.type_name,
  a.in_out
FROM all_arguments a
WHERE a.owner = 'FNDSEC'
  AND a.object_name = 'FNDSEC_FUNCTIONS_PKG'
  AND a.package_name IS NULL
  AND a.argument_name IS NOT NULL
  AND a.procedure_name = 'DELETE_FUNCTION'
ORDER BY a.overload, a.position;

-- HARD_DELETE_FUNCTION:
SELECT
  a.overload,
  a.position,
  a.argument_name,
  a.data_type,
  a.type_name,
  a.in_out
FROM all_arguments a
WHERE a.owner = 'FNDSEC'
  AND a.object_name = 'FNDSEC_FUNCTIONS_PKG'
  AND a.package_name IS NULL
  AND a.argument_name IS NOT NULL
  AND a.procedure_name = 'HARD_DELETE_FUNCTION'
ORDER BY a.overload, a.position;

