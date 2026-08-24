# Find Candidates APIs

UI-ready matching candidates for a requisition. Display strings come from `REC.V_REQUISITION_CANDIDATE_MATCH`. Node does not recalculate match score, experience display, or availability text.

Canonical routes follow existing DigifyHR prefixes. Spec `/api/recruiting/...` aliases are also mounted.

| Method | Path |
| ------ | ---- |
| GET | `/api/recruitment/requisitions/:requisition_guid/find-candidates` |
| POST | `/api/recruitment/requisitions/:requisition_guid/applicants` |
| POST | `/api/recruitment/requisitions/:requisition_guid/candidates/:candidate_guid/add-as-applicant` (legacy alias) |

Also mounted at `/api/rec/requisitions/...` and `/api/recruiting/requisitions/...`.

`POST .../applicants` requires `enterprise_id` and `candidate_guid` in the body. `created_by` and `source_code` are never accepted from the client — `p_created_by` comes from the JWT username, and the application source is always `HR_SYSTEM` (set by `REC.ADD_AS_APPLICANT_PKG`).

Enterprise ID is resolved from hostname / JWT (body `enterprise_id` is validated and checked for tenant match). A mismatched `enterprise_id` returns 403.

## cURL

```bash
TOKEN=...
BASE=http://localhost:3000
REQ=574176DB57C7EFCBE0631718000A61BB
CAND=53F8CDD520DAD58AE0631718000ADEDC

# Find matching candidates
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/recruitment/requisitions/$REQ/find-candidates?page=1&page_size=20&min_match_score=70&min_availability_score=80&availability_code=IMMEDIATE&sort_by=match_score&sort_order=desc"

# Add candidate as applicant
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"enterprise_id\":1,\"candidate_guid\":\"$CAND\"}" \
  "$BASE/api/recruitment/requisitions/$REQ/applicants"
```

## Query parameters

| Param | Default | Notes |
| ----- | ------- | ----- |
| `page` | 1 | Positive integer |
| `page_size` | 20 | Max 100. Pagination is applied in Oracle (`OFFSET` / `FETCH NEXT`). |
| `min_match_score` | — | 0–100 |
| `min_availability_score` | — | 0–100; filters on view `AVAILABILITY_SCORE` |
| `match_level` | — | Exact view `MATCH_LEVEL` |
| `availability_code` | — | Exact view `AVAILABILITY_CODE` (e.g. `IMMEDIATE`) |
| `location` | — | LIKE on `CURRENT_LOCATION` / `LOCATION_DISPLAY` |
| `willing_to_relocate` | — | `Y` or `N` |
| `applied_status` | `ALL` | `ALL`, `APPLIED` (`APPLIED_FLAG=Y`), `NOT_APPLIED` (`APPLIED_FLAG=N`) |
| `application_stage_code` | — | Exact view `APPLICATION_STAGE_CODE` |
| `application_status_code` | — | Exact view `APPLICATION_STATUS_CODE` |
| `search` | — | `CANDIDATE_NAME`, `CURRENT_TITLE`, `CURRENT_EMPLOYER`, `EMAIL`, `CURRENT_LOCATION` |
| `sort_by` | `match_score` | `match_score`, `years_experience`, `availability_score`, `candidate_name` |
| `sort_order` | `desc` | `asc` or `desc` |

## Example responses

### GET find-candidates — 200

```json
{
  "success": true,
  "message": "Matching candidates fetched successfully",
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 4,
    "total_pages": 1,
    "has_next": false,
    "has_previous": false
  },
  "requisition": {
    "requisition_guid": "574176DB57C7EFCBE0631718000A61BB",
    "requisition_number": "REQ-2026-000038",
    "requisition_title": "Gen-AI Engineer"
  },
  "summary": {
    "total_matches": 4
  },
  "data": [
    {
      "candidate_id": 16,
      "candidate_guid": "53F8CDD520DAD58AE0631718000ADEDC",
      "candidate_name": "Alex James Mercer",
      "initials": "AM",
      "email": "alex.mercer@innovate.com",
      "phone": "+96555123456",
      "current_title": "Senior Software Engineer",
      "current_employer": "Tech Synergy Ltd",
      "candidate_subtitle": "Senior Software Engineer at Tech Synergy Ltd",
      "experience": { "years": 6, "display": "6 years" },
      "location": { "value": "Austin, TX", "display": "Austin, TX" },
      "availability": {
        "score": 80,
        "code": "WITHIN_1_MONTH",
        "notice_period_days": 30,
        "estimated_available_date": "2026-09-22",
        "display": "Available in 1 month"
      },
      "match": {
        "score": 82,
        "display": "82% Match",
        "level": "STRONG",
        "recommendation": "SHORTLIST"
      },
      "scores": {
        "title": 88,
        "experience": 85,
        "availability": 80,
        "relocation": 50
      },
      "willing_to_relocate": "N",
      "profiles": {
        "linkedin": "https://linkedin.com/in/alexmercer-dev",
        "portfolio": "https://alexmercer.dev",
        "github": "https://github.com/alexmercer-codes"
      },
      "profile_completeness_score": 100,
      "skills": [],
      "talent_pool": null,
      "education": null,
      "already_applied": false,
      "applied_flag": "N",
      "application_status": "NOT_APPLIED",
      "can_add_as_applicant": "Y",
      "application_count": 0,
      "application_id": null,
      "application_guid": null,
      "application_number": null,
      "application_stage_code": null,
      "application_status_code": null,
      "application_applied_date": null,
      "application": {
        "applied_flag": "N",
        "application_status": "NOT_APPLIED",
        "can_add_as_applicant": "Y",
        "application_count": 0,
        "application_id": null,
        "application_guid": null,
        "application_number": null,
        "stage_code": null,
        "status_code": null,
        "applied_date": null
      },
      "match_score": 82,
      "match_display": "82% Match",
      "availability_score": 80,
      "availability_code": "WITHIN_1_MONTH",
      "availability_text": "Available in 1 month",
      "notice_period_days": 30
    }
  ]
}
```

