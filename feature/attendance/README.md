# Attendance API – Frontend contract

## Base URL
- **Create:** `POST /api/tm/attendance`
- **Update:** `PUT /api/tm/attendance`

Both endpoints call the same PL/SQL procedure: `TM.TM_MARK_ATTENDANCE_PKG.UPSERT_MARK_ATTENDANCE`.

---

## Create Attendance

- **Method:** `POST /api/tm/attendance`
- **Contract:** Do **not** send `attendance_day_id`. The procedure creates/merges by `(enterprise_id, employee_id, attendance_date)` and returns the generated `attendance_day_id` in the response.

### Request body (required)
| Field              | Type   | Required | Description |
|--------------------|--------|----------|-------------|
| enterprise_id      | number | Yes      | Enterprise ID |
| employee_id        | number | Yes      | Employee ID |
| attendance_date    | string | Yes      | Date (ISO or parseable); time part is truncated |
| attendance_status  | string | Yes      | Attendance status |

### Request body (optional)
| Field                 | Type   | Description |
|-----------------------|--------|-------------|
| source_type           | string | One of: `SYSTEM`, `ROSTER`, `API`, `IMPORT`. Default: `API` |
| schedule_id           | number | Required if any schedule field is sent |
| schedule_start_time   | string | Date+time (Oracle DATE) |
| schedule_end_time     | string | Date+time (Oracle DATE) |
| is_working_day        | string | `Y` or `N` |
| is_active_day         | string | `Y` or `N` |
| is_published          | string | `Y` or `N` |
| schedule_is_active    | string | `Y` or `N` |
| check_in_time         | string | Date+time (Oracle DATE) |
| check_out_time        | string | Date+time (Oracle DATE) |
| captured_at           | string | Date+time (Oracle DATE) |
| location / location_name | string | Location name; stored per `log_type` (CHECK_IN or CHECK_OUT) |
| log_type              | string | When saving location: `CHECK_IN` or `CHECK_OUT`. If one location is sent with both check_in_time and check_out_time, backend may use CHECK_IN for that location. |
| note_text             | string | Note text |
| audit_user            | string | Audit user |

### Response (201)
```json
{
  "success": true,
  "message": "Attendance created successfully",
  "data": {
    "attendance_day_id": 12345,
    "attendance": { ... }
  },
  "meta": { "execution_time_ms": 42 }
}
```
`attendance` is the refreshed view from TM tables (days, schedules, actuals, locations, notes) when available.

---

## Edit (Update) Attendance

- **Method:** `PUT /api/tm/attendance`
- **Contract:** **Must** send `attendance_day_id` in the body. The same day record is updated; do not omit `attendance_day_id`.

### Request body (required)
| Field              | Type   | Required | Description |
|--------------------|--------|----------|-------------|
| attendance_day_id  | number | Yes      | Existing attendance day ID to update |
| enterprise_id      | number | Yes      | Enterprise ID |
| employee_id        | number | Yes      | Employee ID |
| attendance_date    | string | Yes      | Date (time truncated) |
| attendance_status  | string | Yes      | Attendance status |

### Request body (optional)
Same optional fields as Create. Omitted fields are not sent to the procedure so that NVL logic in the DB preserves existing values.

### Response (200)
Same shape as Create; `data.attendance_day_id` is the same id that was sent; `data.attendance` is the refreshed view when available.

---

## Location and log_type

- **Location** from the UI is sent as `location` or `location_name`.
- The DB stores locations by `log_type`:
  - If the request includes `check_in_time`, the backend can store location with `log_type = CHECK_IN`.
  - If the request includes `check_out_time`, the backend can store location with `log_type = CHECK_OUT`.
- If the client sends **one** location and both check-in and check-out times, the backend may reuse that location for the log_type it is saving (e.g. CHECK_IN). To store different locations for check-in and check-out, send the appropriate `log_type` or use separate requests/fields as supported by the API.
- **Ensure `log_type` is passed correctly** when saving location: it must be `CHECK_IN` or `CHECK_OUT`.

---

## Error responses

All errors return `success: false` and a clear `error` message. Debug details are in `error_details`.

| Scenario | HTTP | error / error_details |
|----------|------|------------------------|
| Validation (missing/invalid field) | 400 | `VALIDATION_ERROR`, `validation_errors` array |
| Invalid employee/enterprise (ORA-02291) | 400 | "Invalid employee/enterprise reference" |
| Check constraint (ORA-02290 / ORA-20090) | 400 | Constraint rule message |
| Not null / missing required (ORA-01400) | 400 | Message identifying missing value (e.g. schedule_id, log_type); `null_column` in error_details when available |

---

## Summary

| Action           | Method | attendance_day_id      |
|------------------|--------|-------------------------|
| Create Attendance | POST   | **Do not send**         |
| Edit Attendance   | PUT    | **Must send**           |

Always pass `log_type` correctly when saving location (CHECK_IN or CHECK_OUT).
