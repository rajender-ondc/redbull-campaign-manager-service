# ADR-013: Channel identity and delete rules

- **Status:** Accepted, 14 Oct 2026. **Revised the same day:**
  - the display-order field (`sortOrder`) was removed, so channels are listed by name (see Alternatives);
  - a search by name (`?search=`) was added.
- **Service:** S1 Configuration & Registry
- **Resolves:** C-S1-20 (channels exist only in the prototype)

## Context

A **channel** is a place where an affiliate posts our tracking link: WhatsApp, Telegram, Instagram, Facebook, YouTube, Website / blog, or Other. The PRD doesn't mention channels. They come from prototype v3 (14 Oct 2026) and from the team's data model (`docs/data_model-S1`).

In the prototype:
- **Putting an affiliate on a campaign.** Marketing picks at least one channel for that affiliate. This happens in step 3 of the Create Campaign wizard and in "Add to a campaign".
- **One link per affiliate × channel.** This lets clicks, orders, GMV and commission be read per channel. The affiliate report CSV has a Channel column "so each affiliate can pay the right publisher".
- **A fixed list.** The channels are hard-coded and always shown in the same order: WhatsApp first, Other last.

Channels here are not the "click channel" and "attribution channel" in the architecture; those are message queues.

## Decision

- **Managed through the API** at `/api/v1/channels`, like categories, so Marketing can add a channel without a release.
- **Identity:** a server-generated UUID (`id` in the API, `_id` in MongoDB); users never type it.
- **Name:**
  - Required, trimmed, 1–50 characters. The minimum of 1 allows "X".
  - **Unique ignoring letter case.** A unique index with collation `{ locale: 'en', strength: 2 }` enforces this, so "WhatsApp" and "whatsapp" can't split one channel's reports.
- **List order:** by name, ignoring letter case, like categories. There's no display-order field.
- **Search by name** (`GET /api/v1/channels?search=app`), for the search box the UI may add. It behaves like the search boxes on the prototype's Campaigns and Affiliates pages:
  - **Matching:** it lists only the channels whose name contains the text, ignoring letter case, so `app` finds "WhatsApp".
  - **Characters are matched exactly as typed.** `/` finds "Website / blog", and pattern characters such as `.*` have no special meaning, which also keeps every search cheap and safe.
  - **Spaces and blanks:** leading and trailing spaces are ignored, and a blank search lists every channel, so clearing the box shows the whole list again.
  - **Paging covers only the matches,** and `totalItems` counts only them. No match is an empty page, not an error.
  - **Length:** at most 50 characters, the longest possible name; a longer search gets 400. Sending `search` twice also gets 400.
- **No channel code for now.**
  - The prototype puts a short code (`wa`, `tg`, …) in each tracking link, but the link format is still open (C-S1-07).
  - If links need a code, the tracking-links task adds one, fixed once set, and fills it in for the existing channels.
- **Concurrent edits:** handled as in ADR-011.
  - `currentVersionNo` is sent as the `ETag`.
  - PATCH (a rename) and DELETE accept an optional `If-Match`; a stale one gets 412.
- **Delete:**
  - A hard delete, allowed only while no campaign uses the channel; otherwise 409 `CHANNEL_IN_USE`.
  - "Uses" means a campaign has the channel's id in `campaigns.affiliates[].channelIds`. The data model's `affiliates.channels` was renamed `channelIds` because it holds ids, like `categoryId`.
- **Versioning deferred** to the versioning task (S1-09), as for categories. Until then, channels carry `currentVersionNo`, `createdAt` and `updatedAt`.
- **No seed data in this task.** The prototype's seven channels are created through the API.

## Alternatives considered

| Option | Why not |
|---|---|
| A fixed list in code, as in the prototype | Every new channel would need a release |
| A display-order number (`sortOrder`) | It was built first, then removed by a team decision on 14 Oct 2026. To put a channel in the right place, a user would need to know the numbers of the other channels, which is ambiguous. It also needed extra rules (a default, ties, reordering) for little value |
| A code typed in by the user now | The link format isn't decided, so users would type codes nothing uses yet |
| Soft delete or an inactive flag | Not needed yet, and it can be added later without breaking anything |

## Consequences and known gaps

- **Lists are alphabetical.** The prototype's fixed order (WhatsApp first, Other last) is not kept. If a screen needs a special position, such as Other last, the UI arranges it.
- **Search speed.** A "contains" search can't use the name index, so MongoDB checks every channel. That's instant for a list of tens of channels. A large collection, such as campaigns later, would need a prefix search or a search index instead.
- **Search is shared.** Affiliates got the same search (ADR-014), so the search code now lives in `src/utils/` (ADR-012). Any other list that adds a search box should follow the same rules (ADR-010 §2).
- **Retiring a channel that's in use.** It can't be deleted, and it can't be hidden from new campaigns. If Marketing needs that, we add an `isActive` flag.
- **Delete racing a new campaign.** The "in use" check and the delete are separate operations (the same gap as ADR-011). Closing it needs a transaction; the campaigns task revisits it.
- **Current campaigns only.** The "in use" check doesn't look at old campaign versions. The versioning task must check stored campaign versions too.
- **Rule for the campaigns task:** each affiliate on a campaign needs at least one channel, as in the prototype wizard.
- **Ids differ per environment.** Seeds and tests refer to channels by name.
