# ADR-015: Login and access control in S1 (users, passwords, signed tokens)

- **Status:** Accepted, 15 Oct 2026. **Revised the same day** (team decision):
  - the private key moved from a key file into the `JWT_SECRET_KEY` environment variable;
  - the JWT settings became required in `.env`.
- **Amended by ADR-016** (16 Oct 2026): logout. A logged-out token is refused in S1 until it expires.
- **Service:** S1 Configuration & Registry
- **Resolves:** part of C-S5-01 (roles: in S1, admins write and users read); part of D-S5-01 (where identity lives and how roles travel in tokens)
- **Amends:** architecture.md §1 says "users, roles and sessions belong to the shared login capability, not to any of the five services". For now that capability lives inside S1, in files kept apart from the configuration code.

## Context

Until now, anyone who could reach S1 could change configuration. The README said "run locally only". PRD S5-01 (Must) says *"an admin writes, a general user reads"*.

The team's design has two parts:
- **S1 checks the passwords.** It owns the users and verifies their passwords.
- **S1 signs the tokens.** It issues a JWT signed with a **private key that only S1 holds**. Later, S2, S3 and S4 can check those tokens with the matching **public key**, without calling S1 on every request: the public key lets them verify a signature but never create one.

The PRD, the data model, the prototype and the architecture notes say nothing about how login works. This ADR records the decisions taken with the team for S1. The cross-service parts are deliberately left for later (see Deferred).

## Decision

### Users and roles

- **A `users` collection in S1.** Each user has a UUID `_id`, which becomes `sub` in the token, plus:
  - `email`: lowercase and unique;
  - `name`;
  - `role`: `admin` or `user`;
  - `passwordHash`: a bcrypt hash, never returned by the API;
  - `status`: `active` or `disabled`;
  - the lockout fields `failedAttempts` and `lockedUntil`;
  - `createdBy`, `passwordChangedAt` and `lastLoginAt`.
- **Roles (PRD S5-01):**
  - `admin` changes configuration (categories, channels, affiliates) and manages users;
  - `user` reads configuration.
- **Accounts:**
  - **The first admin** is created once at go-live by `npm run create-admin`. The script prints a random password once.
  - **Everyone else** is created by an admin, who sets a password and shares it with the person manually. There's no forced change at first login.
  - **Users are never deleted,** because history must keep showing who changed what. An admin disables them instead.
  - **The last active admin** can't be disabled or demoted (409 `LAST_ADMIN`).

### Passwords

