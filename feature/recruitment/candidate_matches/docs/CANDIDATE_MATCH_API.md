# Find Candidates APIs

UI-ready matching candidates for a requisition. Display strings come from `REC.V_REQUISITION_CANDIDATE_MATCH`. Node does not recalculate match score, experience display, or availability text.

Canonical routes follow existing DigifyHR prefixes. Spec `/api/recruiting/...` aliases are also mounted.

| Method | Path |
| ------ | ---- |
| GET | `/api/recruitment/requisitions/:requisition_guid/find-candidates` |
| POST | `/api/recruitment/requisitions/:requisition_guid/candidates/:candidate_guid/add-as-applicant` |

Also mounted at `/api/rec/requisitions/...` and `/api/recruiting/requisitions/...`.

Enterprise ID is taken from hostname / JWT. Do not send `enterprise_id` as trusted security context. A mismatched query `enterprise_id` returns 403.

## cURL

```bash
TOKEN=...
BASE=http://localhost:3000
REQ=574176DB57C7EFCBE0631718000A61BB
CAND=53F8CDD520DAD58AE0631718000ADEDC

# Find matching candidates
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/recruiting/requisitions/$REQ/find-candidates?page=1&page_size=20&min_match_score=70&min_availability_score=80&availability_code=IMMEDIATE&sort_by=match_score&sort_order=desc"

# Add candidate as applicant
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source_code":"RECRUITER"}' \
  "$BASE/api/recruiting/requisitions/$REQ/candidates/$CAND/add-as-applicant"
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
      "application_guid": null,
      "can_add_as_applicant": true,
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

Flat match/availability fields are returned alongside nested objects so existing clients keep working.

### GET find-candidates — 404

```json
{
  "success": false,
  "message": "Requisition not found"
}
```

### POST add-as-applicant — 200

```json
{
  "success": true,
  "message": "Candidate added as applicant successfully",
  "data": {
    "candidate_guid": "53F8CDD520DAD58AE0631718000ADEDC",
    "requisition_guid": "574176DB57C7EFCBE0631718000A61BB",
    "application_guid": "APPLICATION_GUID",
    "application_stage": "APPLIED"
  }
}
```

Creates the application through `REC.CREATE_APPLICATION_PKG.apply_job` using the requisition’s job posting. Source defaults to `RECRUITER`.

### POST add-as-applicant — 409

```json
{
  "success": false,
  "message": "Candidate has already applied for this requisition."
}
```

## Errors

| Status | When |
| ------ | ---- |
| 200 | Success |
| 400 | Invalid query/body, missing job posting, or package business error |
| 401 | Unauthenticated (auth middleware) |
| 403 | Enterprise context mismatch |
| 404 | Requisition or candidate not found in the authenticated enterprise |
| 409 | Candidate already applied |
| 500 | Unexpected database error (Oracle detail is logged, not returned) |

## View columns

Reads `SELECT v.*` from `REC.V_REQUISITION_CANDIDATE_MATCH`, with
`ESTIMATED_AVAILABLE_DATE` also projected as `YYYY-MM-DD`, plus a
`REC.V_APPLICATIONS` join for `already_applied`.

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

`INITIALS` is presentation-only and is derived in Node from `FIRST_NAME` / `LAST_NAME`.

Add-as-applicant requires a row in `REC.V_JOB_POSTINGS` for the requisition because `apply_job` takes `p_posting_guid`.
