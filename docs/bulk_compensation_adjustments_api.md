# POST /api/compensation/bulk-adjustments

Bulk-adjust employee compensation components via `COMP.EMPLOYEE_COMPENSATION.bulk_adjust_components`.

The request `employees` array is serialized to Oracle `p_components_json` as:

```json
{ "employees": [ ... ] }
```

Each component row also receives `effective_start_date` from the request header `effective_date`.

OpenAPI spec: [bulk_compensation_adjustments_api.openapi.yaml](./bulk_compensation_adjustments_api.openapi.yaml)

## Endpoint

`POST {{baseUrl}}/api/compensation/bulk-adjustments`

Content-Type: `application/json`

Large payloads: default body limit is **10mb** for this route (`BULK_ADJUST_JSON_LIMIT` env override).

## Request body

| Field | Required | Description |
|-------|----------|-------------|
| `enterprise_id` | Yes | Positive integer |
| `adjustment_type` | Yes | e.g. `BULK_ADJUSTMENT` |
| `effective_date` | Yes | `YYYY-MM-DD` |
| `reason_code` | Yes | e.g. `BULK_UPDATE` |
| `budget_code` | Yes | e.g. `DEFAULT` |
| `justification_text` | Yes | Free text |
| `updated_by` | Yes | Acting user / audit id |
| `employees` | Yes | Non-empty array (see below) |

### `employees[]`

| Field | Required | Description |
|-------|----------|-------------|
| `employee_id` | Yes | Positive integer |
| `plan_id` | Yes | Positive integer |
| `components` | Yes | Non-empty array |

### `employees[].components[]`

| Field | Required | Description |
|-------|----------|-------------|
| `component_id` | Yes | Positive integer |
| `amount` | Yes | Number |
| `currency_code` | Yes | e.g. `KWD` |
| `adjustment_method` | Yes | e.g. `BULK_ADJUSTMENT` |
| `replace_flag` | Yes | `Y` or `N` |
| `delete_flag` | Yes | `Y` or `N` |
| `active_flag` | Yes | `Y` or `N` |
| `effective_end_date` | No | `YYYY-MM-DD` or `null` |

`replace_flag` and `delete_flag` cannot both be `Y`.

## Sample request

```http
POST {{baseUrl}}/api/compensation/bulk-adjustments
Content-Type: application/json
Authorization: Bearer {{token}}
```

```json
{
  "enterprise_id": 1,
  "adjustment_type": "BULK_ADJUSTMENT",
  "effective_date": "2026-05-01",
  "reason_code": "BULK_UPDATE",
  "budget_code": "DEFAULT",
  "justification_text": "Bulk compensation adjustment",
  "updated_by": "ADMIN",
  "employees": [
    {
      "employee_id": 101,
      "plan_id": 111,
      "components": [
        {
          "component_id": 97,
          "amount": 1200,
          "currency_code": "KWD",
          "adjustment_method": "BULK_ADJUSTMENT",
          "replace_flag": "Y",
          "delete_flag": "N",
          "active_flag": "Y",
          "effective_end_date": null
        }
      ]
    }
  ]
}
```

## Sample response (200)

```json
{
  "success": true,
  "success_count": 2,
  "error_count": 1,
  "message": "Adjustment completed successfully for employees: EMP-101, EMP-102. Failed for employees: EMP-111 - Amount is required.",
  "results": {
    "employees": [
      { "employee_id": 101, "status": "SUCCESS" },
      { "employee_id": 102, "status": "SUCCESS" },
      { "employee_id": 111, "status": "ERROR", "error": "Amount is required." }
    ]
  }
}
```

`results` mirrors the parsed Oracle OUT parameter `x_result_json` (shape defined by the package).

## Error responses

### 400 — validation

```json
{
  "success": false,
  "message": "employees must be a non-empty array"
}
```

### 500 — database / unexpected

User-facing messages only; `ORA-` codes are not returned.

```json
{
  "success": false,
  "message": "Unable to complete bulk compensation adjustment. Please try again later."
}
```

## Oracle procedure

```sql
COMP.EMPLOYEE_COMPENSATION.bulk_adjust_components(
  p_enterprise_id,
  p_adjustment_type,
  p_effective_date,
  p_reason_code,
  p_budget_code,
  p_justification_text,
  p_updated_by,
  p_components_json,  -- JSON CLOB: { "employees": [ ... ] }
  x_success_count,
  x_error_count,
  x_message,
  x_result_json
);
```

Transaction: commit on success, rollback on failure (via `withCompConnection`).
