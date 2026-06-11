# Platform admin seed users

Digify ERP bootstraps two **system admin accounts** so every environment and every enterprise has a ready-to-use login. These are not employee-linked accounts and do not use job roles; permissions are resolved from `admin_type` and the full function catalog.

## Seeded accounts

| Account | Scope | Where created |
|---------|--------|----------------|
| **enterprise_admin** | Full function access within one enterprise (JWT `enterprise_id`) | Every enterprise — seed enterprise + auto on enterprise create + backfill |
| **super_admin** | Cross-enterprise access (any `tenant_id` / `enterprise_id`) | Seed enterprise only (default: enterprise `1`) |

### Default credentials (change in production)

| Field | enterprise_admin | super_admin |
|-------|------------------|-------------|
| Username | `enterprise_admin` | `super_admin` |
| Password | `Admin!ChangeMe` | `Admin!ChangeMe` |
| Email (enterprise 1) | `enterprise_admin@localhost.local` | `super_admin@localhost.local` |
| Email (other enterprises) | `enterprise_admin+{enterpriseId}@localhost.local` | — |

---

## Super admin vs enterprise admin

These two tiers behave differently at **login/storage** vs **runtime access**.

### What is the same

| | Both platform admins |
|--|---------------------|
| **User record** | Normal row in `FNDSEC.FNDSEC_USERS` |
| **Employee link** | None (`employee_id = null`) |
| **Job roles** | None (`roles: []` in profile) |
| **Permissions** | Full catalog from `FNDSEC.FNDSEC_FUNCTIONS` (~140 keys), not from RBAC hierarchy |
| **Function checks** | Bypass fine-grained permission-key gates (`admin_type` on JWT) |

### What is different

| | **enterprise_admin** | **super_admin** |
|--|---------------------|-----------------|
| **Purpose** | Admin for **one tenant** | **Platform-wide** operator |
| **How many** | **One per enterprise** (backfill + enterprise create) | **One per environment** (seed enterprise only) |
| **Home enterprise** | The enterprise it belongs to | Stored under seed enterprise (default `1`) — a **login anchor**, not an access limit |
| **JWT `enterprise_id`** | Fixed to that tenant | Set to home enterprise at login |
| **JWT `admin_type`** | `enterprise_admin` | `super_admin` |
| **Calling APIs** | `tenant_id` / `enterprise_id` on requests is **ignored**; JWT enterprise always wins | May pass **any** `tenant_id` / `enterprise_id` on query/body/header to act on that tenant |
| **Employee / data scope** | Still subject to FNDSEC data-access rules unless Oracle grants say otherwise | Same — global **tenant selection** is API-level; row-level data access may still apply |

### Super admin is global at runtime, not in the database

`super_admin` is **not** a special Oracle user type and **not** stored without an enterprise. It is a normal security user with:

- `user_code` / `username` = `super_admin`
- `ENTERPRISE_ID` = seed enterprise (default `1`)

**Global access is not from the DB row.** It comes from:

1. Login resolves `admin_type = super_admin` from `user_code` / `username` (`FNDSEC_AUTH_PKG` + `utils/adminAccess.js`).
2. JWT carries `admin_type: "super_admin"`.
3. Middleware and `getScopedTenantId()` (`utils/tenantUtils.js`) let super admin **choose the tenant per request** instead of locking to JWT `enterprise_id`.

```
Login (DB)                         After login (API)
─────────────────────────         ─────────────────────────────────────
FNDSEC_USERS row                  JWT: admin_type = super_admin
  enterprise_id = 1                 enterprise_id = 1  (home / login anchor)
  username = super_admin
                                  GET /api/...?tenant_id=7   → acts on enterprise 7
No employee, no job roles         POST body tenant_id=12       → acts on enterprise 12
```

**Why login still needs `enterprise_id`:** usernames are unique **per enterprise** in `FNDSEC_USERS`. Every enterprise can have its own `enterprise_admin`; the same login id can exist in multiple tenants. `enterprise_id` on login selects **which row** to authenticate — for `super_admin`, use the seed enterprise (default `1`).

```http
POST /api/security/auth/login

{
  "login_id": "super_admin",
  "password": "Admin!ChangeMe",
  "enterprise_id": 1
}
```

**Super admin is never backfilled per enterprise** — only `enterprise_admin` is created for each new/missing tenant. There is intentionally a single platform super admin (plus optional future ones you create manually under the same pattern).

---

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
        ├── ENSURE_PLATFORM_ADMIN   → one admin for one enterprise
        └── SEED_PLATFORM_ADMINS    → enterprise_admin + super_admin for seed enterprise
        │
        ▼
FNDSEC.FNDSEC_USERS_PKG (CREATE_USER / UPDATE_USER)
        │
        └── Clears employee link, clears job roles (role_assignments: [])
```

- **Password hashing** is done in Node (Argon2id); the DB package receives `password_hash`.
- **Permissions** for these users come from all active rows in `FNDSEC.FNDSEC_FUNCTIONS` (~140 keys), not from RBAC job roles. Profile returns `roles: []`.
- **`admin_type`** on login JWT: `enterprise_admin` or `super_admin`.

---

## Configuration

### Base config

File: `scripts/seed-admin.config.js`

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Set `false` to skip seed and backfill |
| `enterpriseId` | `1` | Seed enterprise (super_admin + fixed enterprise_admin email) |
| `password` | `Admin!ChangeMe` | Initial password for seeded admins |
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
| **App startup** (`index.js`) | Seed platform admins for configured enterprise, then backfill missing `enterprise_admin` per enterprise |
| **`npm run seed:admins`** | Seed `enterprise_admin` + `super_admin` for seed enterprise |
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