- **Storage:** a bcrypt hash with cost 12; the password itself is never stored. bcrypt is deliberately slow, so guessing passwords from a stolen database takes years instead of seconds.
- **Rules:**
  - at least 8 characters;
  - at least one uppercase letter, one lowercase letter, one digit and one symbol (any character that isn't a letter, digit or space).
  - There's no "different from your old password" rule.
  - **Technical limit:** at most 64 characters (and 72 bytes), because bcrypt ignores everything after 72 bytes.
- **Changing your own password:** while logged in, with the current password and a new one.
- **Forgot password:** a public page takes an email and a new password, and sets it. It also clears a lockout. See the accepted risk below.
- **After any password change, S1 refuses tokens issued before it,** so old sessions stop working in S1.

### Login and lockout

- **One endpoint, `POST /api/v1/auth/login`.** It checks the email and password and, only if they're right, creates the token internally (`token.service.issueAccessToken`). There's no separate "token" endpoint.
- **Errors don't reveal accounts:**
  - A wrong email, a wrong password and a disabled account get the same 401 `INVALID_CREDENTIALS`.
  - An unknown email still runs a bcrypt check, so the response time doesn't reveal which emails have accounts.
- **Lockout:**
  - 5 wrong passwords in a row lock the account for 15 minutes: 423 `ACCOUNT_LOCKED` with `Retry-After`.
  - A successful login resets the count, and so does a forgot-password reset.
  - The count goes up in one atomic database update, so parallel guesses can't slip past the limit.

### Tokens

- **Library:** `jsonwebtoken`, with `jwt.sign()` and `jwt.verify()`.
- **Algorithm:** RS256 with an RSA key of at least 2048 bits. It's supported by JWT libraries in every language, so S4 can be built in anything.
- **Claims:**
  - `sub` (the user id), `role`, `iss` (`JWT_ISSUER`, e.g. `redbull-auth`), `aud` (`JWT_AUDIENCE`, e.g. `redbull-api`), `iat`, `exp` and `jti` (a unique token id);
  - `kid` in the header: the RFC 7638 thumbprint of the public key, so keys can be rotated later.
  - No name or email, so tokens don't carry personal data.
- **Lifetime:** `ACCESS_TOKEN_TTL_MINUTES`, 60 minutes for now. This is **provisional**, to be revisited with the cross-service decisions.
- **Keys and settings, all in `.env`:**
  - **The private key:**
    - `JWT_SECRET_KEY` holds the key itself, in PEM format on one line, with `\n` between its lines. There's no key file and no keys folder.
    - The key never leaves S1 and is never committed, because `.env` is git-ignored.
    - In production, it comes from a secret store as the same environment variable.
  - **The public key** is derived from the private key at start-up.
  - **Start-up stops** if the key is missing, malformed or weak. The error never shows the key.
  - **The other settings** (`JWT_ISSUER`, `JWT_AUDIENCE` and `ACCESS_TOKEN_TTL_MINUTES`) are required too, with no fallback values in code. So `.env` is the one place they're set.
- **Verification in S1:**
  - `jwt.verify` accepts **only RS256**, which blocks "alg: none" and algorithm-swap tricks. It also checks the signature, expiry, issuer and audience.
  - Then S1 loads the user: the user must still be **active**, and the token must be newer than the last password change.
  - So S1 stops a disabled or demoted user at once. S4 won't be able to do this later, because it doesn't call S1.
- **Errors:**
  - no token → 401 `AUTHENTICATION_REQUIRED`;
  - an invalid or expired token → 401 `INVALID_TOKEN` (both with `WWW-Authenticate: Bearer`);
  - a wrong role → 403 `FORBIDDEN`.

### Caching

- **The login response** has `Cache-Control: no-store` and `Pragma: no-cache`. That's the rule for token responses in RFC 6749 §5.1: a token must never be kept by a browser, proxy or CDN.
- **Every other `/api` response** also gets `Cache-Control: no-store`, because it's signed-in business or personal data (OWASP REST Security guidance).

### Code organisation

- `token.service.js` **only signs and verifies tokens**. It knows nothing about passwords or configuration.
- `auth.service.js` checks credentials and handles the lockout and forgot password.
- `user.service.js` manages accounts.
- `middlewares/authenticate.js` and `middlewares/authorize.js` protect the routes.
- `utils/password.js` holds the bcrypt helpers.
- **None of these import category, channel or affiliate code.** The configuration routes only use the two middlewares. So login can move to its own service later without touching configuration.

## ⚠ Accepted risk: forgot password has no verification

Forgot password takes only an email and a new password. **Anyone who knows or guesses a colleague's email, including the admin's, can set a new password and log in as them.** Company emails are easy to guess.

It also answers 404 `USER_NOT_FOUND` for an email with no active account. So anyone can find out which emails have accounts, which login itself never reveals.

The team accepted this to keep the first phase simple: there's no email or SMS service yet to prove who's asking.

**It must be fixed before production.** The fix:
- send a one-time link or code to the email address, through ONDC's mail relay, before the password changes;
- give the same answer whether or not the email has an account. The README's "Before production" list and `docs/validation-rules.md` repeat this.

## Alternatives considered

| Option | Why not |
|---|---|
| A shared secret (HS256) | Every service that can check a token could also forge one. With RS256 only S1 can sign |
| A key file (`JWT_PRIVATE_KEY_FILE`, pointing to `keys/jwt-private.pem`), the first version | Replaced the same day (team decision): the key lives in `.env` like every other setting, with no files or folders to manage |
| S4 calling S1 to check every request | It couples the services and adds latency. The team's goal is to check tokens without calling S1 |
| Opaque session ids instead of JWTs | S4 would have to call S1 to look each one up |
| An external identity provider or SSO (e.g. ONDC SSO, Keycloak) | Not chosen for now. Because the token format is standard, it could replace S1's login later without changing how services check tokens |
| scrypt or Argon2id instead of bcrypt | The team chose bcrypt, which is widely used and well understood |
| A forced password change at first login | Not wanted for now. Admins share passwords manually, and users change them when they like |
| Forgot password with an emailed link | The right fix, but it needs email delivery. Accepted risk for now |

## Consequences and deferred items

- **Every API call now needs a token,** except login and forgot password.
- **The service won't start without `JWT_SECRET_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE` and `ACCESS_TOKEN_TTL_MINUTES`.** The README shows how to add a local key to `.env`.
- **Changing a password logs out the user's other sessions in S1.** Tokens are compared at one-second precision, so a token issued in the same second as the change still works.
- **Two admins demoting each other at the same moment** could leave none, because the last-admin check and the update are separate operations. Closing that needs a transaction, like the other "in use" gaps.
- **Deferred to the cross-service work:**
  - how S2–S4 get the public key (a configured file, or a JWKS endpoint such as `/.well-known/jwks.json`);
  - the final token lifetime and refresh tokens (logout inside S1 is decided in ADR-016);
  - revoking access at S4 (including logouts), and key rotation;
  - CORS, and where the UI keeps the token (in memory, never in a URL);
  - service-to-service authentication (D-X-03).
- **Later:** verification for forgot password (the accepted risk), a login history, multi-factor authentication, and rate limiting by IP address.
- **The versioning task (S1-09) can now record who changed what,** using the authenticated user's id.
