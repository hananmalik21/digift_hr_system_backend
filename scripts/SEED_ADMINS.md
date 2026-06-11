# Platform admin seed user

Digify ERP bootstraps an **enterprise_admin** account so every environment and every enterprise has a ready-to-use login. This is not an employee-linked account and does not use job roles; permissions are resolved from `admin_type` and the full function catalog.

## Seeded account

| Account | Scope | Where created |
|---------|--------|----------------|
| **enterprise_admin** | Full function and data access within one enterprise (JWT `enterprise_id`) | Every enterprise — seed enterprise + auto on enterprise create + backfill |

### Default credentials (change in production)

| Field | Value |
|-------|--------|
| Username | `enterprise_admin` |
| Password | `Admin!ChangeMe` |
| Email (enterprise 1) | `enterprise_admin@localhost.local` |
| Email (other enterprises) | `enterprise_admin+{enterpriseId}@localhost.local` |

---

## Runtime behavior

| | **enterprise_admin** |
|--|---------------------|
| **User record** | Normal row in `FNDSEC.FNDSEC_USERS` |
| **Employee link** | None (`employee_id = null`) |
| **Job roles** | None (`roles: []` in profile) |
| **Permissions** | Full catalog from `FNDSEC.FNDSEC_FUNCTIONS` (~140 keys), not from RBAC hierarchy |
| **Function checks** | Bypass fine-grained permission-key gates (`admin_type` on JWT) |
| **Employee / data access** | Bypass FNDSEC `CAN_ACCESS_EMPLOYEE` / job-role & data-role row filters via `bypassesEmployeeDataAccess()` → `employeeAccessOptionsFromReq(req)` on secured list APIs |
| **Tenant scope** | Locked to JWT `enterprise_id`; client `tenant_id` / `enterprise_id` cannot override |

**Login requires `enterprise_id`** (same username can exist per tenant):

```http
POST /api/security/auth/login
Content-Type: application/json

{
  "login_id": "enterprise_admin",
  "password": "Admin!ChangeMe",
  "enterprise_id": 1
}
```

---

## How provisioning works

```
Node (config + Argon2 hash)
        │
        ▼
FNDSEC.FNDSEC_ADMIN_SEED_PKG
        │
        ├── ENSURE_PLATFORM_ADMIN   → one enterprise_admin for one enterprise
        └── SEED_PLATFORM_ADMINS    → enterprise_admin for seed enterprise
        │
        ▼
FNDSEC.FNDSEC_USERS_PKG (CREATE_USER / UPDATE_USER)
        │
        └── Clears employee link, clears job roles (role_assignments: [])
```

- **Password hashing** is done in Node (Argon2id); the DB package receives `password_hash`.
- **Permissions** for this user come from all active rows in `FNDSEC.FNDSEC_FUNCTIONS` (~140 keys), not from RBAC job roles. Profile returns `roles: []`.
- **`admin_type`** on login JWT: `enterprise_admin` (resolved in Node from `user_code` / `username`).

---

## Configuration

### Base config

File: `scripts/seed-admin.config.js`

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Set `false` to skip seed and backfill |
| `enterpriseId` | `1` | Seed enterprise |
| `password` | `Admin!ChangeMe` | Initial password for seeded admin |
| `skipIfUserExists` | `true` | Skip create if user already exists; still normalizes existing admin |
| `backfillActiveOnly` | `true` | Backfill only enterprises with `IS_ACTIVE = 'Y'` |

### Local overrides (optional, gitignored)

Create `scripts/seed-admin.local.js`:

```js
export default {
  password: 'YourLocalPassword',
  enterpriseId: 1
};
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `ADMIN_SEED_ENABLED` | `true` / `false` — enable or disable seed + backfill |
| `ADMIN_SEED_PASSWORD` | Override password (recommended in production) |
| `ADMIN_SEED_ENTERPRISE_ID` | Override seed enterprise id |

---

## When seed runs

| Trigger | What happens |
|---------|----------------|
| **App startup** (`index.js`) | Seed `enterprise_admin` for configured enterprise, then backfill missing admins per enterprise |
| **`npm run seed:admins`** | Seed `enterprise_admin` for seed enterprise |
| **`npm run seed:admins:backfill`** | Create `enterprise_admin` for active enterprises that don't have one |
| **New enterprise created** | `POST /api/enterprises` or onboard-enterprise-hierarchy → `enterprise_admin` for that tenant |

Backfill discovers missing enterprises in Node (queries `ENT.ENTERPRISES` + `FNDSEC.FNDSEC_USERS`), then calls `ENSURE_PLATFORM_ADMIN` per tenant.

---

## Database deployment

Run as Oracle user **FNDSEC** before first use:

```sql
@feature/security/users/sql/FNDSEC_ADMIN_SEED_PKG.sql
```

Recommended for login (`admin_type`, tenant-scoped login):

```sql
@feature/security/auth/sql/FNDSEC_AUTH_PKG.sql
```

If `FNDSEC_AUTH_PKG` is not redeployed, login still works — password lookup uses direct SQL; `LOGIN_USER` must exist in the deployed package.

---

## Key files

| Path | Purpose |
|------|---------|
| `scripts/seed-admin.config.js` | Default seed config |
| `scripts/seed-admin.local.js` | Optional local overrides |
| `scripts/seedAdminsService.js` | Config load, seed, backfill orchestration |
| `scripts/seed-admins.js` | CLI: seed only |
| `scripts/seed-admins-backfill.js` | CLI: backfill only |
| `feature/security/users/sql/FNDSEC_ADMIN_SEED_PKG.sql` | Oracle provisioning package |
| `feature/security/users/service/enterpriseAdminProvisioningService.js` | Enterprise-create hook |
| `feature/security/users/repository/enterpriseAdminBackfillRepository.js` | Find enterprises missing admin |
| `utils/adminAccess.js` | `admin_type` helpers and JWT bypass logic |

---

## Production checklist

1. Set `ADMIN_SEED_PASSWORD` (or `seed-admin.local.js`) to a strong secret — do not use `Admin!ChangeMe`.
2. Deploy `FNDSEC_ADMIN_SEED_PKG` (and preferably `FNDSEC_AUTH_PKG`) in each environment.
3. Confirm startup logs: `[seed-admins]` seed and backfill success.
4. Log in with `enterprise_id` and change passwords via your user-management flow if needed.
5. Optionally set `ADMIN_SEED_ENABLED=false` after initial bootstrap if you do not want re-seed on every restart (backfill will also be skipped).

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `procedure ... not found` | Deploy `FNDSEC_ADMIN_SEED_PKG.sql` as FNDSEC |
| Login fails, invalid credentials | Wrong `enterprise_id`; user seeded under a different tenant |
| Login `ORA-00904` on auth pkg | Redeploy `FNDSEC_AUTH_PKG` or rely on current Node password lookup |
| `NJS-003` / closed connection on login | Fixed in auth repository — ensure latest code; restart app |
| Backfill skips enterprises | Enterprise already has `enterprise_admin`, or `IS_ACTIVE != 'Y'` and `backfillActiveOnly` is true |
| Only ~7 permission keys | User has job roles attached — re-run seed; package clears roles on normalize |
| Empty employee list as admin | Log in as `enterprise_admin` with matching `enterprise_id`; JWT must include `admin_type: enterprise_admin` |
