# ADR-016: Logout: S1 refuses a logged-out token until it expires

- **Status:** Accepted, 16 Oct 2026
- **Service:** S1 Configuration & Registry
- **Amends:** ADR-015, which left logout to the cross-service work.
  - **Decided here:** logout inside S1.
  - **Still deferred:** how S2–S4 learn about logouts.

## Context

Login gives the user a JWT that lasts 60 minutes (ADR-015). JWTs are *stateless*: S1 keeps no list of logged-in sessions, and it accepts any correctly signed token until the token expires.

So "logging out" can't just delete a session, because there isn't one. If the UI only forgot the token, any copy of it would keep working for up to an hour. A copy could sit in a log, a browser extension, or the memory of a shared computer.

OWASP's guidance for JWTs is to keep a **denylist** of revoked tokens until they expire (JSON Web Token Cheat Sheet, "token explicit revocation by the user").

The team decided (16 Oct 2026) that:
- any signed-in user, whatever their role, can log out;
- logging out ends **only the session it's sent from**.

## Decision

- **Endpoint:** `POST /api/v1/auth/logout`, with `Authorization: Bearer <token>` and no body.
  - It answers **204 No Content**.
  - Any signed-in user can call it; there's no role check.
  - No token → 401 `AUTHENTICATION_REQUIRED`.
  - An invalid, expired or already-logged-out token → 401 `INVALID_TOKEN`.
  - Other methods → 405.
- **What it does:**
  - S1 stores the token's id (`jti`) in a new collection, `revokedtokens`.
  - The authenticate middleware refuses any token whose id is stored there.
- **Scope: this session only.** The user's other tokens keep working: other devices, or browsers that logged in separately. To end every session at once, the user changes their password, which already does that (ADR-015).
- **The collection** (`revokedtokens`, model `RevokedToken`):

  | Field | Meaning |
  |---|---|
  | `_id` | The token's `jti` (a UUID). One record per logged-out token |
  | `userId` | Whose token it was, so a record can be traced to a person |
  | `expiresAt` | The token's own expiry (`exp`) |
  | `createdAt` | When the user logged out |

- **It cleans itself up.**
  - A TTL index on `expiresAt` makes MongoDB delete each record once its token has expired. MongoDB's background task runs about once a minute.
  - By then the token is refused anyway, because it has expired.
  - So the collection only holds tokens less than 60 minutes old: a handful of small records.
- **Repeats are safe:**
  - Two logouts with the same token at the same moment store one record, and both succeed: the duplicate insert is ignored.
  - A later logout with the same token gets 401, because the token is no longer valid.
- **Every token must have an id.** S1 always gives its tokens a `jti`. A correctly signed token without one is refused, because it couldn't be logged out.
- **Cost per request:** one extra lookup by `_id` (the primary key). It runs in parallel with the user lookup S1 already does, so requests aren't noticeably slower.
- **Code:**
  - `models/revokedToken.model.js` and `repositories/revokedToken.repository.js`;
  - `auth.service.logout` and `auth.service.getTokenUser`;
  - the `authenticate` middleware, which also hands logout the token's id and expiry as `req.accessToken`;
  - `auth.controller.handleLogout`, and the route in `auth.routes.js`.

## Alternatives considered

| Option | Why not |
|---|---|
| Only the UI forgets the token | A copied token would keep working for up to an hour. OWASP: logout must end the session on the server |
| Log out every session of the user: a `loggedOutAt` time on the user, checked like `passwordChangedAt` | Simpler (no new collection), but logging out on a laptop would also log out the phone, which isn't how logout usually works. A password change already covers "log out everywhere" |
| Store a hash of the whole token instead of its `jti` (OWASP's example) | It works the same, but every S1 token already has a unique, signed id, which is shorter |
| Short-lived tokens with refresh tokens | Part of the deferred cross-service decisions (ADR-015). Logout would still need to revoke the refresh token |

## Consequences

- **S1 knows about a logout at once:** the token gets 401 `INVALID_TOKEN` on every S1 endpoint.
- **S2–S4 won't know about logouts** once they're built.
  - They check tokens with the public key, without calling S1, so a logged-out token would still work there until it expires: at most 60 minutes.
  - How they should learn about revoked tokens is part of the deferred cross-service work (ADR-015). The options are a revocation feed, shorter token lifetimes, or calling S1.
- **The UI should forget the token too,** whatever the answer, including a 401.
- **Deletion isn't instant:** a record can outlive its token by about a minute. That's harmless, because an expired token is refused anyway.
