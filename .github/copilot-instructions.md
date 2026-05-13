# BIND Server Manager — Copilot Instructions

## Commands

```json
# Root workspace (both client + server)
"dev": "concurrently \"npm run dev:server\" \"npm run dev:client\""
"lint": "npm run lint -w server && npm run lint -w client"
"build:client": "npm run build -w client"

# Server (Express)
"dev": "node --watch src/index.js"          # Auto-restart on file changes
"start": "node src/index.js"
"lint": "eslint src/"

# Client (React + Vite)
"dev": "vite"                                # Dev server on :5173
"build": "vite build"
"lint": "eslint src/"
```

**No test framework is configured** — there are no test scripts or test runners in the project.

Running a specific lint: `npm run lint -w server` or `npm run lint -w client`.

## High-Level Architecture

### Stack
- **Backend**: Express 5 (CommonJS, `require`/`module.exports`) — runs on port 3000
- **Frontend**: React 19 + Vite 6 + Tailwind CSS 3 (ESM, `import`/`export`) — dev server on port 5173, proxies `/api` to backend
- **Database**: SQLite via `sql.js` WASM (in-process, not native sqlite3) — stored at `server/data/bindmgr.db`
- **Auth**: JWT with 30-minute session timeout (token age check, not JWT expiry)
- **DNS**: BIND 9 — interacts via `rndc`, `named-checkconf`, `named-checkzone` CLI tools

### Data Flow
1. Frontend calls `/api/*` → Vite proxies to Express in dev; Express serves `client/dist/` in production
2. Backend routes (in `server/src/routes/`) handle requests, call services (in `services/`) and DB helpers (in `db.js`)
3. DB operations write to an in-memory SQLite database, then `saveDB()` exports and writes to disk
4. BIND operations (zone files, rndc) are managed through `server/src/services/bind.js`

### Project Layout (npm workspaces)
```
bind-server-manager/
├── client/       # React SPA (ESM)
├── server/       # Express API (CommonJS)
└── package.json  # Workspace root
```

## Key Conventions

### Database (`server/src/db.js`)
- Uses `sql.js` (SQLite compiled to WebAssembly) — **not** the native `sqlite3` package
- **Schema migrations use `ALTER TABLE ... ADD COLUMN` wrapped in try/catch** — columns are added silently if they already exist
- Three DB helper functions: `query(sql, params)` → array of rows, `queryOne(sql, params)` → single row or null, `run(sql, params)` → `{ lastInsertRowid, changes }`
- Must call `saveDB()` after every write — `run()` does this automatically
- Database path: `server/data/bindmgr.db` (configurable via `DB_PATH` env var, default from `config.js`)

### Route Patterns (`server/src/routes/`)
- Every route module applies `router.use(authMiddleware)` at the top
- Write routes (POST/PUT/DELETE) use `requireRole('super_admin', 'ops_admin')` for RBAC
- Rate limiting is applied per-route with `express-rate-limit` (login: 5/min, records: 30/min)
- Audit middleware wraps write routes — it intercepts `res.json()` to log after sending the response
- Route responses: `res.json({ zones, records, ... })` — always return named objects, not arrays
- Error messages and UI labels are in **Chinese** — maintain this convention
- Operation logging via `addLog({ userId, username, action, target, detail, ip, status })`

### Validation (`server/src/utils/validators.js`)
- DNS record types each have specific validation rules
- CNAME cannot coexist with other record types on the same name
- Wildcard (`*`) records conflict-check with existing records
- Zone-level validation (NS count 2–7, NS not CNAME, NS must have A/AAAA, duplicate NS IPs) via `validateZoneRecords()`
- Hostname helpers: `ensureTrailingDot()` (adds `.` for zone files), `normalizeHostname()` (strips `.` for DB)

### Zone Files (`server/src/utils/zonefile.js`)
- `generateZoneFile(zoneName, records, zone)` generates BIND zone content from DB records
- Records are grouped by type and output in a fixed order: NS → A → AAAA → MX → CNAME → TXT → SRV → CAA → PTR
- SOA serial uses `YYYYMMDDNN` format — auto-incremented within same day, resets to `01` on new day
- Records written to zone files via `bind.js` `writeZoneFile()` which validates with `named-checkzone` before atomic write

### BIND Integration (`server/src/services/bind.js`)
- Zone entries added to `named.conf` (or included files like `named.conf.local`) via `addToNamedConf()`
- **All file writes use atomic pattern**: write to `.tmp.PID` file, validate with `named-checkconf`, then `rename()` into place
- BIND status checks use multiple fallback strategies: rndc → pgrep → ss → pidfile
- Query logging is auto-configured by `ensureQueryLogging()` — injects a `logging {}` block into named.conf

### Audit System (`server/src/utils/audit.js`)
- Chain-hash auditing: `hash = SHA256(prev_hash | action | detail | timestamp | ip)`
- Audit logs are **INSERT-only** — no updates or deletes allowed
- Integrity can be verified with `verifyChainIntegrity()` — re-computes all hashes and checks `prev_hash` chain

### RBAC Roles (3-tier)
- `super_admin`: full access including user management
- `ops_admin`: create/update/delete operations (no user management, no audit)
- `readonly`: only audit log access

### Frontend Patterns
- React Router v7 with `AuthProvider` context wrapping the entire app
- Axios instance (`client/src/api.js`) with interceptors for JWT token injection and 401 redirects
- Tailwind CSS with custom `primary` color palette (blue shades)
- Pages use `<Outlet />` in Layout component for nested routing under auth guard (`PrivateRoute`)
- Sidebar navigation is role-filtered — each nav item has a `roles` array
- Login/Register pages are outside the protected layout
