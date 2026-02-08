# GET /api/empl/employees — Cursor-based list

View: **EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST** (1 row per employee, latest assignment, RN=1).

## Query parameters

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| enterprise_id | number | Yes | - | Enterprise ID |
| limit | number | No | 10 | Page size (max 100) |
| cursor | string | No | - | Base64 cursor for next page |
| sort_by | string | No | employee_id | employee_id, employee_number, last_update_date, effective_start_date |
| sort_dir | string | No | DESC | ASC or DESC |
| org_unit_id | string | No | - | 32-char hex (JSON_EXISTS in hierarchy) |
| position_id | string | No | - | 32-char hex |
| job_family_id | number | No | - | |
| job_level_id | number | No | - | |
| grade_id | number | No | - | |
| employment_status | string | No | - | |
| contract_type_code | string | No | - | |
| work_location_id | number | No | - | |
| search | string | No | - | Searches employee_number, first_name_en, middle_name_en, last_name_en, email, phone_number, mobile_number |

## Response

```json
{
  "success": true,
  "message": "Employees fetched successfully",
  "meta": {
    "pagination": {
      "limit": 10,
      "has_next": true,
      "next_cursor": "eyJzb3J0X2J5..."
    }
  },
  "data": [ ... ]
}
```

## Example requests

**First page (default sort: employee_id DESC)**  
`GET {{baseUrl}}/api/empl/employees?enterprise_id=1&limit=10`

**Next page**  
`GET {{baseUrl}}/api/empl/employees?enterprise_id=1&limit=10&cursor=eyJzb3J0X2J5IjoiZW1wbG95ZWVfaWQiLCJzb3J0X2RpciI6IkRFU0MiLCJsYXN0X3NvcnRfdmFsdWUiOjEyMCwibGFzdF9lbXBsb3llZV9pZCI6MTIwfQ`

**Sort by last_update_date ASC**  
`GET {{baseUrl}}/api/empl/employees?enterprise_id=1&sort_by=last_update_date&sort_dir=ASC&limit=20`

**Filter by org + search**  
`GET {{baseUrl}}/api/empl/employees?enterprise_id=1&org_unit_id=4A001DFB79503BDAE0633519000AEFDB&search=ahmed&limit=10`

**Filter by position and employment status**  
`GET {{baseUrl}}/api/empl/employees?enterprise_id=1&position_id=49D4D7F5188B3868E0639E1B000ACF1A&employment_status=ACTIVE`

---

## JSON fields in response

- **org_structure_list** — Always an array (parsed via `safeJson`; if string from driver, parsed; if parse fails, `[]`).
- **position_obj** — Single position object (parsed via `safeJson`). Either from `position_obj` or `position_obj_json`; only `position_obj` is returned; `position_obj_json` is omitted.
- **position_id** — Raw hex string is kept as-is.
- CLOB/string JSON from Oracle is never returned as escaped string; it is always parsed to object/array.
