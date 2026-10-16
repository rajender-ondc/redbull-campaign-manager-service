# Campaign Manager: S1 Configuration & Registry

S1 of the Redbull & CCTV platform: the service where Marketing configures what every other service uses. This means categories, Buyer Apps, affiliates and campaigns. Requirements are in [docs/PRD.md](docs/PRD.md) and the design is in [docs/architecture.md](docs/architecture.md).

Built so far:
- **login and users** (`/api/v1/auth`, `/api/v1/users`);
- **categories** (`/api/v1/categories`);
- **channels** (`/api/v1/channels`);
- **affiliates** (`/api/v1/affiliates`).

> Every API call needs a login token, except logging in and forgot password ([ADR-015](docs/adr/ADR-015-authentication-in-s1.md)). Admins change configuration and manage users; users read. See [Before production](#before-production) for what must still be done.

## Requirements

- Node.js 22 or later
- A MongoDB server you can reach (local, remote or Atlas)
- OpenSSL, to create a signing key (it comes with macOS and Linux)

## Set up and run

```bash
npm install
cp .env.example .env     # then edit .env: at least MONGODB_URI

# The private key S1 signs login tokens with. This adds it to .env as JWT_SECRET_KEY (one line),
# without printing it or creating a file. .env is git-ignored: never commit it.
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  | awk 'BEGIN { printf "\nJWT_SECRET_KEY=\"" } { printf "%s\\n", $0 } END { print "\"" }' >> .env

# The first admin, once. It prints a random password once: copy it.
npm run create-admin -- --email you@ondc.org --name "Your Name"

npm run dev              # restarts on code changes; use `npm start` for a plain run
```

`.env` settings (see `.env.example` for examples):

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `MONGODB_URI` | yes | — | MongoDB connection string, **including the database name**, e.g. `mongodb://127.0.0.1:27017/campaign_manager`. URL-encode special characters in the password |
| `JWT_SECRET_KEY` | yes | — | S1's private signing key: an RSA key of at least 2048 bits in PEM format, on one line in double quotes with `\n` between its lines. The command above adds it |
| `JWT_ISSUER` | yes | — | Who issues the tokens (the `iss` claim), e.g. `redbull-auth` |
| `JWT_AUDIENCE` | yes | — | Which APIs the tokens are for (the `aud` claim), e.g. `redbull-api` |
| `ACCESS_TOKEN_TTL_MINUTES` | yes | — | How long a login token lasts, in minutes (5–1440), e.g. `60`. Provisional |
| `PORT` | no | `3000` | HTTP port |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |

On start you should see:

```text
Connected to MongoDB database "campaign_manager" at 127.0.0.1:27017
Campaign manager listening on port 3000 [development]
```

If a variable is missing or invalid, or `JWT_SECRET_KEY` isn't an RSA private key of at least 2048 bits, the service stops immediately with a message saying why. The message never shows the key.

## Try the API by hand

The full contract is [docs/api/openapi.yaml](docs/api/openapi.yaml); Postman and Insomnia can import it. What each field accepts, and why it matters to the business, is in [docs/validation-rules.md](docs/validation-rules.md).

### 1. Log in and keep the token

```bash
curl -i -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@ondc.org","password":"<the password create-admin printed>"}'

# Copy "accessToken" from the response, then:
TOKEN='<accessToken>'
AUTH="Authorization: Bearer $TOKEN"
```

In Postman, add a Post-response script to the login request, then set each request's **Authorization** tab to *Bearer Token* with `{{token}}`:

```js
pm.environment.set("token", pm.response.json().data.accessToken);
```

The token lasts 60 minutes. After that, any call answers 401 `INVALID_TOKEN`; log in again.

```bash
# Log out: this token stops working at once (204). Your other sessions keep working.
curl -i -X POST localhost:3000/api/v1/auth/logout -H "$AUTH"
```

### 2. Users and passwords

```bash
# An admin creates a colleague and shares the password with them
curl -i -X POST localhost:3000/api/v1/users -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ravi Kumar","email":"ravi@ondc.org","role":"user","password":"Welcome@2026"}'

# Your own profile
curl -i localhost:3000/api/v1/users/me -H "$AUTH"

# Change your own password (afterwards, log in again: older tokens stop working)
curl -i -X PUT localhost:3000/api/v1/users/me/password -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"Welcome@2026","newPassword":"Changed#2026"}'

# Forgot password (no token needed; see "Before production")
curl -i -X POST localhost:3000/api/v1/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"ravi@ondc.org","newPassword":"Forgot#2026"}'

# An admin disables someone who left (users are never deleted)
curl -i -X PATCH localhost:3000/api/v1/users/<id> -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"status":"disabled"}'
```

Passwords need at least 8 characters, with an uppercase letter, a lowercase letter, a digit and a symbol. Five wrong passwords in a row lock the account for 15 minutes.

### 3. Configuration (reading needs any login; changing needs an admin)

```bash
# Create (copy the "id" from the response)
curl -i -X POST localhost:3000/api/v1/categories -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Grocery","aliases":["Spices","Snacks"]}'

# List, page by page
curl -i 'localhost:3000/api/v1/categories?page=1&limit=20' -H "$AUTH"

# Read one; the ETag header is its version, e.g. "1"
curl -i localhost:3000/api/v1/categories/<id> -H "$AUTH"

# Change fields; If-Match makes the save fail (412) if someone changed it since version 1
curl -i -X PATCH localhost:3000/api/v1/categories/<id> -H "$AUTH" \
  -H 'Content-Type: application/json' -H 'If-Match: "1"' \
  -d '{"defaultWindowDays":10}'

# Delete; refused with 409 while a campaign uses the category
curl -i -X DELETE localhost:3000/api/v1/categories/<id> -H "$AUTH"
```

Channels work the same way:

```bash
curl -i -X POST localhost:3000/api/v1/channels -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"name":"WhatsApp"}'

# Listed by name, ignoring letter case
curl -i localhost:3000/api/v1/channels -H "$AUTH"

# Search by name: the text can appear anywhere, in any letter case ("app" finds WhatsApp)
curl -i 'localhost:3000/api/v1/channels?search=app' -H "$AUTH"

# Rename a channel
curl -i -X PATCH localhost:3000/api/v1/channels/<id> -H "$AUTH" \
  -H 'Content-Type: application/json' -H 'If-Match: "1"' \
  -d '{"name":"WhatsApp groups"}'

# Delete; refused with 409 while a campaign's affiliate uses the channel
curl -i -X DELETE localhost:3000/api/v1/channels/<id> -H "$AUTH"
```

Affiliates get a server-generated `code` for their tracking links (e.g. `ckB7XQ` for CashKaro). It never changes, not even on a rename:

```bash
curl -i -X POST localhost:3000/api/v1/affiliates -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"name":"CashKaro","contactEmail":"ops@cashkaro.com","defaultCommissionRatePercent":6}'

# Only active affiliates, e.g. for the campaign wizard; combine with ?search=kar
curl -i 'localhost:3000/api/v1/affiliates?status=active' -H "$AUTH"

# Pause (no longer selectable for new campaigns); resume with {"status":"active"}
curl -i -X PATCH localhost:3000/api/v1/affiliates/<id> -H "$AUTH" \
  -H 'Content-Type: application/json' -H 'If-Match: "1"' \
  -d '{"status":"paused"}'

# Delete; refused with 409 while a campaign has the affiliate (pause it instead)
curl -i -X DELETE localhost:3000/api/v1/affiliates/<id> -H "$AUTH"
```

Every error comes back as `application/problem+json` with a stable `code` (e.g. `CATEGORY_NAME_TAKEN`). Every response carries `Cache-Control: no-store`.

## Automated checks

```bash
npm test               # API tests against a throwaway in-memory MongoDB and a throwaway key; your .env is never touched
npm run lint
npm run format:check   # npm run format fixes formatting
```

The first `npm test` downloads a MongoDB binary once (about 100 MB, then cached).

## Before production

- **Forgot password has no verification.** This is an accepted risk for now (ADR-015).
  - Anyone who knows a colleague's email can set a new password for them.
  - Its 404 for an unknown email also shows which emails have accounts.
  - The fix, before production: add an emailed link or code through ONDC's mail relay, and give the same answer for every email.
- **The signing key comes from a secret store,** given to the service as the `JWT_SECRET_KEY` environment variable. Never keep it in the repository or an image.
- **HTTPS only,** because tokens and passwords cross the network.
- **Decided with the cross-service work** (ADR-015):
  - how S2–S4 get the public key;
  - the final token lifetime and refresh tokens;
  - how the other services learn about logouts (S1 itself refuses a logged-out token: ADR-016);
  - CORS for the UI, and where the UI keeps the token (in memory, never in a URL).
- **Worth adding:** a login history, rate limiting by IP address, and multi-factor authentication.

## Project structure

```text
src/
  app.js            Express app: middlewares, routes, error handling, no-store caching
  server.js         start-up (configuration, signing key, database) and graceful shutdown
  config/           env.js (reads and validates .env) and database.js (MongoDB connection)
  routes/           index.js mounts login (public) and every resource (signed in) under /api/v1
  validators/       request validation (Zod)
  controllers/      HTTP in and out
  services/         business rules; token.service.js signs and verifies login tokens
  repositories/     the only code that talks to MongoDB
  models/           Mongoose schemas and indexes
  middlewares/      authenticate, authorize, validation runner, error handler (404, 405, Problem Details)
  errors/           ApiError and the shared 404/409/412 error builders
  constants/        business limits, one file per resource
  utils/            code several resources reuse: validation, MongoDB helpers, responses, passwords (ADR-012)
scripts/
  create-admin.js   creates the first admin, once
tests/
  integration/      API tests
  setup/            in-memory MongoDB, a throwaway signing key and shared test helpers
docs/
  adr/              architecture decision records
  api/openapi.yaml  API contract
```
