-- Run as COMP schema (or user with access to ALL_ARGUMENTS).
-- Use the result to align Node.js bind names and types for CREATE_COMPONENT.
--
-- COMP.COMP_COMPONENT_CREATE_PKG.CREATE_COMPONENT:
SELECT
  a.overload,
  a.position,
  a.argument_name,
  a.data_type,
  a.type_name,
  a.in_out
FROM all_arguments a
WHERE a.owner = 'COMP'
  AND a.object_name = 'COMP_COMPONENT_CREATE_PKG'
  AND a.argument_name IS NOT NULL
ORDER BY a.overload, a.position;
