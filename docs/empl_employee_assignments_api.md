# GET /api/empl/employee-assignments

Source view: **EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST** (no direct joins to `EMPL.EMPLOYEES` or assignment base tables in Node.js).

## Query parameters

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| enterprise_id | number | Yes | - | Enterprise ID |
| search | string | No | - | Matches `SEARCH_KEY` (`UPPER(search_key) LIKE '%' \|\| UPPER(:search) \|\| '%'`) |
| employee_id | number | No | - | Filter by employee ID |
| status | string | No | - | Filter by `employee_status` (`employee_status = UPPER(:status)`) |
| page | number | No | 1 | Page number (1-based) |
| limit | number | No | 20 | Page size (max 100) |

## Response

```json
{
  "success": true,
  "data": [
    {
      "enterprise_id": 1,
      "employee_id": 101,
      "employee_guid": "4A001DFB79503BDAE0633519000AEFDB",
      "first_name_en": "Ahmed",
      "middle_name_en": "Ali",
      "last_name_en": "Hassan",
      "fourth_name_en": "Mohammed",
      "first_name_ar": "أحمد",
      "middle_name_ar": "علي",
      "last_name_ar": "حسن",
      "fourth_name_ar": "محمد",
      "family_name_ar": "الحسن",
      "email": "ahmed.hassan@example.com",
      "phone_number": "+96512345678",
      "mobile_number": "+96598765432",
      "date_of_birth": "1990-05-15T00:00:00.000Z",
      "employee_status": "ACTIVE",
      "employee_is_active": "Y",
      "assignment_id": 501,
      "assignment_guid": "49D4D7F5188B3868E0639E1B000ACF1A",
      "employee_number": "EMP-00101",
      "org_unit_id": "4A001DFB79503BDAE0633519000AEFDB",
      "org_structure_list": [
        {
          "level_code": "COMPANY",
          "org_unit_id": "4A001DFB79503BDAE0633519000AEFDB",
          "org_unit_name_en": "Head Office"
        }
      ],
      "work_location_id": 3,
      "position_id": "49D4D7F5188B3868E0639E1B000ACF1A",
      "position_obj": {
        "position_id": "49D4D7F5188B3868E0639E1B000ACF1A",
        "position_code": "POS-001",
        "status": "ACTIVE",
        "position_title_en": "Software Engineer"
      },
      "job_family_id": 10,
      "job_level_id": 5,
      "grade_id": 8,
      "enterprise_hire_date": "2022-01-10T00:00:00.000Z",
      "contract_type_code": "PERMANENT",
      "probation_days": 90,
      "reporting_to_emp_id": 55,
      "employment_status": "ACTIVE",
      "effective_start_date": "2022-01-10T00:00:00.000Z",
      "effective_end_date": null,
      "assignment_status": "ACTIVE",
      "assignment_is_active": "Y"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

## Error response

```json
{
  "success": false,
  "message": "Unable to fetch employee assignment list",
  "error": "ORA-00942: table or view does not exist"
}
```

Validation (400):

```json
{
  "success": false,
  "message": "enterprise_id is required and must be a positive number",
  "error": "enterprise_id is required and must be a positive number"
}
```

## Example requests

`GET {{baseUrl}}/api/empl/employee-assignments?enterprise_id=1`

`GET {{baseUrl}}/api/empl/employee-assignments?enterprise_id=1&search=ahmed&page=1&limit=20`

`GET {{baseUrl}}/api/empl/employee-assignments?enterprise_id=1&status=active&employee_id=101`

## Frontend field mapping

| API field | UI usage |
|-----------|----------|
| employee_id | Primary key for employee actions |
| employee_guid | GUID-based routes / deep links |
| employee_number | Display ID in tables and search results |
| first_name_en, middle_name_en, last_name_en, fourth_name_en | English full name (include fourth name when present) |
| first_name_ar, middle_name_ar, last_name_ar, fourth_name_ar, family_name_ar | Arabic full name |
| email, phone_number, mobile_number | Contact columns |
| date_of_birth | Profile / HR details |
| employee_status, employee_is_active | Employee-level status badges |
| assignment_id, assignment_guid | Assignment-specific actions |
| org_unit_id | Org unit filter / display |
| org_structure_list | Hierarchy breadcrumb (array of level nodes) |
| work_location_id | Location filter |
| position_id, position_obj | Job title / position display |
| job_family_id, job_level_id, grade_id | Compensation / job structure filters |
| enterprise_hire_date | Tenure / hire date |
| contract_type_code, probation_days | Contract details |
| reporting_to_emp_id | Manager lookup |
| employment_status, effective_start_date, effective_end_date | Assignment timeline |
| assignment_status, assignment_is_active | Assignment-level status badges |

## Notes

- GUID fields (`employee_guid`, `assignment_guid`, `org_unit_id`, `position_id`) are returned as uppercase 32-char hex strings (`RAWTOHEX` in SQL).
- `org_structure_list` and `position_obj` are parsed from JSON when possible; if parsing fails, the raw value is returned.
- Results are ordered by `employee_number ASC`, then `employee_id ASC`.
- Access is scoped via FNDSEC (`V_USER_ACCESSIBLE_EMPLOYEES`) for the authenticated user, consistent with other employee list APIs.
