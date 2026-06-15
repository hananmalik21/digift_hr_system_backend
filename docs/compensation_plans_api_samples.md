# Compensation Plans API — Sample Payloads

OpenAPI spec: [compensation_plans_api.openapi.yaml](./compensation_plans_api.openapi.yaml)

## Create plan — recurring_flag Y

`POST {{baseUrl}}/api/compensation/plans/create`

```json
{
  "enterprise_id": 1,
  "plan_code": "HOUSING_PLAN",
  "plan_name": "Housing Allowance Plan",
  "plan_type_code": "ALLOWANCE",
  "components": [
    {
      "component_id": 97,
      "display_sequence": 1,
      "mandatory_flag": "Y",
      "active_flag": "Y",
      "recurring_flag": "Y",
      "taxable_flag": "Y",
      "pay_basis": "MONTHLY"
    }
  ]
}
```

## Create plan — recurring_flag N

```json
{
  "enterprise_id": 1,
  "plan_code": "BONUS_PLAN",
  "plan_name": "One-time Bonus Plan",
  "plan_type_code": "BONUS",
  "components": [
    {
      "component_id": 42,
      "recurring_flag": "N"
    }
  ]
}
```

## Create plan — omit recurring_flag (defaults to N)

```json
{
  "enterprise_id": 1,
  "plan_code": "BASIC_PLAN",
  "plan_name": "Basic Plan",
  "plan_type_code": "SALARY",
  "components": [
    {
      "component_id": 10,
      "taxable_flag": "Y"
    }
  ]
}
```

## Update plan — change recurring_flag N → Y

`PUT {{baseUrl}}/api/compensation/plans/update`

```json
{
  "plan_guid": "544E5F594ABB050BE0631718000ADADC",
  "components": [
    {
      "component_id": 97,
      "recurring_flag": "Y"
    }
  ]
}
```

## Update plan — change recurring_flag Y → N

```json
{
  "plan_guid": "544E5F594ABB050BE0631718000ADADC",
  "components": [
    {
      "component_id": 97,
      "recurring_flag": "N"
    }
  ]
}
```

## Get plan — sample component response

`GET {{baseUrl}}/api/comp/plans/544E5F594ABB050BE0631718000ADADC`

```json
{
  "success": true,
  "message": "Compensation plan fetched successfully",
  "data": {
    "plan_id": 100,
    "plan_guid": "544E5F594ABB050BE0631718000ADADC",
    "plan_components_json": [
      {
        "component_id": 97,
        "component_name": "Housing Allowance",
        "advanced_settings": {
          "prorated_flag": "N",
          "taxable_flag": "Y",
          "pensionable_flag": "Y",
          "statutory_flag": "N",
          "include_in_ctc_flag": "Y",
          "optional_flag": "N",
          "amortizable_flag": "N",
          "recurring_flag": "Y",
          "pay_basis": "MONTHLY"
        }
      }
    ]
  }
}
```

`GET {{baseUrl}}/api/compensation/plans/{planGuid}/components` returns the same `advanced_settings` shape under each item in `components`.
