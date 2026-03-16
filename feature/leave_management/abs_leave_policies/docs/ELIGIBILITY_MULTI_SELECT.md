# Leave Policy Eligibility Multi-Select

Eligibility fields support **multi-select** (arrays) for Create and Update APIs. Legacy single-value keys are still accepted and converted to single-element arrays.

## API Changes

### Request fields (array or legacy single value)

| New (array)              | Legacy (single)         | PL/SQL parameter              |
|--------------------------|-------------------------|--------------------------------|
| `employee_category_codes`| `employee_category_code`| `p_employee_category_codes`   |
| `employment_type_codes`  | `employment_type_code`  | `p_employment_type_codes`     |
| `contract_type_codes`    | `contract_type_code`    | `p_contract_type_codes`       |
| `gender_codes`           | `gender_code`           | `p_gender_codes`               |
| `religion_codes`         | `religion_code`         | `p_religion_codes`             |
| `marital_status_codes`    | `marital_status_code`   | `p_marital_status_codes`       |

- **New:** Send arrays, e.g. `"employee_category_codes": ["STAFF", "MANAGEMENT"]`.
- **Legacy:** Sending e.g. `"employee_category_code": "STAFF"` is converted to `["STAFF"]`.
- **Null/empty:** Omit the key or send `null` / `[]` → passed as `null` to the package.

Serialization to DB: arrays are sent as JSON strings, e.g. `["STAFF","MANAGEMENT"]`.

---

## Sample Create Payload (POST /api/abs/create-policy)

```json
{
  "tenant_id": 1,
  "leave_type_id": 1,
  "policy_name": "Annual Leave Policy Multi",
  "entitlement_days": 21,
  "accrual_method_code": "YEARLY",
  "created_by": "ADMIN",
  "employee_category_codes": ["STAFF", "MANAGEMENT"],
  "employment_type_codes": ["FULL_TIME", "PART_TIME"],
  "contract_type_codes": ["PERMANENT", "TEMPORARY"],
  "gender_codes": ["MALE", "FEMALE"],
  "religion_codes": ["MUSLIM", "CHRISTIAN"],
  "marital_status_codes": ["SINGLE", "MARRIED"],
  "min_service_years": 0,
  "max_service_years": null,
  "grade_rows": [
    {
      "grade_from": 1,
      "grade_to": 5,
      "entitlement_days": 21,
      "accrual_rate": 1.75,
      "status": "ACTIVE"
    }
  ],
  "effective_start_date": "2025-01-01",
  "effective_end_date": null,
  "enable_pro_rata": "Y",
  "count_weekends_as_leave": "N"
}
```

---

## Sample Update Payload (PUT /api/abs/update-policy/:policyGuid)

```json
{
  "tenant_id": 1,
  "leave_type_id": 1,
  "policy_name": "Annual Leave Policy Multi Updated",
  "policy_status": "ACTIVE",
  "updated_by": "ADMIN",
  "entitlement_days": 22,
  "accrual_method_code": "YEARLY",
  "employee_category_codes": ["STAFF"],
  "employment_type_codes": ["FULL_TIME"],
  "contract_type_codes": ["PERMANENT"],
  "gender_codes": ["MALE", "FEMALE"],
  "religion_codes": null,
  "marital_status_codes": [],
  "grade_rows": [
    {
      "grade_from": 1,
      "grade_to": 10,
      "entitlement_days": 22,
      "accrual_rate": 1.83,
      "status": "ACTIVE"
    }
  ],
  "effective_start_date": "2025-01-01",
  "effective_end_date": "2026-12-31",
  "enable_pro_rata": "Y"
}
```

Note: `religion_codes: null` and `marital_status_codes: []` both result in `null` being passed to the package.

---

## Summary of Files Changed

| File | Changes |
|------|---------|
| `controller/leavePolicyController.js` | Added `ELIGIBILITY_FIELDS`; validation for `*_codes` (array) and legacy `*_code` (string); `normalizeEligibilityPayload()`; create/update routes pass normalized payload to model. |
| `model/leavePolicyModel.js` | Added `serializeEligibilityCodes()`; create/update use `*_codes` binds and pass JSON strings to PL/SQL params `p_employee_category_codes`, `p_employment_type_codes`, `p_contract_type_codes`, `p_gender_codes`, `p_religion_codes`, `p_marital_status_codes`. |
| `docs/ELIGIBILITY_MULTI_SELECT.md` | This doc: request format, samples, file summary. |

**PL/SQL:** Package `ABS_POLICY_PKG` procedures `CREATE_POLICY_WITH_GRADES` and `UPDATE_POLICY_WITH_GRADES` must accept the new parameters (e.g. `p_employee_category_codes` as VARCHAR2/CLOB containing JSON array). Existing header, rules, carry forward, encashment, grade rows, effective dates, and pro-rata behavior are unchanged.