Flat match/availability/application fields are returned alongside nested objects so existing clients keep working. Application status comes from `REC.V_REQUISITION_CANDIDATE_MATCH` (`APPLIED_FLAG`, `CAN_ADD_AS_APPLICANT`, etc.) — Node does not join `REC.REC_APPLICATIONS` or invent flags.

### GET find-candidates — 404

```json
{
  "success": false,
  "message": "Requisition not found"
}
```

### POST applicants (add as applicant) — 201

```json
{
  "success": true,
  "message": "Candidate added as applicant successfully.",
  "data": {
    "application_id": 123,
    "application_guid": "APPLICATION_GUID",
    "application_number": "APP-2026-000123",
    "requisition_guid": "574176DB57C7EFCBE0631718000A61BB",
    "candidate_guid": "53F8CDD520DAD58AE0631718000ADEDC",
    "source_code": "HR_SYSTEM",
    "current_stage_code": "APPLIED",
    "status_code": "NEW"
  }
}
```

Creates the application through `REC.ADD_AS_APPLICANT_PKG.ADD_AS_APPLICANT`. Source is always `HR_SYSTEM`. New applications start at stage `APPLIED` / status `NEW`.

Request body:

```json
{
  "enterprise_id": 1,
  "candidate_guid": "53F8CDD520DAD58AE0631718000ADEDC"
}
```

### POST applicants — 409

```json
{
  "success": false,
  "message": "Candidate is already an applicant for this requisition."
}
```

### POST applicants — other package errors

| Status | Message |
| ------ | ------- |
| 404 | `Requisition does not exist.` |
| 404 | `Candidate does not exist.` |
| 400 | `The requisition must be approved before a candidate can be added as an applicant.` |
| 400 | `The requisition must be open before a candidate can be added as an applicant.` |
| 400 | `An active job posting is required before a candidate can be added as an applicant.` |
| 500 | `Unable to add candidate as applicant.` |

The API does **not** look up `posting_guid`. `REC.ADD_AS_APPLICANT_PKG` finds the active posting for the requisition and returns the no-posting message above when none exists.

## Errors

| Status | When |
| ------ | ---- |
| 201 | Applicant created |
| 200 | Find-candidates success |
| 400 | Invalid body/query, or package business rule (not approved / not open / no posting) |
| 401 | Unauthenticated (auth middleware) or missing acting username |
| 403 | Enterprise context mismatch |
| 404 | Requisition or candidate not found |
| 409 | Candidate already an applicant for this requisition |
| 500 | Unexpected error (Oracle detail is logged, not returned) |

## View columns

Reads `SELECT v.*` from `REC.V_REQUISITION_CANDIDATE_MATCH`, with
`ESTIMATED_AVAILABLE_DATE` and `APPLICATION_APPLIED_DATE` also projected as
`YYYY-MM-DD`. Application status is provided by the view — no per-row
`REC.REC_APPLICATIONS` lookup.

| API field | View source |
| --------- | ----------- |
| `availability_score` / `availability.score` | `AVAILABILITY_SCORE` |
| `availability_code` / `availability.code` | `AVAILABILITY_CODE` |
| `availability_text` / `availability.display` | `AVAILABILITY_TEXT` |
| `notice_period` | `NOTICE_PERIOD` |
| `notice_period_days` | `NOTICE_PERIOD_DAYS` |
| `estimated_available_date` | `ESTIMATED_AVAILABLE_DATE` (`YYYY-MM-DD`) |
| `match_score` / `match.score` | `MATCH_SCORE` |
| `match_display` / `match.display` | `MATCH_DISPLAY` |
| `match_level` / `match.level` | `MATCH_LEVEL` |
| `recommendation_code` / `match.recommendation` | `RECOMMENDATION_CODE` |
| `candidate_subtitle` | `CANDIDATE_SUBTITLE` |
| `experience.display` | `EXPERIENCE_DISPLAY` |
| `location.display` | `LOCATION_DISPLAY` |
| `applied_flag` / `application.applied_flag` | `APPLIED_FLAG` |
| `application_status` / `application.application_status` | `APPLICATION_STATUS` |
| `can_add_as_applicant` / `application.can_add_as_applicant` | `CAN_ADD_AS_APPLICANT` |
| `application_count` | `APPLICATION_COUNT` |
| `application_id` / `application.application_id` | `APPLICATION_ID` |
| `application_guid` / `application.application_guid` | `APPLICATION_GUID` |
| `application_number` | `APPLICATION_NUMBER` |
| `application_stage_code` / `application.stage_code` | `APPLICATION_STAGE_CODE` |
| `application_status_code` / `application.status_code` | `APPLICATION_STATUS_CODE` |
| `application_applied_date` / `application.applied_date` | `APPLICATION_APPLIED_DATE` (`YYYY-MM-DD`) |

`INITIALS` is presentation-only and is derived in Node from `FIRST_NAME` / `LAST_NAME`.

Add-as-applicant is handled entirely by `REC.ADD_AS_APPLICANT_PKG` (including active posting checks). Node does not insert into `REC.REC_APPLICATIONS` directly.
