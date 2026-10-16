
# Project Engineering Rules

## 1. Understand Before Coding
- Read the relevant requirements and architecture documentation first.
- the prototype docs UI design is not the final, So just by seeing at it we cannot decide whether a resource needs the supported queryparameters like search,sortBy,page,limit etc..), You have to take the decision from the business perspective and the user POV and the PRD requirements docs.
- Inspect existing code, dependencies, conventions and tests before changing anything.
- For non-trivial work, present an implementation plan and list assumptions.
- If a requirement is ambiguous or an architectural decision is missing, ask before proceeding.
- Do not implement unrelated features or refactor unrelated modules.


## Folder structure for this project

Please follow this structure

s1-configuration-registry/
├── CLAUDE.md
├── package.json
├── .env.example
├── README.md
│
├── src/
│   ├── app.js
│   ├── server.js
│   │
│   ├── config/
│   │   ├── env.js
│   │   └── database.js
│   │
│   ├── routes/
│   │   ├── index.js
│   │   └── category.routes.js
│   │
│   ├── controllers/
│   │   └── category.controller.js
│   │
│   ├── services/
│   │   └── category.service.js
│   │
│   ├── repositories/
│   │   └── category.repository.js
│   │
│   ├── models/
│   │   └── category.model.js
│   │
│   ├── validators/
│   │   └── category.validator.js
│   │
│   ├── middleware/
│   │   ├── authenticate.js
│   │   ├── authorize.js
│   │   └── errorHandler.js
│   │
│   ├── errors/
│   │   └── ApiError.js
│   │
│   ├── constants/
│   └── utils/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── fixtures/
│   └── setup/
│
├── scripts/
└── docs/
    └── adr/


src/
├── config/             # DB & env configs
├── controllers/        # HTTP handling (req/res)
├── services/           # Core business logic
├── repositories/       # Data access & database queries 👈
├── models/             # Database schemas / ORM entities
├── routes/             # Express router definitions
├── middlewares/        # Auth, error handling, validation
└── app.js

## 4. Variable Naming Conventions
- **General Rule:** Use strict `camelCase` for all local variables, global variables, function parameters, and object properties.
- **Booleans:** Must always be prefixed with auxiliary verbs that clearly indicate a boolean state, such as `is`, `has`, `can`, `should`, or `contains`.
  - *Correct:* `isActive`, `hasPermission`, `canModify`, `shouldRefresh`
  - *Incorrect:* `active`, `permission`, `check`, `flag`
- **Constants:** 
  - True application-wide configuration constants or immutable primitives must use UPPER_SNAKE_CASE.
    - *Example:* `MAX_RETRIES = 3`, `DEFAULT_PAGE_SIZE = 20`, `JWT_SECRET`
  - Standard local constants assigned via `const` use standard `camelCase`.
- **Arrays & Collections:** Must always be named using **plural nouns** to clearly indicate they hold multiple items.
  - *Correct:* `users`, `activeSessions`, `permissionsList`
  - *Incorrect:* `user`, `userArray`, `list`
- **Objects & Singletons:** Must be named using **singular nouns**.
  - *Correct:* `user`, `databaseClient`, `authConfig`
- **Private Properties / Internal Scope:** If working with classes or internal scopes requiring privacy indicators, prefix with an underscore (`_`) sparingly (though modern JS private fields `#` are preferred for class fields).

## 5. Method & Function Naming Conventions
- **General Rule:** Use strict `camelCase` for all functions and methods.
- **Action-Oriented Verbs:** Functions and methods must always start with a verb that describes what action they perform. Avoid vague names like `processData` or `handleThings`.
- **Prefix Standards by Behavior:**
  - **Getters (Retrieving Data):** Start with `get` or `fetch`. If returning a boolean, use `is`, `has`, or `check`.
    - *Examples:* `getUserById()`, `fetchActiveOrders()`, `hasValidSubscription()`
  - **Mutators (Creating/Updating/Deleting):** Start with an active verb like `create`, `update`, `delete`, `save`, `remove`, or `insert`.
    - *Examples:* `createUser()`, `updateUserProfile()`, `deleteSession()`
  - **Event Handlers / Callbacks:** Prefix with `handle` or `on`.
    - *Examples:* `handleDatabaseError()`, `onUserLogin()`
  - **Calculations / Transformations:** Start with `calculate`, `compute`, `format`, `parse`, or `transform`.
    - *Examples:* `calculateTaxTotal()`, `formatDateString()`

## 2. Architecture
- Each service owns its business logic and persistent data.
- Never access another service's database directly.
- Communicate through documented APIs or approved event contracts.
- Keep controllers, business logic, data access and validation separate.
- Do not introduce new services, dependencies or design patterns without justification.
- Preserve existing API contracts unless a change is explicitly approved.

## 3. API and Validation
- Validate all untrusted inputs at the application boundary.
- Validate environment variables at startup.
- Use consistent response and error formats.
- Enforce authentication and authorization where required.
- Implement pagination and sensible request limits for collection endpoints.
- Never trust identifiers or permissions supplied by the client.

## 4. Database
- Use parameterized queries or safe ORM operations.
- Enforce data integrity with database constraints where applicable.
- Add indexes based on actual query patterns.
- Use transactions for operations that require atomicity.
- Create reviewed, reproducible migrations for schema changes.
- Never drop data or run destructive migrations without explicit approval.
- Do not use in-memory state as the source of truth for persistent data.

## 5. Reliability
- Design retryable operations to be idempotent where appropriate.
- Handle timeouts, duplicate events and partial failures explicitly.
- Do not silently swallow exceptions.
- Use bounded retries with backoff where retries are safe.
- Do not assume distributed transactions across services.
- Avoid logging secrets, tokens, credentials or sensitive customer data.

## 6. Security
- Never hardcode secrets or commit .env files.
- Use least-privilege permissions.
- Prevent injection attacks through safe query APIs and validation.
- Enforce access control on every protected operation.
- Do not disable security checks just to make tests pass.
- Ask for approval before production access, destructive commands,
  credential changes or infrastructure modifications.


## 8. Implementation Workflow
- Work in small, reviewable changes.
- Prefer simple, readable solutions over unnecessary abstractions.
- Follow existing naming, formatting and error-handling conventions.
- Do not add a dependency when existing capabilities are sufficient.
- Never overwrite unrelated user changes.
- Do not commit, push, deploy or run destructive operations
  unless explicitly authorized.

## 9. Before Declaring Work Complete
- Run relevant tests, linting, formatting and type checks if configured.
- Inspect the final diff for unintended changes.
- Check for security, data integrity and backward-compatibility risks.
- Update API documentation and relevant technical documentation.
- Summarize files changed, design decisions, commands executed,
  test results, known limitations and any follow-up work.

## 10. Definition of Done
A task is complete only when:
- Acceptance criteria are satisfied.
- Relevant tests pass.
- No known critical security or data integrity issue remains.
- API and database changes are documented.
- The implementation is reviewable and the remaining limitations
  are explicitly reported.

