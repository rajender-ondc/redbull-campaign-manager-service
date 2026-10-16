# ADR-010: S1 service conventions (structure, REST, errors, validation, tests)

- **Status:** Accepted, 13 Oct 2026. **Amended by ADR-012** (14 Oct 2026): shared code now lives in `src/utils/`.
- **Service:** S1 Configuration & Registry

## Context

Categories are the first code in this repository. Every later S1 resource (Buyer Apps, affiliates, channels, campaigns) will copy whatever patterns we set now. The code has to be:
- enterprise quality;
- easy for a new backend engineer to follow;
- free of needless complexity.

`CLAUDE.md` asks us to:
- keep controllers, business logic, data access and validation separate;
- validate every input at the boundary and every environment variable at start-up;
- use consistent response and error formats;
- paginate collection endpoints.

## Decision

### 1. Runtime and structure

- **Runtime:** Node.js ≥ 22, CommonJS JavaScript (as the repo was set up), Express 5.
- **Layer folders,** following the folder structure in `CLAUDE.md`:

  ```text
  src/
    app.js                     builds the Express app (no listening), so tests can use it directly
    server.js                  start-up: env → MongoDB → listen; graceful shutdown
    config/env.js              loads .env (if present), validates environment variables, fails fast
    config/database.js         MongoDB connection settings, connect and disconnect
    routes/index.js            mounts every resource router under /api/v1
    routes/<resource>.routes.js  URL + method → validation → controller; 405 for other methods
    validators/                Zod schemas for params, query, headers, body
    middlewares/               validate(schemas); errorHandler.js (Problem Details, 404, 405)
    controllers/               HTTP in and out only (status, headers, { data })
    services/                  business rules
    repositories/              the only code that talks to MongoDB
    models/                    Mongoose schemas and indexes
    errors/ApiError.js         the ApiError class every layer throws, plus builders for the shared 404/409/412 errors
    constants/                 business limits shared by models, validators and services
    utils/                     code every resource reuses (ADR-012): validation.js, mongo.js, response.js
  tests/
    integration/               API tests
    setup/                     in-memory MongoDB start, clear and stop; shared test helpers
  ```
- **Folders without files are created only when first needed:** `tests/unit/` and `tests/fixtures/` are still to come. `scripts/` (`create-admin.js`) and the `authenticate.js` / `authorize.js` middlewares arrived with login (ADR-015).
- **No dependency-injection framework.** Modules `require` each other directly ("no DI — it's just simple functions calling other functions", Practica.js).

### 2. REST conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1` |
| Resources | Plural nouns, items addressed by id (`/categories/{id}`) |
| Names | camelCase JSON properties and query parameters, matching the MongoDB fields; timestamps are `createdAt` and `updatedAt`; kebab-case URL paths (see the naming standard in section 6) |
| Response shape | `{ "data": … }`; lists add `"pagination": { "page", "limit", "totalItems", "totalPages" }` |
| Pagination | Offset-based `page` / `limit`: `limit` defaults to 20, maximum 100. Unknown query parameters are rejected |
| Search | A list that offers search takes `search`. It matches text anywhere in the name, ignoring letter case and outer spaces, with characters taken exactly as typed. A blank value lists everything, and paging and `totalItems` cover only the matches. So far: channels (ADR-013) and affiliates (ADR-014) |
| Create | `POST` returns `201` with a `Location` header |
| Update | `PATCH` changes only the fields sent; arrays are replaced whole |
| Delete | `DELETE` returns `204` |
| Unsupported method | `405` with an `Allow` header |
| Optimistic concurrency | `ETag` is the item's `currentVersionNo`; optional `If-Match` on PATCH/DELETE; `412` if it's stale |

### 3. Errors

- Every error is **RFC 9457 Problem Details** (`application/problem+json`): `type`, `title`, `status`, `code`, `detail`, `instance`, plus `errors[]` (field and message) for validation failures.
- Status codes:
  - all invalid input → **400** (`VALIDATION_FAILED` or `MALFORMED_JSON`);
  - non-JSON body → 415; body over 100 KB → 413;
  - database unreachable → 503;
  - anything unexpected → 500, with no internals or stack traces leaked.
- The error is logged on the server side.

### 4. Validation

