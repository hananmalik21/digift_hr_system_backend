# POST /api/create-employee — All-in-one create

Creates an employee via `EMPL.EMPL_EMPLOYEE_CREATE_API_PKG.CREATE_EMPLOYEE_ALL_IN_ONE`.

Compensation is **only** accepted through optional `compensation_components` (JSON array or multipart JSON string). Legacy salary and allowance fields are **not** accepted.

## Endpoint

`POST {{baseUrl}}/api/create-employee`

Content-Type: `application/json` or `multipart/form-data` (for optional document upload).

## Removed request fields (do not send)

| Field | Notes |
|-------|--------|
| `basic_salary_kwd` | Use `compensation_components` |
| `housing_kwd` | Use `compensation_components` |
| `food_kwd` | Use `compensation_components` |
| `transport_kwd` | Use `compensation_components` |
| `other_kwd` | Use `compensation_components` |
| `mobile_kwd` | Use `compensation_components` (not `mobile_number`) |
| `comp_start` | Use `effective_start_date` per component row |
| `comp_end` | Use `effective_end_date` per component row |
| `allow_start` | Use `effective_start_date` per component row |
| `allow_end` | Use `effective_end_date` per component row |

Sending any of the above returns **400** with a message to use `compensation_components`.

CamelCase variants (e.g. `basicSalaryKwd`, `COMP_START`) are treated the same.

## Required fields

`enterprise_id`, `first_name_en`, `last_name_en`, `email`, `phone_number`, `date_of_birth`, `gender_code`, `nationality`, `contact_name`, `relationship`, `emerg_phone`, `work_schedule_id`, `bank_code`, `account_number`, `org_unit_id_hex` (32-char hex), `enterprise_hire_date`, `contract_type_code`, `employment_status`

## Optional compensation: `compensation_components`

Array of objects (or JSON string when using multipart):

| Field | Required | Description |
|-------|----------|-------------|
| `plan_id` | Yes | Positive integer |
| `component_id` | Yes | Positive integer |
| `amount` | Yes | Number |
| `currency_code` | Yes | e.g. `KWD` |
| `effective_start_date` | Yes | `YYYY-MM-DD` |
| `effective_end_date` | No | `YYYY-MM-DD` or null |
| `active_flag` | No | `Y` or `N` (default `Y`) |

### Frontend form mapping

Map each compensation UI row to one `compensation_components[]` entry:

- `plan_id` ← plan selector
- `component_id` ← component selector
- `amount` ← amount input
- `currency_code` ← currency
- `effective_start_date` / `effective_end_date` ← date pickers
- `active_flag` ← active toggle

Do **not** map legacy salary/allowance form fields to this API.

## Example — JSON with compensation

```http
POST {{baseUrl}}/api/create-employee
Content-Type: application/json
```

```json
{
  "enterprise_id": 1,
  "first_name_en": "Ahmed",
  "last_name_en": "Ali",
  "email": "ahmed.ali@example.com",
  "phone_number": "50001234",
  "date_of_birth": "1990-01-15",
  "gender_code": "M",
  "nationality": "KW",
  "contact_name": "Sara",
  "relationship": "SPOUSE",
  "emerg_phone": "50005678",
  "work_schedule_id": 1,
  "bank_code": "NBK",
  "account_number": "1234567890",
  "org_unit_id_hex": "4A001DFB79503BDAE0633519000AEFDB",
  "enterprise_hire_date": "2026-01-01",
  "contract_type_code": "PERM",
  "employment_status": "ACTIVE",
  "compensation_components": [
    {
      "plan_id": 1,
      "component_id": 10,
      "amount": 1200,
      "currency_code": "KWD",
      "effective_start_date": "2026-01-01",
      "active_flag": "Y"
    },
    {
      "plan_id": 1,
      "component_id": 11,
      "amount": 150,
      "currency_code": "KWD",
      "effective_start_date": "2026-01-01",
      "active_flag": "Y"
    }
  ]
}
```

## Example — multipart (compensation as JSON string)

```http
POST {{baseUrl}}/api/create-employee
Content-Type: multipart/form-data
```

| Key | Value |
|-----|--------|
| `enterprise_id` | `1` |
| `first_name_en` | `Ahmed` |
| …other required fields… | |
| `compensation_components` | `[{"plan_id":1,"component_id":10,"amount":1200,"currency_code":"KWD","effective_start_date":"2026-01-01"}]` |
| `file` | (optional document binary) |

## Success response (201)

```json
{
  "success": true,
  "employee_id": 12345,
  "generated_password": "…",
  "data": { }
}
```

## Error — legacy compensation fields (400)

```json
{
  "success": false,
  "message": "Missing or invalid required field(s): Legacy compensation fields are not supported (basic_salary_kwd). Use compensation_components instead.",
  "details": null
}
```
