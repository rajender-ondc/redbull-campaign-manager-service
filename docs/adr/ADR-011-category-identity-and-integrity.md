# ADR-011: Category identity, aliases and delete rules

- **Status:** Accepted, 13 Oct 2026
- **Service:** S1 Configuration & Registry
- **Resolves:** C-S1-03 (default attribution window); partly C-S1-13 (category taxonomy); D-S1-06 (concurrent admin edits)

## Context

A **category** is what a campaign promotes. It matters to the business in three ways:
- **Default window:** it gives new campaigns their default attribution window (PRD S1-02: "Seven days is the network default").
- **Category match:** S3 measures how much of an order's value falls in the promoted category (PRD S3-14/15). Buyer Apps send their own item-category names ("Spices", "Snacks"), so each category needs a list of **aliases** that map those names to it.
- **References:** campaigns point at their category, so a category can't simply vanish while a campaign uses it.

The first draft of `docs/data_model-S1` used a `category_code` typed in by the user as the primary key. Marketing users would then have to invent and remember codes.

## Decision

- **Identity.**
  - Each category gets a **server-generated UUID** (`id` in the API, `_id` in MongoDB) that never changes; users never type a code.
  - Campaigns reference a category through `campaigns.categoryId`.
- **Name.**
  - Required, 2–100 characters, trimmed, and **unique ignoring letter case** (enforced by a unique index with collation `{ locale: 'en', strength: 2 }`).
  - With no code, the name is how people tell categories apart. Uniqueness also makes a retried create safe: the second attempt gets 409, not a duplicate.
- **Default window.** `defaultWindowDays` is a whole number from **1 to 60**. It is **7** when omitted, the PRD's network default; this resolves C-S1-03. A campaign copies the value when it's created, so later edits never change existing campaigns.
- **Aliases.**
  - Each one is trimmed, has repeated spaces collapsed, and is stored lowercase.
  - Duplicates are removed; there are at most 50 aliases, each 1–100 characters.
  - **An alias belongs to only one category.** A unique multikey index with partial filter `{ aliases: { $type: 'string' } }` enforces this; the filter keeps categories with no aliases from colliding with each other. Without this rule, one item could map to two categories and category match wouldn't be reproducible.
  - S3 must normalise incoming item categories the same way (trim, collapse spaces, lowercase) before matching.
- **Concurrent edits** (D-S1-06).
  - `currentVersionNo` starts at 1 and goes up by 1 on every change; responses carry it as the `ETag`.
  - PATCH and DELETE accept an optional `If-Match`; a stale value returns 412, so one admin can't silently overwrite another's edit.
  - Each update is a single atomic MongoDB operation with the version in its filter, so no transaction is needed.
- **Delete.**
  - A **hard delete, allowed only when no campaign references the category** (`campaigns.categoryId`); otherwise 409 `CATEGORY_IN_USE`.
  - There's no restore endpoint, because nothing remains to restore.
  - We first considered a soft delete (inactive and restorable), but chose this rule because it's simpler for users: a mistaken, unused category can simply be removed, and categories in use are protected.
- **Versioning deferred.** Change reasons and `config_versions` records for categories come with the versioning task (PRD S1-09). Until then, categories carry `createdAt`, `updatedAt` and `currentVersionNo`.

## Alternatives considered

| Option | Why not |
|---|---|
| User-entered code as the primary key (first data-model draft) | Awkward for users, and it adds a second unique identifier to manage |
| A code derived from the name | Confusing once the name changes (the code wouldn't), and collisions need suffixes |
| Soft delete (inactive and restorable) | More states and endpoints. It can still be added later as an active flag, an additive change |
| Aliases unique only within a category | One Buyer App category name could then map to two categories, making category match ambiguous |

## Consequences and known gaps

- **Phasing out a category that's in use.** It can't be deleted and can't be hidden from new campaigns. If Marketing needs that, we add an active flag later.
- **Delete racing a new campaign.** A category could be deleted at the same moment a campaign using it is created, because the "in use" check and the delete are separate operations. Closing that gap needs a transaction (and so a replica set); it's revisited in the campaigns task.
- **The "in use" check covers current campaigns only.** It looks at `campaigns.categoryId` now. The versioning task must also check stored campaign versions, so a rollback can never need a deleted category.
- **Ids differ per environment.** Seed scripts and tests refer to categories by name, never by a hard-coded id.
- **Not decided here:** per-category rule thresholds (category-match floor, EPC floor) and weekly demand profiles. They're left for the thresholds work.