**Zod** at the boundary, through one `validate({ params, query, headers, body })` middleware. Cleaned values go on `req.validatedInput`, because Express 5 makes `req.query` read-only. Strict schemas reject unknown fields. The same library validates environment variables at start-up. [`docs/validation-rules.md`](../validation-rules.md) lists every rule for each resource, with its business reason.

### 5. Testing

- **API tests first:** Node's built-in `node:test` plus `supertest`, against a real in-memory MongoDB (`mongodb-memory-server`). They live in `tests/integration/`; the database setup is in `tests/setup/`.
- Tests never load `.env`, so they never touch a configured database.
- Each test creates its own data.
- Unit tests get added when business logic grows beyond what API tests cover cheaply.

### 6. Tooling and naming

- **Tooling:** ESLint 10 flat config with the recommended rules, and Prettier with its default settings.
- **Code naming follows `CLAUDE.md` §4–5:**
  - `is`/`has`/`can`/`should` prefixes for booleans;
  - plural nouns for arrays, singular nouns for objects;
  - functions start with a verb; Express handlers and controllers start with `handle`.
- **Team naming standard** (agreed 13 Oct 2026):

| Where | Convention | Example |
|---|---|---|
| MongoDB document fields | camelCase | `categoryId`, `createdAt` |
| API request/response JSON | camelCase | `defaultWindowDays`, `currentVersionNo` |
| JavaScript variables and functions | camelCase | `createCategory()` |
| Mongoose model names | PascalCase | `Category`, `BuyerApp` |
| MongoDB collection names | lowercase plural | `categories`, `buyerapps` |
| URL paths | kebab-case | `/api/v1/buyer-apps` |
| Environment variables | UPPER_SNAKE_CASE | `MONGODB_URI` |
| Constants | UPPER_SNAKE_CASE | `NETWORK_DEFAULT_WINDOW_DAYS` |

## References

| Source | What we follow |
|---|---|
| [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices) | 1.2 layered components; 1.4 validated, fail-fast config; 2.2 one error class extending `Error`; 2.4 central error handling; 2.5 errors documented in OpenAPI; 2.11 validate with a library; 4.1 API tests first; 4.5 each test adds its own data; 6.4 use an ODM against injection |
| [node-express-boilerplate](https://github.com/hagopj13/node-express-boilerplate) | Folder layout, `validate(schema)` middleware, `ApiError`, `/v1` prefix, `app.js` separate from the start-up file |
| [Practica.js](https://github.com/practicajs/practica) | 3-tier structure without dependency-injection plumbing |
| [Zalando RESTful API Guidelines](https://opensource.zalando.com/restful-api-guidelines/) | Plural resource names (#134), kebab-case paths (#129), problem JSON (#176), no stack traces (#177), ETag + If-Match (#182), pagination (#159) |

**Deliberate deviations from Zalando:**
- **camelCase property names** instead of snake_case (#118, #130): this is the team's naming standard. It matches JavaScript and Mongoose defaults, so no mapping layer is needed between code, API and database.
- **URL versioning `/api/v1`** instead of media-type versioning (#115): it's simpler for an internal API used by our own UI, and common practice.
- **Offset pagination** instead of cursors (#160): fine for small configuration lists. We'll revisit for large collections.
- **`totalItems` in list responses** (#254 advises against a total count): it's cheap for small collections, and the UI needs it for page numbers.

## Alternatives considered

- **TypeScript.** Deferred: the repo was set up as JavaScript. We can revisit once the codebase grows.
- **Joi or express-validator.** Zod was chosen because it also validates environment variables, and its error paths map cleanly to `errors[].field`.
- **Jest.** Not needed: `node:test` is built into Node, and `CLAUDE.md` says not to add dependencies Node already covers.
- **Feature folders** (`categories/` holding all its layers). Layer folders match the existing repo layout. We'll revisit if S1 grows large.
- **422 for validation errors.** Not used: one rule (400) is simpler for clients.

## Consequences

**Good:**
- Every S1 resource will look the same from the outside (URLs, envelopes, errors) and from the inside (the same six layers).
- The UI can handle all errors by switching on `code`.

**Costs:**
- A new resource needs a route, validation, controller, service, repository and model file. That's deliberate: each file has one job.
- **Login and access control** are in ADR-015:
  - every call except login and forgot password needs a token;
  - configuration writes need an admin;
  - every API response is `Cache-Control: no-store`.
