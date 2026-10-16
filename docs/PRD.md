# Redbull & CCTV: requirements understanding

These are working notes, not the PRD. They record what the platform must do and why, distilled from the sources below, so later work doesn't need the PDFs reopened.

When sources disagree, the order of authority is **PRD v1.2, then the architecture draft, then the prototype**. Each disagreement or gap is logged under the service it affects, with an ID like `C-Sx-nn`. Every item stays **Open** until we settle it together, and I raise a service's items when work on that service starts.

The backend view is in [architecture.md](architecture.md); open design choices there use `D-…` IDs. All sources were last read in full on 13 Oct 2026.

## Sources

| Source | Location | What it contributes |
|---|---|---|
| PRD v1.2 (20 Aug 2026) | `docs/AA-REDBULL __ CCTV - PRD v1-210926-080028.pdf` | The requirements authority. IDs `S1-01` to `S5-05` |
| Architecture draft | `docs/Redbull CCTV — Architecture Design (2).pdf` | `FR-*` IDs, NFRs, C4 diagrams, ADR-001…008 (all "Proposed") |
| Prototype | `docs/prototype.html` | Screens, seed data and a working rule engine. Replaced on 14 Oct 2026 by **v3, a "Phase 1 MVP cut"**, which adds channels. So far only the channel notes (§8.6, C-S1-07, C-S1-20) have been checked against v3; the other prototype notes in this file describe the earlier version |
| PRD v1.1 (16 Aug 2026) | `redbull-cctv/REDBULL __ CCTV - PRD v1.pdf` (workspace folder, outside the repo) | The 8-module predecessor. Explains the legacy IDs that v1.2 and the prototype still cite |
| Early diagrams | `redbull-cctv/data-modelling/`, `redbull-cctv/sequence-diagrams/` (outside the repo) | Same topology and flows as the architecture draft |

## ID conventions

| Pattern | Meaning |
|---|---|
| `S2-01` | PRD v1.2: service S2, requirement 01. The PRD itself writes it this way (`S4-03`) |
| `FR-CLK-001` | Architecture-draft requirement. Families: CFG, CLK, CCTV, ATTR, REP, INS, UI |
| `M1-01` | PRD v1.1 module requirement. Legacy, but some are still cited: `M1-01`, `M3-06/07`, `M6-02/03`, `M8-01/02/04` |
| `R-01`… | Insight rules. **Two numberings exist** (§11.6) |
| `OQ-01`… | PRD open questions (§15) |
| `C-S3-04` | A contradiction or gap in the requirements, per service (this file) |
| `D-S3-01` | An open backend design decision (architecture.md) |
| Must / Should | PRD priority |

Each `C-` item is labelled with a **type**:
- *Contradiction*: the sources disagree.
- *Gap*: the sources are silent or ambiguous.
- *Prototype-only*: the prototype adds something the PRD lacks.
- *Note*: no decision needed.

---

## 1. The business in one page

**Problem.** ONDC runs marketing campaigns that send shoppers to ONDC Buyer Apps through affiliate partners. ONDC sees the clicks; the Buyer Apps see the orders; nobody connects the two. So Marketing can't say:
- which campaign worked;
- which affiliate sends real buyers;
- whether a drop came from the offer, the audience, or a broken page.

ONDC also pays affiliates commission on orders it can't verify for itself.

**What the platform does.** It routes campaign traffic, observes the shopper's journey on the Buyer App (through events the Buyer App's backend posts), matches orders back to clicks, and tells Marketing what changed and what to do about it.

**Why correctness matters more than features.** Attributed orders decide commission payouts, so the platform is in effect the system of record for "what is owed to whom". That drives three habits throughout:
- count every order exactly once;
- make every number reproducible;
- reconcile against what the affiliates themselves claim.

**Two layers.**
- *CCTV* is S3: the event contract a Buyer App integrates against to tell us what happened.
- *Redbull* is S1, S2, S4 and S5: the side that decides.

**Value by stakeholder**

| Stakeholder | What they get |
|---|---|
| Marketing | One fixed link per campaign × affiliate, re-routable without reissuing it; a six-stage funnel sliceable by affiliate or Buyer App; category match and cross-sell; ROI and EPC; a decision queue ranked by ₹ at stake; a daily affiliate operations view that replaces their tracking spreadsheet; affiliate reports emailed from the platform, with a record of each send |
| Affiliates | One stable link per campaign; reports that return their own `aff_click_id` and `sub_id`, so they can pay their publishers |
| Buyer Apps | Campaign traffic, plus a report whose depth matches the data they share (their own campaign report, up to a cohort benchmark and lift over organic) |
| ONDC | A verifiable basis for commission and evidence for where to spend |

**Scale.**
- About 25 Buyer Apps (the C4 context diagram draws them as one box, "~25").
- The architecture draft assumes 500k clicks/day, 10M Buyer App events/day and 15k attributed orders/day.

**North Star.** The percentage more orders from agencies or campaigns whose targeting was optimised using funnel-attribution data, compared with unoptimised ones.

## 2. Scope: Phase 1

| In Phase 1 | Not in Phase 1 |
|---|---|
| Campaign setup and traffic routing across Buyer Apps | Flows for shoppers without the app installed, and app-store redirects |
| Funnel capture on Buyer App **websites** (events posted by their backends) | Journeys across devices or browsers |
| Order attribution within a window | Insight text written by a language model |
| Category match and ROI reporting | **Reversing** attribution when an order is cancelled or returned |
| Rule-based flags and a decision queue | Live postbacks to affiliates |
| Affiliate reports emailed from the platform | Mobile apps and SDKs |
| Configuration versions, audit history and rollback | |

v1.1 included "postback forwarding to affiliates" (module M7). v1.2 moved it out of scope and replaced it with emailed reports. Several prototype features are leftovers from M7: see C-S1-08 and C-S4-02.

## 3. Actors

Only the Buyer App calls the platform system-to-system, and the platform calls only the mail relay. Everyone else uses the UI, passes through a redirect, or receives email.

| Actor | Gives the platform | Gets from the platform |
|---|---|---|
| Marketing admin | Buyer App and campaign setup, thresholds and targets, each change with a reason; rollbacks | Validation results, versions and audit history, plus everything a general user gets |
| Marketing general user | Flag dismissals with reasons; report sends | Dashboards, funnels, the daily affiliate view and the decision queue; outage alerts by email |
| Shopper (anonymous) | One tap on a campaign link | A redirect to one Buyer App, carrying the click id. Nothing about the person is kept |
| Affiliate | Its own ids on every tap (`aff_click_id`, `sub_id`) | One fixed link per campaign; conversion reports by email that return its ids |
| Buyer App (system) | Funnel and order events from its backend; test events before go-live | Shoppers carrying a click id; for every event, accept or reject with the reason |
| Buyer App team | The one-time integration against the published schema | The schema and credentials at onboarding; its funnel report by email, as its tier allows |
| Mail relay (ONDC's existing email service) | Delivery of each mail | |

## 4. Glossary

| Term | Meaning |
|---|---|
| Campaign | A promotion in one category (e.g. "Diwali Spices Sale", Grocery), run on one or more Buyer Apps through one or more affiliates |
| Affiliate | A traffic partner network (CashKaro, Admitad, Wishlink…). It has its own publishers, and is paid commission on attributed orders |
| Publisher / `sub_id` | The affiliate's own sub-source. The affiliate appends `sub_id` to our link; we return it so the affiliate can pay the right publisher |
| `aff_click_id` | The affiliate's own click id, appended to our link, stored on the click exactly as received, and returned in reports |
| Buyer App | An ONDC network participant's shopping app or site where the order happens (Hamaramall, Digihaat, Apna Bazaar, Magicpin…) |
| Tracking link | One per campaign × affiliate (not per Buyer App). Fixed for the life of the campaign |
| `ondc_click_id` / click id | Created by S2 on every tap. It is the only id passed to the Buyer App, and the join key for everything after |
| Split | Each Buyer App's percentage share of a campaign's traffic. Every click is routed by a weighted random draw |
| Landing path | The path on the Buyer App's domain where the shopper lands. Marketing supplies the path; the system adds the domain |
| Internal attribution window | The campaign's window. It defaults from the category (7 days is the network default) and governs internal attribution |
| Affiliate contractual window | The window in the affiliate's contract (14 days in the prototype). It governs what goes into affiliate reports |
| Conversion | An `order_confirmed` matched to a click from the same Buyer App, inside at least one window. At most one per (Buyer App, order id) |
| Category match | The share of attributed order value that falls in the campaign's promoted category |
| Data-sharing tier | 0 / 1 / 2: what a Buyer App shares, which decides what it receives (§8.3) |
| Agreement status | Whether the Buyer App's agreement is signed. Until it is, it gets no traffic and sends no production data |
| Config version | An immutable, versioned snapshot of the configuration. A rollback republishes an older version as a new one |
| Flag / signal / insight | A rule firing, carrying the observed values, the threshold, the rule id and the value at stake |
| Decision queue | Flags ranked by estimated value at stake |
| Dismissal | Marketing dismissing a flag, with a reason. The dismissal rate per rule is tracked |
| Daily affiliate view | The per-affiliate daily operations dashboard (§11.4) |
| Claimed figures | The orders and value an affiliate says it drove; used for reconciliation |
| Cohort | The Buyer Apps in the same category and period, used for benchmarks (at least 5) |
| Baseline | A Buyer App's own organic funnel rates (Tier 2 only) |
| Freshness bar | Data no more than 120 minutes behind live (S4-03) |
| Redbull / CCTV | Redbull is the deciding side (S1, S2, S4, S5); CCTV is the event contract (S3) |

## 5. How the system fits together

> **The principle the whole design rests on.** CCTV holds no URL patterns and nothing specific to a Buyer App, and it never guesses what a page was. A Buyer App's own systems send it events, against a schema Redbull publishes once. What CCTV does with those events (matching them to a click inside the window) is the same for every Buyer App. The test of the design: onboarding a new Buyer App is a one-time integration against a fixed schema, never a release on our side.

| # | Service | Layer | Owns | Must never |
|---|---|---|---|---|
| S1 | Configuration & Registry | Redbull | Campaigns, splits and landing paths; the Buyer App registry, tiers and agreements; the event contract; config versions and rollback | Let a campaign go live before its setup is valid, or allow traffic to a Buyer App that hasn't signed |
| S2 | Click Routing | Redbull | Receiving the click, recording it, creating the click id, applying the split, sending the shopper on | Lose a click, or carry the destination in the link |
| S3 | Postback & Attribution | **CCTV** | Receiving the events a Buyer App posts against the published schema, and matching them to the click | Interpret a payload shape it wasn't given, or hold logic specific to one Buyer App |
| S4 | Reporting & Insights | Redbull | Dashboards, funnels, baselines, the rule set, and the reports sent to affiliates and Buyer Apps | Produce a result a human can't reproduce, or count one order twice |
| S5 | UI | Redbull | The web interface for setup and for reading everything back | Let a general user change configuration |

PRD Figure 1 has three bands:
- **Set up once** (top): S1.
- **On every click** (middle, left to right): Affiliate → S2 → Buyer App → S3.
- **What it produces** (bottom): S4 → S5 → Marketing, plus the report back to the affiliate.

Login, audit, monitoring, secrets, email delivery and backup run across all five services, but none is a service of its own. *"If anything in the top band is missing or incomplete, nothing below it works — which is why S1 gates everything."*

**What each hop passes** (PRD; the examples are illustrative)

| Hop | What is passed | Example |
|---|---|---|
| Affiliate → S2 | The tap, plus the affiliate's own ids on the query string | `go.ondc.org/c/CAMP-2026-0089-CK?aff_click_id=ck_88231&sub_id=tg_masala` |
| S1 → S2 | Which Buyer Apps are eligible, their tier, the split and the landing paths | Hamaramall Tier 2 signed; HM 60 / MS 30 / DH 10 ("MS" is v1.1's "MP", Magicpin) |
| S2 → shopper | A redirect to the chosen Buyer App, carrying the click id S2 just created | `hamaramall.com/spices-summer?ondc_click_id=abc789` |
| S2 → S3 | The click record: which campaign, which Buyer App, and when | — |
| S1 → Buyer App | The published event schema and endpoint, agreed once at onboarding | `event_name` enum, required fields per event, `https://redbull.ondc.org/v1/events` |
| Buyer App → S3 | Each event as it happens, and the full order when it completes | purchase, `click_id` abc789, order ORD12345, value 847 |
| S3 → S4 | Attributed events with campaign, affiliate, Buyer App and category match | 594 orders, CashKaro, 51% on category |
| S4 → affiliate | The report for one campaign and one affiliate, mailed from the platform | CashKaro, 594 conversions, their `aff_click_id` and `sub_id` returned, ₹8.4L |
| S4 → Buyer App | Their abstracted funnel report (the hop table says "Tier 2 only"; see C-S4-13) | Cart → checkout 70% against a cohort median of 78% |

## 6. One click → one order → one report

1. **Setup (S1).** An admin sets the campaign's:
   - category, which drives the default window;
   - Buyer Apps and split: it must total 100%, and only signed, eligible apps qualify;
   - landing path per app;
   - affiliates, each with a commission rate.

   Publishing creates config version N, recording who, when and why. Snapshot N reaches S2, S3 and S4 within about 10 seconds. One link is issued per campaign × affiliate.
2. **The affiliate distributes the link.** It appends its own `aff_click_id` and `sub_id`.
3. **The tap (S2).**
   - S2 resolves the link from its local snapshot and checks the campaign is live.
   - It draws a Buyer App by weight, creates `ondc_click_id`, and writes the click with the affiliate's ids and the config version. The click is written **before** any response.
   - It then redirects to `https://{domain}{landing path}?ondc_click_id=…`. Target: p95 under 300 ms, excluding the Buyer App's own page load.
4. **Propagation.** S2 publishes `ClickRecorded` from its outbox. S3 keeps a copy of the click; S4 counts it.
5. **On the Buyer App.**
   - Its page captures the click id from the URL and stores it in localStorage and a first-party cookie, on its own domain, until the window closes.
   - Its backend posts every later event to `/v1/events`, each with the Buyer App's own event id. That includes the order, when the shopper returns days later on the same browser.
   - If the shopper tapped more than one campaign link, the Buyer App decides which click id to send.
6. **Ingest (S3, synchronous).** S3:
   - authenticates the request;
   - checks the agreement is signed;
   - applies the tier rule;
   - validates the schema;
   - stores the event once per (Buyer App, event id);
   - answers accept, or reject with a reason.
7. **Attribution (S3, in the background).**
   - Match the click copy; it must be the same Buyer App.
   - Judge the internal window and the affiliate's contract window independently.
   - Create a conversion (at most one per Buyer App + order id) with its report period fixed, and compute category match and the full category breakdown.
   - Publish `AttributedEvent`, attributed or unattributed, with the reason.
8. **Compute (S4, every 5–15 minutes).**
   - Aggregate into the read model, computing each metric once.
   - Run the rules on that same data, rank flags by ₹ at stake, and refresh the daily affiliate view.
   - Freshness must stay within 120 minutes; dashboards must load in under 2 seconds.
9. **Act (S5 → S4).** Marketing reads the decision queue and dismisses flags with a reason.
10. **Report.**
    - Marketing picks campaign × affiliate × period. S4 builds the report (contract-window conversions with `aff_click_id` and `sub_id`) and drafts the email.
    - Marketing edits the email, adds recipients and sends it through the mail relay. The send is recorded.

Expect fewer landings than clicks: a click is recorded before the shopper arrives anywhere, so abandoned taps, blocked scripts and closed tabs produce clicks without landings. That's correct behaviour, and it must be documented, *"or it will be raised as a defect in week two"*.

## 7. Things that must stay true

1. A click is never lost. It is recorded before anything else happens.
2. A click is attributed to the Buyer App it actually reached, and is never reassigned later.
3. An affiliate link never changes for the life of a campaign.
4. CCTV never interprets a payload shape it wasn't given. An event outside the published schema is rejected, not inferred.
5. An insight can always be traced back to a stated rule, threshold and observation.
6. No Buyer App receives traffic or gives data before its agreement is signed.

Related principles:
- **Rules now, a language model later.** Detection and diagnosis are deterministic: the same data must produce the same answer every time, and a person must be able to reproduce it. A model may later rewrite the wording or retrieve similar past cases. It must never compute a number or decide which rule fired.
- **"We recognise the browser, not the customer."** No customer identity is involved and no personal data is used. We don't identify shoppers, match devices, or choose between two clicks. No shopper-level data leaves ONDC in either direction.

---

## 8. S1: Configuration & Registry (Redbull)

### 8.1 Business purpose
S1 holds everything Marketing sets, plus the Buyer App setup that everything else depends on. Configuration has two levels: set once per Buyer App, and set per campaign. S1 gates everything: an invalid setup must never go live, and an unsigned Buyer App must never get traffic.

### 8.2 What is set where

| Per Buyer App (set once) | Per campaign |
|---|---|
| Website domain | Category and attribution window |
| Event schema version and postback credentials (the credentials it uses to post to CCTV) | Buyer Apps and their traffic split |
| Data-sharing tier and agreement status | Landing path per Buyer App |
| Mobile app readiness | Affiliates and commission rates |
| Configuration version and audit history | AOV bucket thresholds, and any tiered commission built on them |

The architecture draft's config store also holds:
- tracking links (created "when the campaign is activated");
- the affiliate registry;
- rule thresholds (global and per category);
- targets;
- event schema versions;
- the audit trail.

From the prototype: categories with a default window, a category-match floor, an EPC floor and a weekly demand profile; a network-wide ROI floor with per-campaign overrides; and a concentration cap.

### 8.3 Data-sharing tiers (canonical numbering pending C-S1-01)

| Tier | They share | They receive |
|---|---|---|
| 0 | Nothing; no event integration in place | Clicks delivered only |
| 1 | The funnel on sessions carrying a click id | Their own campaign report and category match |
| 2 | The site-wide funnel, including organic traffic | All of the above, plus their position against the cohort and affiliate lift over organic |

Rules attached to tiers:
- The agreement must be signed before any traffic or production data flows (S1-12).
- Tier 2 is off by default and **can't be enabled from the admin console alone** (S1-13). The prototype says it needs a signed data-sharing addendum, because it includes the app's organic traffic.
- Tier 1 accepts only events carrying a click id; Tier 2 accepts all events (S3-10).
- Only Buyer Apps at Tier 1 or above with a signed agreement may hold a non-zero share (S1-07).

### 8.4 Requirements

| ID | Requirement | Pri | Arch | v1.1 |
|---|---|---|---|---|
| S1-01 | Marketing supplies a path, not a full URL; the system joins it to the Buyer App's domain | Must | FR-CFG-001, -018 | M3-01 |
| S1-02 | The attribution window defaults from the category and stays editable per campaign; 7 days is the network default | Must | FR-CFG-002/003/004 | M3-02 |
| S1-03 | A commission rate is required on every affiliate on a campaign | Must | FR-CFG-005 | M3-03 |
| S1-04 | A schema version is published once and needs no release on our side; a Buyer App migrates within the stated deprecation window | Must | FR-CFG-015/019/020/021 | M3-04 |
| S1-05 | Adding a Buyer App needs no code change on Redbull's side; the Buyer App's own integration is separate and one-time | Must | FR-CFG-011…017, -022 | M3-05 |
| S1-06 | Splits must total 100%; a campaign that doesn't can't be saved | Must | FR-CFG-007/008 | M1-04 |
| S1-07 | Only Buyer Apps at Tier 1 or above with a signed agreement can hold a non-zero share | Must | FR-CFG-009 | M1-05 |
| S1-08 | A campaign can't be activated until its Buyer Apps, splits and landing paths are valid together | Must | FR-CFG-006/010 | — |
| S1-09 | Every config change is versioned and records who, when, and a mandatory reason | Must | FR-CFG-023/024 | M1-07 (splits only) |
| S1-10 | Any published config can be rolled back to an earlier version; a rollback takes effect on the next click | Must | FR-CFG-025/026 | — |
| S1-11 | A published change applies to the next request, with no release and no restart | Must | FR-CFG-027 | — |
| S1-12 | No production data flows for a Buyer App until its agreement reads signed | Must | FR-CFG-028 | M8-01 |
| S1-13 | Tier 2 capture is off by default and can't be enabled from the admin console alone | Must | — | M8-02 |
| S1-14 | A benchmark renders only where the cohort has at least five Buyer Apps for that category and period | Must | FR-REP-008 | M8-03 |
| S1-15 | A recipient is excluded from the median shown to them, and cohort membership is never disclosed | Must | FR-REP-009/010 | M8-04 |
| S1-16 | Reports aggregate to category; no SKU, seller or provider data crosses between Buyer Apps | Must | FR-REP-005/006 | M8-05 |
| S1-17 | No shopper-level data leaves ONDC in either direction | Must | NFR (privacy) | M8-06 |
| S1-18 | Commission may be tiered by AOV bucket instead of one flat rate per affiliate | Should | — | M3-06 |
| S1-19 | A concentration cap may be set per campaign or network-wide; S4 flags breaches (written "R-15", i.e. v1.1 numbering) | Should | — | M3-07 |

### 8.5 Business rules, distilled
- **Save vs activate.** Splits that don't total 100% block even saving (S1-06). Full validity blocks activation (S1-08): every Buyer App with a share is signed and eligible, and each has a landing path. Every affiliate on the campaign must also have a commission rate (S1-03).
- **Windows.** The internal window comes from the category default and can be overridden per campaign. The affiliate's contractual window is separate, and the two are judged independently (S3-13).
- **Links.** One per campaign × affiliate, never per Buyer App. The destination is never in the link, so re-routing a live campaign never needs a reissue.
- **Versioning.** Every change creates a new version, recording who, when and why. A rollback republishes an earlier version as version N+1. Changes apply from the next click, with no deploy.
- **New Buyer App.** Configuration only on our side; a one-time integration on theirs.
- **Agreement gate.** Until the agreement is signed, the app gets no traffic (S2) and sends no production data (S3).

### 8.6 What the prototype shows
- **Create Campaign wizard:**
  1. *Basics*: name, category (which shows its default window), optional description.
  2. *Routing*: one or more apps with split %; it must total 100% to continue; window in days (1–60, prefilled from the category).
  3. *Affiliates*: pick existing ones, or add one inline (name, postback URL, format, contract window).
  4. *Review*: a link preview, then **Confirm & Launch**, which goes straight to Live and shows links to copy, email or download as CSV.
- **Campaign actions:** view report, edit config (name, category, window), manage routing (split editor plus auto-failover), pause/resume, duplicate (to Draft), archive/unarchive. Statuses are Draft, Live, Paused, Ended and Archived.
- **Buyer App Config page:**
  - domain;
  - tier ladder with an agreement pill (Tier 2 shown as "Locked");
  - "what happens on a click" with four endings;
  - routing table with an editable deep-link scheme per app;
  - event integration status (wired or not, and when last received);
  - the last order sample;
  - a "Test an event" validator;
  - a "Reset this app to default" button.
- **Affiliates (prototype v3, 14 Oct 2026):**
  - The form holds a name, a contact email (optional), a default commission rate (required, above 0, default 6%) and a contract window (default 14 days).
  - The postback URL, format and health are gone: "Affiliates don't integrate anything."
  - An affiliate is Active or Paused. **Pause** makes it "no longer selectable for new campaigns"; **Resume** makes it selectable again.
  - The Affiliates page filters by status and searches by name.
  - The wizard offers only active affiliates, but "Add to a campaign" is still offered for a paused one.
  - Built in task 3 (ADR-014).
- **Channels (prototype v3, 14 Oct 2026; not in the PRD):**
  - A channel is a place where an affiliate posts our tracking link. The prototype has a fixed list: WhatsApp, Telegram, Instagram, Facebook, YouTube, Website / blog, Other.
  - Wizard step 3 is "Affiliates & channels": each selected affiliate needs **at least one channel** before the wizard continues. "Add to a campaign" on an affiliate asks for channels too.
  - **Every affiliate × channel gets its own tracking link**, so clicks, orders, GMV and commission can be read per channel:
    - the campaign report has a "By affiliate and channel" table;
    - the affiliate detail page has a channel roll-up;
    - the affiliate report CSV has a Channel column "so each affiliate can pay the right publisher".
  - Duplicating a campaign copies its channels.
  - Built as S1 reference data in task 2 (ADR-013).
- **Missing from the prototype:** change reasons, version history, rollback, landing paths, per-campaign commission, and Buyer App onboarding (registration, credentials, agreement).

### 8.7 Contradictions and open points (raise when working on S1)

**C-S1-01 · Tier numbering** · *Contradiction* · Open
- PRD v1.2's tier table numbers the tiers 1/2/3 (1 = nothing, 2 = click-id funnel, 3 = site-wide).
- Everything else uses 0/1/2: v1.2's own S3-10 and S1-13, v1.1 (M8) and the prototype.
- Read with 1/2/3, S3-10 would apply "click-id events only" to apps with no integration at all, which is nonsense.
- Affects S1, S3 and S4. *Suggest:* use 0/1/2 and fix the PRD table.

**C-S1-02 · Can a Tier-0 app receive traffic?** · *Contradiction* · Open (OQ-11)
- S1-07 (and v1.1 M1-05) says only Tier 1 and above may hold a share.
- The ladder says Tier 0 gets "clicks delivered only", which implies it receives traffic.
- In the prototype, Apna Bazaar is Tier 0 and holds 30% of "Electronics Payday Sale". Odder still, it posts events, although Tier 0 means "no event integration".
- Affects S1 validation, S2 eligibility, and commission on orders nobody can verify. *Suggest:* decide OQ-11. I lean towards S1-07 as written: no events means no measurement and no verifiable commission.

**C-S1-03 · Default attribution window** · *Contradiction* · **Resolved 13 Oct 2026**
- PRD S1-02: the window defaults from the category; 7 days is the network default.
- Architecture FR-CFG-003: default to 7 days when there's no campaign-specific value. The category default is lost.
- Prototype: category defaults (Grocery 7, Fashion 14, Electronics 30, Home & Kitchen 14 days), editable from 1 to 60.
- Safari's 7-day storage limit (OQ-04) makes windows longer than 7 days partly unachievable anyway.
- **Decision (ADR-011):**
  - A category's `defaultWindowDays` is optional; when it's omitted, the category gets 7, the network default. The allowed range is 1–60.
  - A campaign copies its category's value when the campaign is created, so later edits to the category never change existing campaigns.

**C-S1-04 · Where commission lives and what shape it takes** · *Contradiction* · Open
- PRD: a rate is required on every affiliate *on a campaign*, i.e. per campaign × affiliate (S1-03), and may be tiered by AOV bucket (S1-18).
- Prototype: one global 6% rate per affiliate. The wizard never asks for it, and affiliates added inline silently get 6%.
- Affects commission payable, EPC (rules R-07 / prototype R-08) and ROI.
- *Suggest:* a rate on campaign × affiliate, flat or AOV-tiered; required for activation; versioned so the rate in force at click time is the one that applies.
- **Affiliate default (ADR-014, 14 Oct 2026):**
  - Each affiliate has a required `defaultCommissionRatePercent`, above 0, that prefills the campaign × affiliate rate.
  - Prototype v3's wizard now asks for the rate for each affiliate.
  - The per-campaign rate itself comes with the campaigns task, so this item stays open until then.

**C-S1-05 · Landing path per Buyer App** · *Gap* · Open
- PRD S1-01 and FR-CFG-018: Marketing gives a path per campaign per Buyer App; the system adds the domain.
- The prototype has no landing path in the wizard or the routing editor; it uses one sample path per Buyer App.
- Without it, S2 can't build the redirect, and S1-08 can't be checked.
- *Suggest:* a path per campaign × Buyer App, validated: starts with `/`, no scheme or host, its own query string allowed.

**C-S1-06 · Change reasons, version history and rollback are missing from the prototype** · *Gap* · Open
- S1-09/10 and S5-02/03 require who/when/a mandatory reason, a visible version history and rollback.
- The prototype captures no reason for any edit (config, routing, thresholds, rule switches, a Buyer App's domain or deep link). It has no history or rollback screen and only stamps `updatedBy = "You"`.
- Are threshold, target and rule-switch edits "configuration changes"? The architecture draft keeps thresholds and targets in the config store, so yes.
- *Suggest:* every write to S1 carries a reason; S5 gets history and rollback screens.

**C-S1-07 · Tracking-link format and immutability** · *Contradiction* · Open
- PRD: `go.ondc.org/c/CAMP-2026-0089-CK` (campaign code + affiliate code), never changing for the life of the campaign.
- Prototype: `track.ondc.org/c/{slug of campaign name}-{slug of affiliate name}`, so renaming a campaign changes every one of its links.
- Architecture: S1 creates the link "when the campaign is activated". The prototype shows links at Review, and an affiliate added later gets "a fresh tracking link".
- The domains vary across sources too: `go.ondc.org`, `track.ondc.org`, `redbull.ondc.org` (events) and `cctv.ondc.org` (thread links).
- *Suggest:* an immutable code minted when the campaign × affiliate pairing is created, never derived from an editable field; confirm the domain.
- **Prototype v3 (14 Oct 2026):**
  - Links are now **one per campaign × affiliate × channel**: `go.ondc.org/c/{slug of campaign name}-{slug of affiliate name}-{channel code}`.
  - The channel codes are `wa`, `tg`, `ig`, `fb`, `yt`, `web`, `other`. A channel without one falls back to a slug of its name, so renaming that channel would change its links.
  - Channels carry no code for now (ADR-013). The link format decided here settles whether they need one.
- **Affiliate code (ADR-014, 14 Oct 2026):**
  - The server generates each affiliate's code, e.g. `ckB7XQ` for CashKaro.
  - It **never changes, not even when the affiliate is renamed**, because links already issued contain it.
  - The campaign part and the overall link format are still open.

**C-S1-08 · The affiliate entity and its contract window** · *Gap / Prototype-only* · **Resolved 14 Oct 2026**
- The PRD defines no affiliate entity beyond "commission on a campaign" and "the affiliate contractual window".
- The prototype's affiliate has: name, contact email, postback URL, native format, contract window (14 days), health (Healthy / Degraded / Failing) and active/paused. Postback URL, format and health come from v1.1's M7 Postback Forwarder, which is out of Phase 1.
- Open questions:
  - Does the contract window sit on the affiliate (one contract) or on each campaign × affiliate?
  - Is "pause affiliate" (no longer selectable for new campaigns) in scope?
- *Suggest:* name, short code (used in links), contact emails (report recipients), contract window, status. Drop the postback fields for Phase 1.
- **Decision (ADR-014):**
  - **Fields:**
    - a server-generated `code` used in links, which never changes;
    - a `name`, unique ignoring letter case;
    - an optional `contactEmail`;
    - a required `defaultCommissionRatePercent` and a `defaultContractWindowDays` (default 14), both of which prefill campaigns;
    - a `status`.
  - **The contract window sits on both:** a default on the affiliate, copied into each campaign × affiliate (`campaigns.affiliates[].contractWindowDays` in the data model).
  - **Pause is in scope:** a paused affiliate can't be added to new campaigns, and campaigns it's already on keep running. It's done with `PATCH {"status": "paused"}`, and Resume with `"active"`.
  - The postback fields are dropped, as prototype v3 also dropped them.

**C-S1-09 · Campaign cost or budget** · *Gap* · Open
- ROI needs a cost, and the PRD leaves it open (OQ-03).
- The prototype stores a `budget` per campaign and uses GMV ÷ budget, plus a "Reduce spend 20%" action.
- *Suggest:* settle C-S4-08 first; then S1 stores whichever cost inputs Marketing has to enter.

**C-S1-10 · Campaign lifecycle** · *Gap* · Open
- The PRD only says a campaign can't be activated until it's valid (S1-08).
- Prototype: Draft / Live / Paused / Ended / Archived; pause, resume, duplicate, archive, unarchive. The wizard launches straight to Live with no validity check.
- Undefined:
  - the allowed transitions, and who may make them;
  - start and end dates or scheduling (none anywhere);
  - what a link does while its campaign is Draft, Paused, Ended or Archived (S2 side: C-S2-05).
- *Suggest:* an explicit state machine owned by S1, with activation as the validation gate; transitions are config changes and need a reason.

**C-S1-11 · How Tier 2 gets enabled** · *Gap* · Open
- S1-13: off by default; can't be enabled "from the admin console alone". The prototype mentions a signed data-sharing addendum. The mechanism is undefined.
- *Suggest:* an addendum record plus approval by a second person with separate privileges (a two-person rule), outside marketing-admin rights.

**C-S1-12 · Agreement or tier changes while campaigns are live** · *Gap* · Open
- If an agreement becomes unsigned or terminated, or a tier drops below eligibility, while campaigns route to that app: S1-12 says data stops, and S2 must stop routing.
- Unanswered: who rebalances the split, and does that count as a config change needing a reason?
- *Suggest:* either block the registry change until the affected campaigns are re-split, or automatically pause the affected campaigns with a system-recorded reason. Your call.

**C-S1-13 · Category taxonomy and the promoted category** · *Gap* · **Partly resolved 13 Oct 2026**
- The PRD and prototype know 4 categories (Grocery, Fashion, Electronics, Home & Kitchen), each with floors and a default window.
- Campaigns promote narrower things: "Diwali Spices Sale" is Grocery, while the sample items are categorised "Spices" and "Snacks". Items arrive with the Buyer App's own categories, taken from its ONDC order object.
- Undefined: the taxonomy, how fine-grained the promoted category is, and how item categories map onto it.
- Affects category match (S3-14), the floors (R-06/R-07) and cohorts (S4).
- **Decided (ADR-011):**
  - Categories are a flat list managed through the API. Each has a server-generated id, a name that's unique ignoring letter case, and `aliases`: the item-category names Buyer Apps send.
  - Aliases are stored trimmed, with spaces collapsed, in lowercase. Each alias belongs to only one category.
  - A campaign promotes one category (`campaigns.categoryId`).
- **Still open:**
  - for the S3 work: whether the category's own name also counts as a match, alongside its aliases;
  - whether ONDC's standard retail category codes are loaded as aliases;
  - the per-category floors (R-06/R-07) and the weekly demand profile.

**C-S1-14 · "Mobile app readiness"** · *Gap* · Open
- It's listed as per-Buyer-App config although mobile is out of Phase 1. The prototype edits a deep-link scheme per app.
- *Suggest:* informational field(s) only in Phase 1.

**C-S1-15 · Publishing the event schema and deprecating old versions** · *Gap* · Open (OQ-10)
- S1-04 refers to "the stated deprecation window", which is never stated.
- Also undefined: who publishes a new version, how Buyer Apps learn of it, and what happens once the window ends.
- Defects in the schema's content are logged as C-S3-01…05 and C-S3-19.

**C-S1-16 · AOV buckets** · *Contradiction* · Open
- PRD: AOV bucket thresholds are set per campaign, and tiered commission can be built on them.
- Prototype: one global scheme (low ₹500 / high ₹1,500; the UI shows only two buckets).
- The ticket-skew rule is per affiliate across campaigns, so "the low bucket" is ambiguous if buckets differ by campaign.
- *Suggest:* buckets per campaign with a network default; ticket skew computed per order against that order's own campaign bucket.

**C-S1-17 · Scope of the concentration cap** · *Gap* · Open
- S1-19 allows a cap per campaign or network-wide. The concentration rule describes only the network share, and the prototype only has network-wide.
- *Suggest:* network-wide in Phase 1.

**C-S1-18 · Targets** · *Gap* · Open
- S4-07 needs "month-to-date pacing against target", and the architecture puts targets in the config store.
- Prototype: one monthly order target per affiliate (Admitad 9,200, CashKaro 3,600, Wishlink 2,100).
- Undefined: grain (affiliate, or affiliate × campaign?), unit (orders or GMV?) and who sets it.
- *Suggest:* a monthly order target per affiliate, set by an admin.
- **Prototype v3 (14 Oct 2026)** marks pacing against target as Phase 2, and the team's data model has no target.
  - It isn't an affiliate field (ADR-014).
  - When this is picked up, it becomes a separate affiliate × month record. That still conflicts with S4-07 (a Must) until the scope is confirmed.

**C-S1-19 · Disclosure rules listed under S1** · *Note*
- S1-13 to S1-17 are data-sharing commitments. S1 stores tier and agreement; S4 enforces cohort and abstraction rules when it produces reports. This is just about clear ownership.

**C-S1-20 · Channels** · *Prototype-only* · **Resolved 14 Oct 2026**
- The PRD has no channels. Prototype v3 and the team's data model do (see §8.6): each affiliate on a campaign runs on one or more channels, with one tracking link per affiliate × channel.
- **Decision (ADR-013):**
  - Channels are S1 reference data managed through `/api/v1/channels`.
  - Each has a server-generated id and a name (1–50 characters, unique ignoring letter case). Lists are sorted by name.
  - There's no display-order field. A `sortOrder` was built and then removed the same day, because a user couldn't choose a number without knowing the other channels' numbers.
  - The list can be searched by name (`?search=`): the text can appear anywhere in the name, ignoring letter case. This is how the prototype's search boxes on Campaigns and Affiliates behave.
  - A channel can be deleted only while no campaign uses it (`campaigns.affiliates[].channelIds`).
  - No channel code for now.
- **Still open:**
  - whether links need a channel code (C-S1-07);
  - hiding a retired channel from new campaigns (an `isActive` flag, if Marketing needs it);
  - seeding the seven channels.
- **Rule for the campaigns task:** each affiliate on a campaign needs at least one channel.

---

## 9. S2: Click Routing (Redbull)

### 9.1 Business purpose
S2 receives every affiliate click, records it, decides which Buyer App the shopper goes to, and sends them there. Two things are decided at the moment of the click, and neither is in the link:
- which Buyer App the shopper goes to, drawn from the split Marketing configured;
- the click id we will know them by, created here.

So the same CashKaro link can send one shopper to Hamaramall and the next to Magicpin. That is what lets a live campaign be re-routed without any affiliate reissuing anything.

The click is the anchor for every later attribution, and so for commission: S2 must never lose a click, and must never carry the destination in the link.

### 9.2 Link anatomy
`go.ondc.org/c/CAMP-2026-0089-CK?aff_click_id=ck_88231&sub_id=tg_masala`
- `CAMP-2026-0089` is the campaign; `CK` is the affiliate (CashKaro).
- The affiliate appends `aff_click_id` and `sub_id`.
- Both are stored on the click exactly as received and handed back in the affiliate's report. That is how the affiliate pays the right publisher.

The redirect looks like `hamaramall.com/spices-summer?ondc_click_id=abc789`. The click id is the only identifier the Buyer App receives (S2-03).

### 9.3 Requirements

| ID | Requirement | Pri | Arch | v1.1 |
|---|---|---|---|---|
| S2-01 | The click is written to the database before any response is returned to the shopper | Must | FR-CLK-001 | M1-01 |
| S2-02 | `aff_click_id` and `sub_id` are read from the query string and stored against the click | Must | FR-CLK-002/003/004 | M1-02 |
| S2-03 | The click id is created here and stored with the affiliate's ids; it is the only id passed to the Buyer App | Must | FR-CLK-005/006/007 | — |
| S2-04 | A Buyer App is chosen by weighted draw against the campaign split, and the choice is stored on the click | Must | FR-CLK-008/009/010 | M1-03 |
| S2-05 | Split changes take effect on the next click; clicks already made keep the Buyer App they reached | Should | FR-CLK-011/012 | M1-06 |
| S2-06 | An affiliate link is never invalidated by a routing change | Should | FR-CLK-013 | M1-08 |
| S2-07 | If the selected Buyer App is unavailable, the routing request fails and the failure is recorded against the campaign. No automatic re-route in this phase | Must | FR-CLK-014/015 | reverses M1-09 |

Related success metrics:
- **Click integrity:** every click that reaches the Router is recorded, including abandoned ones.
- **Redirect latency:** under 300 ms at p95, excluding the Buyer App's page load.
- **Link stability:** a mid-campaign routing change needs no affiliate action.
- *(v1.1 only)* **Split accuracy:** over 1,000 clicks, the actual split is within 2 points of the configured one.

### 9.4 What the prototype shows
- Links look like `https://track.ondc.org/c/{campaign slug}-{affiliate slug}`, generated from names (C-S1-07). There's a links panel with copy, copy-all, CSV, and "Send" (an email draft plus a WhatsApp share).
- A "Manage routing" modal: replace an app, drop one, or split across several; must total 100%; "affiliate-facing links stay unchanged in every case".
- **Auto-failover:** "move traffic automatically" when checkout success drops below 50/60/70/80%, sustained for 5–60 minutes. It's on by default for new campaigns, logs the move, and raises a notification (C-S2-01).
- The page claims "The Router serves a page, not a redirect" (it logs the click, tries the app, and falls through to the store carrying the click id), and shows four endings:
  - desktop;
  - mobile with the app installed (deep link);
  - mobile without the app (Play Store, with the referrer carrying the click id);
  - Instagram or Telegram in-app browser.

  All of this is mobile, which is out of Phase 1 (C-S2-03).

### 9.5 Contradictions and open points (raise when working on S2)

**C-S2-01 · Automatic failover** · *Contradiction* · Open
- S2-07: no automatic re-route in Phase 1. v1.1 M1-09 had pro-rata failover; v1.2 removed it.
- The prototype still auto-fails over, and it's on by default for new campaigns.
- On page load it moves "Kitchen Essentials Restock" from Digihaat (54% checkout success, below a 60% floor) to Hamaramall, an app that isn't even in that campaign's routing. And it rebalances evenly, not pro-rata.
- *Suggest:* no automatic routing in Phase 1; alert instead (C-S4-11).

**C-S2-02 · What "unavailable" means** · *Gap* · Open
- S2-07 needs S2 to know, at click time, that the drawn app is unavailable. That's not defined: a manual flag in S1? A health probe? A checkout-success signal? (v1.1 OQ-08 asked this for failover, then was dropped.)
- What the shopper sees on failure is also undefined.
- *Suggest:* an explicit availability flag in config (an admin sets it, with a reason); a failure page for the shopper; and `ClickRecorded` with `routing_status = failed`.

**C-S2-03 · Redirect or page** · *Open question* (OQ-02) · Open
- PRD: "A page is likely needed for app-opening and in-app browsers." The prototype asserts a page, built for mobile journeys.
- Phase 1 is web only.
- *Suggest:* an HTTP 302 redirect in Phase 1; a page later, with mobile.

**C-S2-04 · Sticky routing** · *Open question* (OQ-01) · Open
- Should a shopper who taps the same link twice land on the same Buyer App? Sticky gives a better experience and cleaner attribution; pure random gives a truer split.
- Sticky needs a cookie on the router's domain (device-level, no identity).
- *Suggest:* pure weighted random in Phase 1, unless you'd rather have sticky.

**C-S2-05 · Taps that can't be routed** · *Gap* · Open
- Undefined behaviour, and undefined recording, for:
  - an unknown link code;
  - a campaign that is Draft, Paused, Ended or Archived;
  - an affiliate removed or paused on the campaign;
  - no eligible app.
- The success metric says every click reaching the Router is recorded.
- *Suggest:* always record, with a routing status and reason; show a neutral page; never redirect to a campaign that isn't live.

**C-S2-06 · Bots, link previews and fraud** · *Gap* · Open (OQ-07)
- Messaging apps (WhatsApp, Telegram, Slack, Facebook) fetch links to build previews, and crawlers and prefetchers hit them too. Each fetch would create a click and drag down CVR and EPC.
- The PRD calls inflated clicks direct financial exposure. But commission is paid on orders, so the bigger risk is planted click ids later claiming organic orders.
- *Suggest:* record every hit; classify suspected non-human traffic; exclude it from metrics but keep it raw. Define a fraud policy before go-live.

**C-S2-07 · Split accuracy** · *Gap* · Open
- v1.1's "within 2 points over 1,000 clicks" was dropped in v1.2.
- Pure random draws miss that bound often: on a 50/50 split, ±2 points is about 1.3 standard deviations, so roughly 1 run in 5 fails.
- *Suggest:* confirm whether it's a target. If it is, use smooth weighted round-robin instead of random.

**C-S2-08 · In-flight clicks when a Buyer App is removed** · *Open question* (OQ-05) · Open
- S2-05 implies earlier clicks keep the app they reached.
- *Suggest:* their events and orders still attribute within their windows, using the click's recorded app and config version, unless the agreement itself was terminated (S1-12).

**C-S2-09 · Other query parameters on the link** · *Gap* · Open
- S2-03 says the click id is the only id passed on. Affiliates and publishers often append `utm_*` and other parameters.
- *Suggest:* store a bounded copy of the extra parameters on the click; forward none.

---

## 10. S3: Postback & Attribution (CCTV)

### 10.1 Business purpose
S3 is a published event contract that a Buyer App integrates against once. It receives what the Buyer App's own systems report, validates it, and matches it to the click. There is no script tag and no code running inside the Buyer App's page: *"what used to be inferred from a page's URL is now stated directly by the Buyer App that generated it."* It must never interpret a payload shape it wasn't given, or hold logic specific to one Buyer App.

**Background (v1.1, "What changed, and why").** The original design put a script on the Buyer App's page that pattern-matched URLs, so integration needed no engineering from the Buyer App. Event integration reverses that trade. It's a smaller, one-time task for the Buyer App, and it removes our per-app work of reverse-engineering URL patterns (and redoing it after every site redesign). "Pattern match rate" stops being a requirement at all.

### 10.2 The event schema (PRD v1.2)

| `event_name` | Fires when | Carries |
|---|---|---|
| `landing` | The Buyer App's page loads with `ondc_click_id` in the URL | click_id, campaign_id, landing path |
| `product_view` | A product detail page is shown | click_id, sku, category, price |
| `category_view` | A category listing is shown | click_id, category |
| `add_to_cart` | An item is added to the cart | click_id, sku, category, qty, price |
| `checkout_started` | Checkout is entered | click_id, cart value, item count |
| `order_confirmed` | The Buyer App's own order confirmation completes | click_id, order id, order value, items with categories |
| `order_status_update` | An order is cancelled or returned | order id, status, reason |

Notes:
- Endpoint: `https://redbull.ondc.org/v1/events`, agreed once at onboarding.
- The purchase "matches the object the Buyer App's own backend already builds for the ONDC network exchange" (S3-04).
- Field-level issues are logged as C-S3-01, 02, 03, 05 and 19.

**Why checkout must stay its own event.** Collapsing cart-to-order into one step makes a payment-gateway failure look the same as a general fall in conversion. The S4 outage alert is defined on the checkout → order break, and can't exist without this event.

### 10.3 What the Buyer App is responsible for
- Capture the click id from the landing URL. Store it in localStorage and a first-party cookie on its own domain until the window closes.
- Send it with every later event, including the purchase, posted from its backend with its own unique event id and authenticated.
- If the shopper clicked more than one campaign link, decide which click id to send. *"We attribute the one we are given."* This is a deliberate line: we don't identify shoppers, match devices, or choose between two clicks, because any of that would mean knowing who the shopper is.
- Send test events before go-live. Target: over 95% pass validation.

### 10.4 How a returning shopper is recognised
The stored reference looks like this: `ondc_click_id abc789 · campaign CAMP-2026-0089 · stored 14 Aug 09:12 · expires 21 Aug 09:12 (7-day window)`.

| Situation | Result |
|---|---|
| Clicked and ordered on the same browser, inside the window | Matched |
| Cleared cookies or site data before ordering | Not matched |
| Clicked on a phone, ordered on a laptop | Not matched |
| Clicked in Chrome, ordered in Safari | Not matched |
| Browsing privately | Not matched |
| Landed on the website, ordered in the app | Not matched (separate storage) |
| On Safari, returned after more than 7 days | Not matched (storage expired) |

**Roughly 10–20% of orders won't be attributed.** That's the accepted cost of identity that lives only on the device, and it should be stated as a known number up front rather than "discovered in month two". Safari expires client-side storage after 7 days of inactivity, so a 30-day Electronics window can't be honoured there.

### 10.5 The Buyer App baseline
Where a Buyer App shares its full funnel (Tier 2), campaign traffic can be compared with the app's own organic traffic. That turns fault-finding from an argument into a lookup:
- if both drop equally, the fault is the Buyer App's page;
- if only our traffic drops, the fault is who we sent (targeting or creative).

### 10.6 Requirements

| ID | Requirement | Pri | Arch | v1.1 |
|---|---|---|---|---|
| S3-01 | A Buyer App integrates against one published event schema; CCTV does no per-Buyer-App payload interpretation | Must | FR-CCTV-001/002 | M2-01 |
| S3-02 | Events captured: page view, product view, category view, add to cart, checkout started, purchase, order status update | Must | FR-CCTV-003…009 | M2-02 |
| S3-03 | Checkout stays its own event, distinct from cart and purchase | Must | FR-CCTV-010 | M2-03 |
| S3-04 | The purchase carries order id, order value, items and item categories, matching the object the Buyer App's backend already builds for the ONDC network | Must | FR-CCTV-011 | M2-04 |
| S3-05 | The Buyer App captures the click id from the landing URL and carries it to every later event, including the purchase | Must | (Buyer App obligation) | M2-05 |
| S3-06 | If a shopper clicked more than once, the Buyer App decides which click id to send; we attribute the one we're given | Must | — | replaces M4-01/09 |
| S3-07 | An event with no click id is accepted and stored as unattributed; it is never dropped and never guessed | Must | FR-CCTV-013/014 | M2-06 |
| S3-08 | Every event is authenticated and carries a Buyer-App-issued event id; a redelivered event is never counted twice | Must | FR-CCTV-015/016/017 | M2-07 |
| S3-09 | An event that arrives out of order is stored once and doesn't change what has already been attributed | Must | FR-CCTV-018 | — |
| S3-10 | At Tier 1, only events carrying a click id are accepted; at Tier 2, all events are accepted | Must | FR-CCTV-019/020 | M2-08 |
| S3-11 | An event is available for reporting within the platform's freshness bar (S4-03) | Must | — | M2-09 |
| S3-12 | An event is attributed to the click id it carries, where that click falls inside the campaign's attribution window | Must | FR-ATTR-001/002 | M4-01 (changed) |
| S3-13 | The internal window and the affiliate's contractual window are evaluated independently; an order may fall inside one and outside the other | Must | FR-ATTR-003/004 | M4-02 |
| S3-14 | Category match is the share of attributed order value that falls in the promoted category | Must | FR-ATTR-008 | M4-03 |
| S3-15 | The full category breakdown is kept, not only the match percentage, so cross-sell is visible | Must | FR-ATTR-009/010 | M4-04 |
| S3-16 | An order is never attributed to a Buyer App the shopper didn't reach | Must | FR-ATTR-005 | M4-05 |
| S3-17 | An order with no click id isn't attributed, and counts towards the unattributed rate | Must | FR-ATTR-006/007 | M4-11 |

Related success metrics:
- **Schema validation rate:** over 95% of a Buyer App's test events pass before go-live.
- **Attribution rate:** over 80% of orders on tagged Buyer Apps matched to a click, measured per Buyer App.
- **Attribution coverage:** the share of a Buyer App's orders whose complete journey (view → cart → checkout → order) is captured in the one standard schema.

### 10.7 Attribution rules, distilled
1. **Authenticate, then gate.** The agreement must be signed (S1-12) and the tier rule applied (S3-10); then validate against the schema (S3-01). Every event gets accept, or reject with a reason.
2. **Deduplicate.** Events on (Buyer App, event id); conversions on (Buyer App, order id).
3. **No click id:** store as unattributed (Tier 2 only); never guess (S3-07, S3-17).
4. **Click id present:**
   - It must belong to a click routed to the **same** Buyer App (S3-16).
   - Judge the internal and contractual windows separately (S3-13).
   - A conversion exists if the order is inside at least one window (architecture data lifecycle). Its report period is fixed at creation.
5. **Category match** from item values; keep the full breakdown (S3-14/15).
6. **Never rewrite an attribution** once made (S3-09). An event that arrives before its click waits for the click (ADR-005) rather than being marked unattributed.
7. **Cancellations and returns** are captured, but there's no reversal in Phase 1 (scope).

### 10.8 What the prototype shows
- **Per-Buyer-App status:**
  - Live since (date);
  - schema validation pass rate (Hamaramall 98.4%, Digihaat 94.1%, Apna Bazaar 89.6%);
  - last event received;
  - which of the 7 events are wired, each with a "last received" time.
- **"Sample order_confirmed payload":** the last order the app posted. Its shape: `{event_name, click_id, order_id, order_value, items:[{sku, category, qty, price}]}`. There is **no event id, timestamp or schema version** (C-S3-05).
- **"Test an event" validator:**
  - parse the JSON;
  - require every required field for that event name;
  - otherwise valid, noting "click id not present — stored as unattributed, never dropped".
  - It doesn't check types or reject unknown fields, although the page text says invented fields are rejected.
- The prototype's event names use `checkout`, not `checkout_started` (C-S3-01).

### 10.9 Contradictions and open points (raise when working on S3)

**C-S3-01 · Event names** · *Contradiction* · Open
- v1.2's schema table says `checkout_started`. Its S3-02 wording says "page view … checkout started, purchase …". v1.1 and the prototype say `checkout`.
- *Suggest:* freeze one enum: `landing`, `product_view`, `category_view`, `add_to_cart`, `checkout_started`, `order_confirmed`, `order_status_update`.

**C-S3-02 · `campaign_id` on `landing`** · *Contradiction* · Open
- The schema has `landing` carry a campaign_id. But S2-03 makes the click id the only id the Buyer App ever receives, so it has no campaign id to send. (The prototype's sample even fills it with the link code `CAMP-2026-0089-CK`.)
- *Suggest:* drop campaign_id from `landing`; S3 derives campaign, affiliate and Buyer App from the click.

**C-S3-03 · Status updates from Tier-1 apps** · *Contradiction* · Open
- At Tier 1, only events carrying a click id are accepted (S3-10). `order_status_update` carries order id, status and reason, but no click id.
- So every Tier-1 cancellation or return would be rejected, and S4-08's completed-vs-cancelled share becomes impossible for Tier 1.
- *Suggest:* accept `order_status_update` when (Buyer App, order id) matches a known conversion, or require a click_id on it.

**C-S3-04 · "Never dropped" vs tier rejection** · *Contradiction (minor)* · Open
- S3-07: an event with no click id is accepted and stored. S3-10: Tier 1 accepts only click-id events.
- The architecture's FR-CCTV-013 reconciles them: accepted "where permitted by Buyer App tier".
- *Suggest:* adopt that wording. A Tier-1 event without a click id is rejected with a reason, never silently dropped.

**C-S3-05 · Envelope fields missing from the schema** · *Gap* · Open
- S3-08 requires a Buyer-App-issued event id; window checks need an event time; S1-04 implies a schema version.
- The published field list has none of these, and neither does any prototype payload.
- *Suggest:* a common envelope on every event: `event_id`, `event_name`, `occurred_at` (ISO-8601 with UTC offset), `schema_version`, plus `click_id` where it applies.

**C-S3-06 · The organic baseline has no session key** · *Gap* · Open
- Tier 2 sends organic (click-id-less) events so we can compare against the app's own shoppers: the traffic-quality rule, cohort benchmarks, and lift over organic.
- But organic events carry no click id and no session id, and `landing` is defined only for click-id visits. So organic events can't be stitched into a funnel.
- *Suggest:* either an opaque session id from the Buyer App on organic events (no identity involved), or Tier 2 sends daily aggregate funnel counts instead of raw organic events (simpler and more private).

**C-S3-07 · One window or both?** · *Contradiction (within the architecture draft)* · Open
- S3-12 and FR-ATTR-002: attribute only when the click is inside the campaign's internal window.
- The architecture's data lifecycle: a conversion is created when the order is inside **at least one** window.
- S3-13 and S4-22: the windows are independent, and the contractual window governs affiliate reports.
- *Suggest:* create a conversion if it's inside either window and store both flags; internal metrics count in-internal, affiliate reports count in-contract. Also decide whether funnel events (not only orders) are bound by the window.

**C-S3-08 · Which clock decides the window** · *Gap* · Open
- The Buyer App's event time (`occurred_at`) or our receive time?
- Relying on `occurred_at` alone lets late or mis-clocked events land inside a window. Relying on receive time penalises retries.
- *Suggest:* use `occurred_at`, bounded by receive time: reject events dated too far in the future, and cap how far back an event may be dated.

**C-S3-09 · Multiple clicks: the requirement changed** · *Changed requirement* · Open
- v1.1: the most recent click wins on the server (M4-01/09); the stored reference expires on the client (M4-10); cookie vs localStorage precedence was OQ-06.
- v1.2: the Buyer App decides; we attribute what we're given (S3-06).
- *Suggest:* confirm v1.2, and publish integration guidance for Buyer Apps: store on landing, overwrite on a newer click, keep for the longest window.

**C-S3-10 · Category-match details** · *Gap* · Open
- "Share of attributed order value": is the denominator `order_value` (which may include delivery, tax or discounts) or the sum of item lines? Granularity and taxonomy: C-S1-13.
- *Suggest:* Σ(qty × price) of matching items ÷ Σ(qty × price) of all items, keeping the full per-category breakdown.

**C-S3-11 · Test events before go-live** · *Gap* · Open
- Buyer Apps send test events before go-live; the target is over 95% passing; and no production data may flow before signature.
- Undefined: the test endpoint and credentials, how test events are stored, and how the pass rate is computed.
- *Suggest:* a separate test mode with test credentials, the same validation code path, separate storage, and never attributed.

**C-S3-12 · Cancellations and returns** · *Contradiction (scope)* · Open
- "Cancellation and return reversal" is out of Phase 1. Yet `order_status_update` is a Must event, and S4-08 needs the completed-vs-cancelled share and commission payable.
- *Suggest:* capture and report statuses, don't reverse conversions, and decide gross vs net commission (C-S4-09).

**C-S3-13 · Schema strictness and evolution** · *Gap* · Open (OQ-10)
- The invariant says an event outside the published schema is rejected; the prototype says a Buyer App "cannot … invent a field".
- Rejecting every unknown field also blocks harmless additions. The deprecation window is undefined.
- *Suggest:* reject unknown event names and missing or invalid required fields; decide the unknown-field policy per schema version.

**C-S3-14 · The attribution-rate denominator** · *Gap* · Open
- "Over 80% of orders on tagged Buyer Apps matched to a click, per Buyer App." But:
  - Tier-1 apps can't send click-id-less orders (they're rejected);
  - Tier-2 apps also send every organic order.
- So "all orders" is either invisible or mostly organic. S3-17's unattributed rate has the same problem.
- *Suggest:* define it per tier; or have Buyer Apps report the campaign-sourced orders they couldn't tag.

**C-S3-15 · "Postback" means two things** · *Note* · Open
- In v1.2, "postback" is the Buyer App posting events to CCTV. In v1.1 and the prototype it's ONDC notifying an affiliate (M7).
- *Suggest:* reserve "postback" for Buyer App → CCTV.

**C-S3-16 · Duplicate orders with different content** · *Gap* · Open
- The same (Buyer App, order id) arrives again under a new event id with a different value or items. S3-09 says the first attribution stands.
- *Suggest:* first wins; keep later versions as events and count them in a data-quality metric.

**C-S3-17 · Accepted losses** · *Open questions* (OQ-04, OQ-09) · Open
- Safari's 7-day storage expiry; landing on the web and ordering in the app.
- *Suggest:* accept both for Phase 1, and say so in reports.

**C-S3-18 · Event authentication** · *Gap* · Open
- "Every event is authenticated" (S3-08), but the mechanism isn't specified: API key, HMAC signature or mTLS; plus key rotation and replay protection. See D-S3-04 in architecture.md.

**C-S3-19 · Shape of `order_confirmed`** · *Gap* · Open
- S3-04 says it matches the ONDC network order object the Buyer App already builds. The schema lists flat fields (order_id, order_value, items with categories).
- So do we accept their ONDC order object, or our flat projection of it? Money format is also open: ONDC payloads carry decimal strings.
- *Suggest:* a flat projection whose fields are named after their ONDC equivalents; amounts arrive as decimal strings and are stored as integer paise.

---

## 11. S4: Reporting & Insights (Redbull)

### 11.1 Business purpose
S4 owns the dashboards, funnels, baselines, the rule set, and the reports sent to affiliates and Buyer Apps. It runs a fixed rule set over attributed data, raises flags, and ranks them by the money at stake. Phase 1 is rules only. It must never produce a result a human can't reproduce, or count one order twice.

The daily affiliate view is *"built directly from the marketing team's own daily tracking sheet and decision framework"*: what today looks like against the recent trend, whether the month is pacing to target, and the checks (pacing, concentration, reconciliation, ticket size) that decide whether to leave a campaign alone or act today.

### 11.2 Metric dictionary (single definitions, S4-01)

| Metric | Definition | Notes |
|---|---|---|
| Click | A recorded tap on a campaign link | Includes abandoned taps; failed routings are recorded too. Bots: C-S2-06 |
| Landing | A click with at least one `landing` event | Fewer than clicks, by design |
| Stage reach (product view, cart, checkout) | Distinct clicks with at least one event of that stage, within the internal window | C-S4-06 |
| Conversion / order | An `order_confirmed` matched to a click: same Buyer App, inside at least one window; one per (Buyer App, order id) | S3-12/13/16 |
| CVR | conversions ÷ clicks | Click-to-order |
| GMV (attributed) | Σ order value of conversions | Basis: C-S4-07 |
| AOV | GMV ÷ conversions | |
| Category match | Σ value of items in the promoted category ÷ Σ value of all items, over attributed orders | Value-weighted when aggregated (C-S4-07); denominator: C-S3-10 |
| Category breakdown | Value per item category | Cross-sell |
| Commission payable | Σ rate × commissionable value, over conversions | Rate per campaign × affiliate, maybe AOV-tiered; window and gross/net: C-S4-09 |
| EPC | commission ÷ clicks | The prototype computes GMV × rate ÷ clicks; the ₹1.30–2.00 floors only fit this definition |
| ROI | GMV ÷ cost | Cost is open (OQ-03, C-S4-08) |
| Unattributed rate | unattributed orders ÷ orders received | Denominator: C-S3-14 |
| Orders today / yesterday; DoD | Calendar day in IST; DoD = (today − yesterday) ÷ yesterday | Partial-day problem: C-S4-15 |
| MTD pacing | MTD orders ÷ monthly target | Target: C-S1-18 |
| Run-rate projection | MTD orders ÷ days elapsed × days in month; also shown as % of target | Prototype formula |
| Trailing 7-day average | Mean daily orders over the last 7 days | The prototype includes today |
| Concentration share | An affiliate's orders today ÷ all affiliates' orders today | "Network" = attributed campaign orders |
| Completed vs cancelled/returned | By each conversion's latest `order_status_update` | No reversal in Phase 1 |
| Low-ticket share | Orders under the low AOV bucket ÷ orders | Bucket per campaign? C-S1-16 |
| Reconciliation gap | (claimed − computed) ÷ computed, for both orders and value | Over the claim period |
| Relative CVR gap | (best − worst) ÷ worst | Audience, platform and deal rules |
| Baseline gap | Baseline rate − our rate, in percentage points | Traffic-quality rule; Tier 2 only |
| Dismissal rate | Dismissed flags ÷ fired flags, per rule | Window undefined: C-S4-10 |
| Schema validation pass rate | Valid test events ÷ test events, per Buyer App | Target over 95% before go-live |
| Attribution rate | Attributed orders ÷ orders, per Buyer App | Target over 80%; C-S3-14 |
| Attribution coverage | Orders with a complete view → cart → checkout → order journey ÷ orders | Success metric |

### 11.3 Funnel
- **Six stages** (PRD Figure 4): clicks → landing → product view → cart → checkout → order, "with the drops identified".
- Sliceable by affiliate and by Buyer App, and both slices must reconcile to the same totals (S4-02).
- The prototype shows only five stages (no checkout), with "Everyone / By affiliate / By Buyer App" toggles. Its numbers are synthesised: landing = 90% of clicks, product view = landing × a per-app rate, cart = 32% of product views.
- The prototype also has a "Where they part ways" card: the best vs worst affiliate on landing → product view, diagnosed as "It's the audience, not the deal".

### 11.4 Daily affiliate operations view (S4-07…11)
- Orders today; day-on-day change vs yesterday; MTD vs target; run-rate to month end.
- GMV, AOV and commission payable.
- The last 7 days of orders, and history deep enough for week-on-week and month-on-month shape (e.g. a payday-week spike), with no forecasting rule.
- Completed vs cancelled/returned share (30 days in the prototype).
- AOV mix: share of orders under the low bucket.
- Buyer App and category splits.
- Claimed vs computed (Should): orders and value side by side, with the difference stated both as a count and as a value, *"not just a pass/fail"*.
  - Within tolerance, it shows "Reconciled".
  - Otherwise it shows "Reconciliation gap open — held for review before the difference is paid out either way".
- Concentration-cap and pacing breaches are shown on this view itself, not only on the Insights page (S4-10).
- The network-wide "Today at a glance" (Affiliates page) shows each affiliate's share of today's orders, with badges for cap breach and pacing drop.
- In the prototype, "What we'd do" cards (trigger → diagnosis → action) put the team's decision framework into practice:
  - pacing drop → "Fix or kill — today";
  - ticket skew → "Tune commission" (a tiered rate, or a minimum order value for payout);
  - reconciliation gap → "Quality & fraud hold" (hold payout on the unmatched difference);
  - concentration → "Reallocate budget";
  - otherwise → "Reallocate on cost per order, not raw orders".

  A payout hold implies a payout process outside this platform.

### 11.5 How insights are framed
Every underperformance signal is tested against three questions. Does it hold regardless of which **affiliate**, which **Buyer App**, or which **campaign** you look at?

| Signal pattern | Points at |
|---|---|
| Holds across every affiliate on a campaign (affiliate-agnostic) | A deal issue: the deal isn't landing |
| One affiliate converts and another doesn't, on the same deal (affiliate-specific) | An audience issue: audience fit, not the offer |
| An affiliate's results shift by Buyer App (Buyer-App-specific) | A platform issue: that app's landing or checkout |
| An affiliate's results shift by campaign (campaign-specific) | A deal outlier: that campaign's creative, placement or landing |
| Both our traffic and the app's organic traffic drop equally (baseline) | The Buyer App's page |
| Only our traffic drops | Who we sent: targeting or creative |

### 11.6 Rule set
v1.2's table numbers the rules R-01 to R-16. v1.1, the prototype, **and v1.2's own cross-references** use R-01 to R-17, which includes R-05 "Postback health" (C-S4-01). Below, the v1.2 number comes first, with the v1.1/prototype number in brackets.

Each entry gives the rule's type and scope, when it fires (default threshold in the prototype), an example (mostly from the PRD), and the value at stake as the prototype computes it (C-S4-04). "Lost GMV" means (CVR_best − CVR_worst) × worst's clicks × worst's AOV.

- **R-01 Audience fit** [R-01]
  - Flag, per campaign. Fires when the relative CVR gap between the best and worst affiliate is ≥ 15% (affiliate gap).
  - Example: Diwali Snacks, CashKaro 4.6% vs Magicpin 3.6%, a 28% gap, so it's affiliate-specific.
  - Value at stake: lost GMV.
- **R-02 Deal-level (agnostic)** [R-02]
  - Confirmation, per campaign. The same gap stays under 15%.
  - Example: Personal Care Starter Kit, CashKaro and Wishlink both 3.2–3.5%.
  - Value at stake: 0.
- **R-03 Platform, per affiliate** [R-03]
  - Flag, per affiliate. The gap between its best and worst Buyer App is ≥ 15% (Buyer App gap).
  - Example: CashKaro 5.1% on Hamaramall vs 3.7% on Digihaat, a 38% gap.
  - Value at stake: lost GMV.
  - The prototype groups by the campaign's *primary* app, not the app each click actually reached.
- **R-04 Platform (agnostic)** [R-04]
  - Confirmation, per affiliate. Example: Magicpin 2.9–3.3% across Hamaramall, Digihaat and Apna Bazaar. Value at stake: 0.
- **— Postback health** [R-05, v1.1 only]
  - Flag, per affiliate. Fires when the affiliate's postback health is Degraded or Failing on any campaign with clicks.
  - Value at stake: affiliate GMV × 10% (Degraded) or 50% (Failing). Obsolete: C-S4-02.
- **R-05 Affiliate quality** [R-06]
  - Confirmation, per affiliate. At least 3 campaigns with clicks, every one converting at ≥ 2% (the quality benchmark).
  - Example: Admitad, 4 campaigns at 2.4–3.1%. Value at stake: 0.
- **R-06 Off category** [R-07]
  - Flag, per campaign. Category match below the category floor: Grocery 65%, Fashion 35%, Electronics 70%, Home & Kitchen 60%.
  - Example: an Electronics campaign at 58%.
  - Value at stake: GMV × (1 − match) × 6%.
- **R-07 Return below floor** [R-08]
  - Flag, per campaign × affiliate. EPC below the category floor: Grocery ₹1.30, Fashion ₹1.60, Electronics ₹2.00, Home & Kitchen ₹1.50.
  - Example: CashKaro on a Fashion campaign at ₹1.15.
  - Value at stake: (floor − EPC) × clicks.
- **R-08 Traffic quality gap** [R-09]
  - Flag, per Buyer App. Our landing → product-view rate trails the app's own baseline by ≥ 10 points. The PRD gives no number; the 10 points is the prototype's.
  - Example: Digihaat 50% vs 61%.
  - Value at stake: clicks on that app × gap × ₹150, a placeholder. Needs Tier-2 data: C-S4-20.
- **R-09 Deal outlier** [R-10]
  - Flag, per affiliate. The gap between its best and worst campaign is ≥ 15% (campaign gap).
  - Example: Admitad 4.1% vs 3.4%, stated as 22%; the arithmetic gives 20.6%.
  - Value at stake: lost GMV.
- **R-10 Consistent across deals** [R-11]
  - Confirmation, per affiliate. Example: Wishlink 3.1–3.6% across 3 campaigns. Value at stake: 0.
- **R-11 ROI below floor** [R-12]
  - Flag, per campaign. GMV ÷ spend is below 5.0×, or below the campaign's own override.
  - Example: Home & Kitchen Flash Sale at 3.2×.
  - Value at stake: (floor − ROI) × budget; the prototype uses the campaign budget as spend.
- **R-12 Purchase timing (salary cycle)** [R-13]
  - Flag, per campaign. The launch week's demand share trails the category's peak week by ≥ 5 points.
  - Example: Grocery, week 1 at 25.7% vs week 2 at 35.6%.
  - Value at stake: GMV × gap ÷ launch-week share.
  - The prototype computes week of month as ⌈day/7⌉, capped at 4, and also emits a "well-timed" confirmation.
- **R-13 Pacing drop** [R-14]
  - Flag, per affiliate. Today's orders are below 30% of the trailing 7-day average.
  - Example: CashKaro averages 42/day, 9 today, i.e. 21%.
  - Value at stake: (avg7 − today) × AOV.
- **R-14 Concentration risk** [R-15]
  - Flag, network-wide. One affiliate's share of the day's network orders is above 60%.
  - Example: Magicpin 240 of 380, i.e. 63%.
  - Value at stake: 0.
- **R-15 Reconciliation gap** [R-16]
  - Flag, per affiliate. Claimed vs computed orders differ by more than 3%.
  - Example: Wishlink claims 612, we compute 580, a 5.5% gap, "on hold until reconciled". With no claimed data the rule doesn't fire and the affiliate is marked "reconciliation unavailable" (S4-19).
  - Value at stake: |Δ GMV| × commission rate.
- **R-16 Ticket-size skew** [R-17]
  - Flag, per affiliate. More than 65% of orders are under the low AOV bucket (₹500).
  - Example: Admitad at 71%.
  - Value at stake: orders × low share × ₹40, a placeholder.

Rules that read the daily affiliate figures (pacing, concentration, reconciliation and ticket size: v1.2 R-13…R-16, v1.1 R-14…R-17) must use the same daily affiliate figures as the reporting views, with no separate pipeline (S4-18).

### 11.7 Decision-queue behaviour
- Every flag states measured facts and names its rule (S4-12). It exposes the condition, the observed values and the threshold (S4-13). In the prototype it opens to "Why this fired".
- Flags are ranked by **estimated value at stake, not by severity label** (S4-14).
- Marketing edits thresholds; rule logic isn't editable in Phase 1 (S4-15).
- A flag can be dismissed with a reason, which is kept (S4-17). The dismissal rate per rule is tracked and visible (S4-16).
- Rule health: no rule may sustain a dismissal rate above 50% without review (success metric). PRD Figure 9's example: a rule that fired 19 times and was dismissed on two-thirds of them, which is how a miscalibrated rule shows up.

### 11.8 Affiliate reports (they replace v1.1's live postbacks)
- **Input:** any campaign, affiliate and period (S4-20).
- **Content:** the conversions for that campaign × affiliate that fall inside the affiliate's **contractual** window (S4-22). Each carries the affiliate's `aff_click_id` and `sub_id`, plus totals (e.g. "594 conversions, ₹8.4L").
- **Stability:** a conversion appears once, in one report period; re-running a period returns the same conversions (S4-21).
- **Delivery:**
  - Marketing selects the campaign and affiliate; the platform builds the report and attaches it to a drafted mail (S4-23).
  - The platform composes the subject and body, and Marketing can edit both (S4-24).
  - Marketing adds the recipients and sends it through ONDC's mail relay.
- **Record:** campaign, affiliate, period, recipients, sender and time, visible in the product (S4-25). This is so the record isn't *"sitting in one person's sent items where nobody else can find it."*

### 11.9 Buyer App reports and the disclosure rules
- **Tier 1:** their own campaign report and category match.
- **Tier 2:** also their position against the cohort (e.g. "cart → checkout 70% against a cohort median of 78%") and affiliate lift over organic.
- **Rules:**
  - aggregate to category only;
  - no SKU, seller or provider data between apps;
  - no competitor named;
  - a cohort of at least 5 per category and period;
  - the recipient is excluded from the median;
  - cohort membership is never disclosed;
  - no shopper-level data.
- Delivered by email "as its tier allows" (architecture). Who triggers it and how often is undefined (C-S4-13).

### 11.10 Requirements

| ID | Requirement | Pri | Arch | v1.1 |
|---|---|---|---|---|
| S4-01 | Every metric is defined once and computed identically across all views | Must | FR-REP-001 | M6-01 |
| S4-02 | The funnel can be sliced by affiliate and by Buyer App, and both reconcile to the same totals | Must | FR-REP-002/003/004 | M6-02, M4-06 |
| S4-03 | Data is no more than 120 minutes behind live | Must | NFR | M6-03 ("60/120") |
| S4-04 | A dashboard view loads in under two seconds | Must | NFR | M6-04 |
| S4-05 | Any view can be exported, and shared as a link that opens the same filtered state | Should | — | M6-05 |
| S4-06 | Reports returned to Buyer Apps name no competitor and require a cohort of at least five | Must | FR-REP-007/008 | M6-06 |
| S4-07 | A daily view (refreshed on the freshness bar) shows, per affiliate: orders today and yesterday, day-on-day change, MTD pacing against target, and a run-rate projection to month end | Must | FR-REP-011…014 | M6-07 |
| S4-08 | The same view shows GMV, AOV, commission payable and the completed vs cancelled/returned share, alongside the Buyer App and category splits | Must | FR-REP-015…019 | M6-08 |
| S4-09 | Where claimed figures exist, they're shown beside the computed figures for the same period, with the difference in both transactions and value | Should | FR-REP-020/021 | M6-09 |
| S4-10 | An affiliate crossing the concentration cap or falling below its pacing threshold is shown on this view, not only on Insights | Must | FR-REP-022 | M6-10 |
| S4-11 | The daily view keeps enough history to show week-on-week and month-on-month shape | Should | FR-REP-023 | M6-11 |
| S4-12 | Every flag states measured facts and names the rule that produced it | Must | FR-INS-001/002/003 | M5-01 |
| S4-13 | Every flag exposes its condition, the observed values and the threshold | Must | FR-INS-004 | M5-02 |
| S4-14 | Flags are ranked by estimated value at stake, not by severity label | Must | FR-INS-005 | M5-03 |
| S4-15 | Marketing edits thresholds; rule logic isn't editable in the product in Phase 1 | Must | FR-INS-006/007 | M5-05 |
| S4-16 | The dismissal rate per rule is tracked and visible | Must | FR-INS-008/009 | M5-06 |
| S4-17 | A flag may be dismissed with a reason, which is kept | Should | FR-INS-010/011 | M5-07 |
| S4-18 | The daily-figure rules (written "R-14 through R-17") read the same daily affiliate figures as reporting, with no separate pipeline | Must | FR-INS-012 | M5-08 |
| S4-19 | Where claimed data is unavailable for the reconciliation rule (written "R-16"), it doesn't fire, and the affiliate is marked "reconciliation unavailable" | Must | FR-INS-013/014 | M5-09 |
| S4-20 | Reports can be produced for any campaign, affiliate and period, carrying the affiliate's click ids and sub_ids | Must | FR-REP-024/025 | (M7-01/02) |
| S4-21 | A conversion appears once, in one report period; re-running a period returns the same conversions | Must | FR-REP-026/027 | (M7-04) |
| S4-22 | The affiliate's contractual window governs which conversions appear in its report, independent of the internal window | Must | FR-REP-028 | (M7-06) |
| S4-23 | Reports are sent from the platform: Marketing selects campaign and affiliate; the platform builds the report and attaches it to a drafted mail | Must | FR-UI-006 | — |
| S4-24 | The platform composes the subject and body; Marketing can edit both before sending | Must | FR-UI-007/008 | — |
| S4-25 | Every send is recorded (campaign, affiliate, period, recipients, sender, time) and the record is visible in the product | Must | FR-UI-009/010 | — |

### 11.11 What the prototype shows (S4 surfaces)
- **Campaigns list:** KPIs (active campaigns, clicks, conversions, category match, attributed GMV); filters (status, category, Buyer App, affiliate, date range, search); a sortable table that includes created/updated by and dates.
- **Campaign report:**
  - KPIs;
  - the funnel with its toggles, and "Where they part ways";
  - a category-match gauge with the change vs last week, a "Did they buy X?" composition, and a cross-sell "bundle" callout;
  - "What we'd do next" cards;
  - by-affiliate and by-Buyer-App tables (the latter split by share, *not measured*);
  - tracking links;
  - insights;
  - a team discussion thread;
  - Export CSV, Schedule report and Send feedback buttons.
- **Affiliates list:** KPIs (active affiliates, attributed GMV, average CVR, postback success rate); "Today at a glance"; a table (campaigns, clicks, conversions, CVR, EPC, GMV, postback health).
- **Affiliate detail:** KPIs; daily performance (§11.4); "What we'd do"; the campaigns table; postback health with learning notes; insights mentioning this affiliate.
- **Insights page:**
  - the three-axes explainer;
  - KPIs (signals this week, agnostic, specific, need attention);
  - filters by dimension and entity;
  - a ranked list with a ₹ stake, rule chip, "Why this fired", quick actions, and Acknowledge / Dismiss;
  - the "What we've learned" notes.
- **Settings:**
  - category floors; gap thresholds; the ROI floor plus per-campaign overrides; daily-operations thresholds;
  - "Effect right now" (live counts as you move sliders);
  - rule health (firing now, acknowledged %, health, an Active switch, Edit, "+ New rule");
  - reset to defaults.

### 11.12 Contradictions and open points (raise when working on S4)

**C-S4-01 · Rule numbering** · *Contradiction* · Open
- The v1.2 table numbers R-01 to R-16. v1.1 and the prototype number R-01 to R-17, with R-05 "Postback health", so every later rule is one higher.
- v1.2's own cross-references use the v1.1 numbers:
  - S1-19 and S4-10: R-15 = concentration, R-14 = pacing;
  - S4-18: R-14 to R-17;
  - S4-19: R-16 = reconciliation;
  - Figure 10.
- *Suggest:* stable rule codes (e.g. `AUDIENCE_FIT`) as each rule's identity, one display numbering, and fix the PRD.

**C-S4-02 · R-05 "Postback health"** · *Prototype-only / obsolete* · Open
- It measures delivery of postbacks to affiliates (M7), which is out of Phase 1. The prototype still shows postback health on affiliates and a "postback success rate".
- *Suggest:* drop it. Consider a Phase-1 equivalent that does matter: **Buyer App event-feed health** (events stop arriving, or validation failures spike). Your call.

**C-S4-03 · What Marketing may edit** · *Contradiction* · Open
- S4-15: thresholds only; no rule logic in Phase 1.
- The prototype lets users rename rules, edit their descriptions, switch rules off, and build new ones with "+ New rule" (metric × scope × operator × threshold). Its own Settings page says logic editing is Phase 2.
- *Suggest:* Phase 1 = thresholds, plus perhaps on/off with a reason. The builder comes later.

**C-S4-04 · "Value at stake"** · *Gap* · Open
- S4-14 ranks every flag by ₹ at stake, but no rule defines it, and the prototype mixes units:
  - lost GMV;
  - commission;
  - shortfall × clicks;
  - (floor − ROI) × budget;
  - uplift guesses;
  - placeholders (₹150 per point, ₹40 per order);
  - and 0 for confirmations and for concentration.
- Ranking across those units means nothing. *Suggest:* one unit (e.g. ₹ GMV at risk per period) with a written formula for each rule.

**C-S4-05 · What "gap" means, and minimum volume** · *Gap* · Open
- Some rules use a relative gap, (best − worst) ÷ worst (the PRD's 4.6 vs 3.6 → 28% confirms this). The traffic-quality and timing rules use percentage points.
- The deal-outlier example's arithmetic is off (20.6%, not 22%).
- No minimum volume is defined anywhere: an affiliate with 2 clicks can produce a 100% gap.
- *Suggest:* a spec for each rule giving its units, rounding and minimum sample.

**C-S4-06 · Funnel stages and counting** · *Contradiction / Gap* · Open
- The PRD has six stages, including checkout; the prototype shows five.
- Undefined:
  - whether to count distinct clicks or raw events;
  - where `category_view` fits;
  - stages an app doesn't emit. In the prototype data Digihaat lacks `category_view`, Apna Bazaar lacks `add_to_cart`, and nobody sends `order_status_update`. Those must show as N/A, not 0.
- *Suggest:* a stage = distinct clicks with at least one event of that stage within the window.

**C-S4-07 · Metric definitions differ between prototype and PRD** · *Contradiction* · Open
- The prototype's network category match is a conversion-weighted average of campaign percentages; the PRD's definition implies weighting by value.
- "Average CVR" on Affiliates is an unweighted mean.
- EPC is commission per click: confirm.
- GMV basis: order value or item total? Are cancelled orders included?
- *Suggest:* the dictionary in §11.2 becomes the single source of definitions (S4-01).

**C-S4-08 · ROI cost** · *Open question* (OQ-03) · Open
- Commission alone gives roughly 20×; commission plus funded discount gives 3.4×; the prototype uses the campaign budget, a third definition.
- This decides whether the ROI rule (floor 5.0×) ever fires: under the 20× definition almost never, under 3.4× almost always.
- *Suggest:* capture each cost component separately; you choose the headline.

**C-S4-09 · Commission payable** · *Gap* · Open
- Undefined:
  - which conversions count (contractual or internal window);
  - gross or net of cancellations and returns (reversal is out of scope);
  - which rate applies (at click time or now);
  - how AOV tiers apply.
- *Suggest:* contractual-window conversions, at the rate in force at click time, gross, plus a separate "at risk (cancelled/returned)" figure.

**C-S4-10 · Dismissal vs acknowledgement** · *Contradiction* · Open
- The PRD has dismissal with a reason, the dismissal rate per rule, and the 50% review rule.
- In the prototype, "Acknowledge" and "Dismiss" both just mark a flag as seen, with no reason, and rule health's "Acknowledged %" doubles as the dismissal rate.
- The campaign page also runs a **second, hard-coded rule engine** (category match below 60%, CVR below 2%), separate from the rule set.
- *Suggest:* one engine; a reason required to dismiss; and a defined window for measuring the dismissal rate.

**C-S4-11 · The outage alert** · *Gap* · Open (OQ-06)
- The case for a separate checkout event is the outage alert "written on the checkout-to-order break". The architecture says Marketing gets outage alerts by email "within minutes".
- But there's no rule ID, no threshold and no channel, and S4 runs only every 5–15 minutes.
- *Suggest:* a defined rule (checkout → order rate per Buyer App vs its own recent baseline), a near-real-time path for it, and a delivery channel.

**C-S4-12 · How claimed figures get in** · *Gap* · Open
- The reconciliation rule and S4-09 need the affiliate's claimed orders and value. v1.1's OQ-17 (pull from each network's API, or import manually / by CSV) was dropped from v1.2 unanswered. The architecture has "claimed-figure uploads" in the UI.
- The grain is undefined: 30 days, daily, per campaign?
- *Suggest:* a CSV upload per affiliate per day (orders and GMV), with an optional campaign column.

**C-S4-13 · Buyer App reports** · *Gap* · Open
- The ladder gives Tier 1 its own campaign report and Tier 2 the cohort benchmark; the hop table says "Tier 2 only".
- Nothing covers who triggers these reports, how often, for what period, or in what format; only that they're emailed.
- *Suggest:* define them alongside the affiliate-report mechanism.

**C-S4-14 · Cohort edge cases** · *Gap* · Open
- "At least five Buyer Apps for that category and period", with the recipient excluded from the median.
- Are the five counted before or after excluding the recipient? Which apps count: any with data, or Tier 2 only?
- *Suggest:* at least 5 others, excluding the recipient.

**C-S4-15 · Time in the daily view** · *Gap* · Open
- "Today" is a partial day. Comparing today's orders at 11:00 with a full-day 7-day average makes the pacing rule fire every morning; run-rate and concentration have the same problem.
- Also needed: IST day boundaries, and a choice between order time and processing time. The prototype's data is synthetic whole days.
- *Suggest:* compare cumulative counts at the same hour (today by 11:00 vs the average by 11:00), or evaluate on completed days; use IST and order time.

**C-S4-16 · What an affiliate report may contain** · *Gap* · Open
- S4-20 returns per-conversion `aff_click_id` and `sub_id`, while S1-17 says no shopper-level data leaves ONDC. No field list is defined.
- *Suggest:* aff_click_id, sub_id, conversion date, commissionable value, commission and status. No Buyer App order id, no items.

**C-S4-17 · Report period** · *Gap* · Open
- S4-21 requires stability; the architecture fixes the period "then", at conversion creation.
- Undefined: the grain (day, week, month?), the basis (order time or attribution time), and what happens to late conversions for a closed period.
- *Suggest:* assign by attribution time in IST, freeze closed periods, and put late arrivals into the current period.

**C-S4-18 · Data for the timing rule** · *Gap* · Open
- It needs weekly demand shares per category. Only Grocery's are real (from the "Retail_Roadmap" doc: 25.7 / 35.6 / 23.5 / 15.2%); the others are illustrative.
- Who maintains this data? Should the rule run on placeholder data at all?

**C-S4-19 · Confirmations in the queue** · *Gap* · Open
- R-02, R-04, R-05 and R-10 are confirmations ("working, leave it"). The prototype ranks them in the same queue with a ₹0 stake and counts them as "signals".
- Are they flags? Do dismissals of them count towards the dismissal rate?
- *Suggest:* keep confirmations separate from actionable flags.

**C-S4-20 · The traffic-quality rule needs Tier-2 data** · *Contradiction (examples)* · Open
- The rule compares against the app's organic baseline, which only Tier 2 shares. Yet the PRD's example uses Digihaat, which the prototype marks as Tier 1, and the prototype holds baselines for every app.
- *Suggest:* the rule runs only for Tier-2 apps (and depends on C-S3-06).

**C-S4-21 · Prototype-only features** · *Prototype-only* · Open
- Triage list in §16.

**C-S4-22 · The North Star needs a record of actions** · *Gap* · Open
- "More orders from campaigns optimised using the data" requires knowing which campaigns were optimised that way. Nothing currently links a flag to the change made in response.
- *Suggest:* config-change reasons can reference the flag(s) they respond to.

**C-S4-23 · Freshness-bar labels** · *Note*
- S4-03 sets 120 minutes (v1.1's M6-03 said "60/120"). S3-11 cites it as "S4-03" and S4-07 as "M6-03"; they're the same requirement.

---

## 12. S5: UI (Redbull)

### 12.1 Business purpose
The browser interface for the whole platform: where configuration is set, where everything is read back, and where reports go out. It is not a Buyer App interface, and there's no mobile app. It holds no business logic (ADR-008): validation and authorisation live in the service that owns each capability.

### 12.2 Requirements

| ID | Requirement | Pri | Arch |
|---|---|---|---|
| S5-01 | Configuration is created and changed here; an admin writes, a general user reads | Must | FR-UI-001/002 |
| S5-02 | Configuration versions and audit history are visible, showing who changed what and why | Must | FR-UI-003 |
| S5-03 | An earlier configuration version can be rolled back from here | Must | FR-UI-004 |
| S5-04 | Dashboards, funnels and the decision queue are read here | Must | FR-UI-005 |
| S5-05 | Affiliate reports are produced, drafted and sent from here | Should | FR-UI-006 (FR-UI-007…010 are Must) |

### 12.3 Screens in the prototype
- The sidebar has Campaigns (All Campaigns, Create Campaign), Affiliates, Insights, Buyer App Config and Settings.
- The top bar has search, notifications (auto-failover moves plus the top flags), help and account. There's one shared demo account, and every action is attributed to "You".
- Details of each page are in §8.6, §9.4, §10.8 and §11.11.

### 12.4 Contradictions and open points (raise when working on S5)

**C-S5-01 · Roles and permissions** · *Gap* · **Partly resolved 15 Oct 2026**
- PRD: an admin writes config, a general user reads. Architecture: general users also dismiss flags and send reports. The prototype has a single shared account.
- Undefined: who edits thresholds and targets (they're config, so admin?), uploads claimed figures, manages Buyer App onboarding, and approves Tier 2.
- **S1's part decided (ADR-015):**
  - Two roles. `admin` changes configuration and manages users; `user` reads configuration.
  - Admins create accounts and share the password manually.
  - Login gives an RS256-signed token that carries the role.
- **Still open:**
  - what each role may do in S4 (dismissing flags, sending reports, uploading claimed figures);
  - who edits thresholds and targets, manages Buyer App onboarding, and approves Tier 2.

**C-S5-02 · Screens the PRD needs but the prototype lacks** · *Gap* · Open
- Version history and audit (S5-02).
- Rollback (S5-03).
- Change-reason prompts (S1-09).
- A report builder with a period picker, plus send history (S4-20…25).
- Claimed-figure upload.
- Buyer App onboarding (credentials, agreement, tier approval).
- Buyer App reports.
- Outage alerts.

**C-S5-03 · Prototype screens that contradict the PRD** · *Contradiction* · Open
- Auto-failover controls (C-S2-01), affiliate postback fields (C-S1-08), deep-link and app routing (C-S2-03), the rule builder (C-S4-03).

**C-S5-04 · Shareable views** · *Gap* · Open
- S4-05: any view can be exported, and shared as a link that reopens the same filtered state. The prototype only has CSV export on the campaign report, and "copy link" only on discussion threads.

---

## 13. Non-functional requirements (from the PRD and architecture §3.2)

| Quality | Requirement | Source |
|---|---|---|
| Redirect latency | Under 300 ms at p95, excluding the Buyer App's own page load | Success metric |
| Click durability | Every click is recorded before any response, abandoned ones included | S2-01 |
| Freshness | Data no more than 120 minutes behind live | S4-03 |
| Dashboard speed | A view loads in under 2 s | S4-04 |
| Counting integrity | Redelivered events and repeated orders are counted once | S3-08, S4 |
| Consistency | One definition per metric; slices reconcile to the same totals | S4-01/02 |
| Determinism | The same data gives the same answer; a person can reproduce every flag | §7 |
| Report stability | Re-running a period returns the same conversions | S4-21 |
| Change without release | Config and schema changes are live from the next request, with no restart; a new Buyer App needs no code | S1-04/05/11 |
| Auditability | Who, when and why for every config change; every send recorded; dismissal reasons kept | S1-09, S4-17/25 |
| Security | Every event authenticated; only admins change configuration | S3-08, S5-01 |
| Privacy | Signed agreement before any traffic or data; Tier 2 off by default; cohort of 5 or more; category level only; no shopper-level data either way | S1-12…17 |
| Availability | Not specified. The architecture assumes 99.9% for Click Routing and Postback, 99.5% for the rest | Architecture assumption |
| Throughput and scale | Not specified. The architecture assumes 500k clicks/day (bursts of 200/s), 10M events/day (peaks of 600/s), 15k orders/day | Architecture assumption |
| Alert timeliness | "Within minutes" is implied for the outage response | C-S4-11 |
| Retention | Not specified (OQ-08). The architecture assumes 13 months of detail | Architecture assumption |

## 14. Success metrics

| Theme | Metric |
|---|---|
| North Star (outcome) | % more orders from agencies or campaigns whose targeting was optimised using funnel-attribution data, vs unoptimised ones |
| Attribution rate | Over 80% of orders on tagged Buyer Apps matched to a click, measured per Buyer App (denominator: C-S3-14) |
| Attribution coverage | % of a Buyer App's orders whose complete journey (view → cart → checkout → order) is captured in the one standard schema |
| Schema validation rate | Over 95% of a Buyer App's test events pass validation before its integration goes live |
| Click integrity | Every click that reaches the Router is recorded, including abandoned ones |
| Redirect latency | Under 300 ms at p95, excluding the Buyer App's own page load |
| Link stability | A mid-campaign routing change needs no affiliate action |
| Rule health | No rule sustains a dismissal rate above 50% without review |
| *(v1.1 only)* Split accuracy | Over 1,000 clicks, the actual split is within 2 points of the configured one (C-S2-07) |
| *(v1.1 only)* Funnel reconciliation | Totals by affiliate and by Buyer App are identical (still required by S4-02) |
| *(v1.1 only)* Postback delivery | Over 99% delivered, none duplicated (M7, out of scope) |

## 15. Open questions (PRD §12)

| v1.2 | Question | v1.1 | Services | Tracked as |
|---|---|---|---|---|
| 01 | Should a shopper who taps the same link twice land on the same Buyer App? | OQ-01 | S2 | C-S2-04 |
| 02 | Does the Router respond with a redirect or a page? | OQ-02 | S2 | C-S2-03 |
| 03 | How is ROI cost defined: commission (~20×), or commission plus funded discount (3.4×)? | OQ-03 | S4, S1 | C-S4-08, C-S1-09 |
| 04 | Safari's 7-day storage expiry makes a 30-day window unachievable there. Accept it, or find another mechanism? | OQ-07 | S3 | C-S3-17 |
| 05 | What happens to in-flight clicks when a Buyer App is removed from a live campaign? | OQ-09 | S2, S3 | C-S2-08 |
| 06 | How are alerts actually delivered ("within minutes")? | OQ-10 | S4 | C-S4-11 |
| 07 | How are bots and click fraud handled? | OQ-11 | S2, S3 | C-S2-06 |
| 08 | How long is each entity kept (clicks, events, orders)? | OQ-12 | All | D-X-06 (architecture.md) |
| 09 | Should a shopper who lands on the website and later orders in the app be recoverable at all? | OQ-14 | S3 | C-S3-17 |
| 10 | What deprecation window applies when the event schema changes? | OQ-15 | S1, S3 | C-S1-15, C-S3-13 |
| 11 | Is event integration mandatory for a new Buyer App, or does an unintegrated app simply produce no funnel data? | OQ-16 | S1, S3 | C-S1-02 |
| — | (v1.1 OQ-17, dropped unanswered) How do we ingest affiliate-claimed figures: their APIs, or CSV? | OQ-17 | S4 | C-S4-12 |

Questions that existed in v1.1 but not in v1.2:
- **OQ-04** web-only Phase 1: answered yes (mobile is out).
- **OQ-05** build an SDK or license an attribution provider: moot.
- **OQ-06** cookie vs localStorage precedence: now the Buyer App's problem.
- **OQ-08** Buyer App health for failover: failover was removed.
- **OQ-13** last click wins: replaced by "the Buyer App decides".

## 16. Prototype-only features: triage

| Feature | Where in the prototype | Against the PRD | Suggestion |
|---|---|---|---|
| Live postbacks to affiliates (URL, format, health, success rate, rule R-05) | Affiliates, wizard, Insights | Out of Phase 1 | Drop |
| Auto-failover | Manage routing, notifications | Contradicts S2-07 | Drop; alert instead |
| Router page, deep links, app-store / in-app flows | Buyer App Config | Out of Phase 1 | Drop; keep a "mobile readiness" field |
| Custom rule builder; renaming rules; rule on/off | Settings | Contradicts S4-15 | Drop the builder; on/off is your call |
| Campaign lifecycle (pause/resume/duplicate/archive) | Campaigns | Implied by S1-08 | Keep, as an explicit state machine |
| CSV export | Campaign report | S4-05 (Should) | Keep, plus shareable filtered links |
| Tracking-link sheet (copy / CSV) | Report, wizard | Implied | Keep |
| Emailing a tracking link from the platform; WhatsApp share | Report, wizard | Not in PRD (the architecture says Marketing hands links over) | Your call; if kept, record sends like reports |
| "Send feedback" composer to an affiliate | Campaign report | Not in PRD | Your call; if kept, use the mail relay and record it |
| Scheduled recurring reports (daily/weekly/monthly to stakeholders) | Campaign report | Not in PRD | Your call |
| Per-campaign discussion threads (+ Slack / WhatsApp / copy link) | Campaign report | Not in PRD | Your call (Phase 2?) |
| "What we've learned" notes, auto-cited on flags | Insights, affiliate detail | Not in PRD | Your call (Phase 2?) |
| Quick actions (reduce spend 20%, pause, tell affiliate, manage routing) | Insights | Not in PRD | Navigation shortcuts are fine; "reduce spend" needs a spend field (C-S1-09) |
| "What we'd do" / "next steps" cards | Report, affiliate detail | Not in PRD (they encode the team's framework) | Your call; if kept, rule-driven and deterministic |
| New-user share | Daily stats (data only) | Not in schema; it's shopper-level | Drop |
| "Effect right now" threshold preview | Settings | Not in PRD | Nice to have; needs on-demand rule evaluation |
| Event-wiring status, validation pass rate, "Test an event" | Buyer App Config | Supports success metrics | Keep |
| Notifications | Top bar | Partly the PRD's outage alerts | Keep for alerts |
| Global search, filter chips | Campaigns, Affiliates | UI convenience | Keep |
| Channels: one tracking link per affiliate × channel, results per channel (prototype v3) | Wizard, Affiliates, campaign report, CSVs | Not in PRD | **Kept** (C-S1-20, ADR-013) |

## 17. Reference data (prototype seed, useful for fixtures and tests)

**Categories**

| Category | Default window | Category-match floor | EPC floor | Weekly demand share, weeks 1–4 | Source of the shares |
|---|---|---|---|---|---|
| Grocery | 7 days | 65% | ₹1.30 | 25.7 / 35.6 / 23.5 / 15.2 | Real ("Retail_Roadmap") |
| Fashion | 14 days | 35% | ₹1.60 | 20 / 24 / 28 / 28 | Illustrative |
| Electronics | 30 days | 70% | ₹2.00 | 15 / 20 / 30 / 35 | Illustrative |
| Home & Kitchen | 14 days | 60% | ₹1.50 | 24 / 30 / 26 / 20 | Illustrative |

**Threshold defaults (Settings)**

| Key | Default | Range in the UI | Used by (v1.2 rule) |
|---|---|---|---|
| affiliateGap | 15% | 5–50 | R-01, R-02 |
| buyerAppGap | 15% | 5–50 | R-03, R-04 |
| affiliateQualityBenchmark | 2% CVR | (no slider) | R-05 |
| category-match floor | per category | 10–90% | R-06 |
| EPC floor | per category | ₹0.50–5.00 | R-07 |
| trafficGap | 10 pts | 2–30 | R-08 |
| campaignGap | 15% | 5–50 | R-09, R-10 |
| roiFloor | 5.0× (with per-campaign override) | 1–15, steps of 0.5 | R-11 |
| timing gap | 5 pts (hard-coded) | — | R-12 |
| pacingDropPct | 30% | 5–70 | R-13 |
| concentrationCap | 60% | 30–90 | R-14 |
| reconciliationGapPct | 3% | 0.5–15 | R-15 |
| ticketSkewCeiling | 65% | 20–95 | R-16 |
| AOV buckets | low ₹500 / high ₹1,500 (fixed) | — | R-16 |

**Buyer Apps**

| App | Domain | Tier | Agreement | Live since | Validation pass | Checkout success | Deep link | Events not wired |
|---|---|---|---|---|---|---|---|---|
| Hamaramall | hamaramall.com | 2 | Signed | 12 Mar 2026 | 98.4% | 91% | `hamaramall://` | order_status_update |
| Digihaat | digihaat.in | 1 | Signed | 02 Jun 2026 | 94.1% | 54% | — | category_view, order_status_update |
| Apna Bazaar | apnabazaar.in | 0 | Signed | 19 Jul 2026 | 89.6% | 88% | `apnabazaar://` | add_to_cart, order_status_update |

Our landing → product-view rate vs each app's own baseline: Hamaramall 58% vs 63%, Digihaat 50% vs 61%, Apna Bazaar 54% vs 57%.

**Affiliates.** All three have a 6% rate and a 14-day contract window.
- Admitad: `partnerships@admitad.com`; Healthy; monthly target 9,200 orders.
- CashKaro: `ops@cashkaro.com`; Healthy; target 3,600.
- Wishlink: no email on file; Degraded; target 2,100.

**Campaigns**

| Id | Name | Category | Routing | Status | Budget |
|---|---|---|---|---|---|
| c1 | Diwali Spices Sale | Grocery | Hamaramall 100 | Live | ₹60k |
| c2 | Festive Fashion Edit | Fashion | Digihaat 100 | Live | ₹95k |
| c3 | Electronics Payday Sale | Electronics | HM 40 / DH 30 / AB 30 | Live | ₹90k |
| c4 | Kitchen Essentials Restock | Home & Kitchen | Digihaat 100 (auto-failover on) | Live | ₹45k |
| c5 | Grocery Weekend Flash | Grocery | Hamaramall 100 | Paused | ₹20k |
| c6 | Back to School Electronics | Electronics | Digihaat 100 | Live | ₹15k |
| c7 | Fashion Clearance | Fashion | Hamaramall 100 | Ended | ₹50k |
| c8 | Home Makeover Week | Home & Kitchen | Hamaramall 100 | Draft | — |
| c9 | Grocery Subscribe & Save | Grocery | DH 60 / HM 40 | Live | ₹30k |
| c10 | Premium Electronics Launch | Electronics | Hamaramall 100 | Live | ₹2L |

**Event payload sample (prototype, Hamaramall).** Note the missing envelope fields (C-S3-05).

```json
{"event_name":"order_confirmed","click_id":"ck_88231","order_id":"HM-ORD-88231","order_value":2450,
 "items":[{"sku":"HM-4521","category":"Spices","qty":2,"price":245},{"sku":"HM-1290","category":"Snacks","qty":1,"price":1960}]}
```

## 18. How the PRD changed from v1.1 (16 Aug) to v1.2 (20 Aug)

- **Eight modules became five services:**
  - M1 → S2;
  - M2 + M4 → S3 (CCTV now also matches);
  - M3 + M8 → S1;
  - M5 + M6 → S4;
  - M7 (postback forwarder) removed;
  - S5 UI made explicit.
- **Affiliate postbacks:** in scope → out ("live postbacks to affiliates"); replaced by emailed reports (S4-20…25).
- **Failover (M1-09):** removed. S2-07 now says the request fails, the failure is recorded, and there's no automatic re-route.
- **Attribution choice:** the server's most-recent-click rule (M4-01/09) and the client-side expiry (M4-10) were replaced by "the Buyer App decides; we attribute what we're given" (S3-06).
- **Tiers:** the table was renumbered 0/1/2 → 1/2/3, but the requirement text wasn't (C-S1-01).
- **Rules:** R-05 Postback health was removed and the table renumbered to R-01…R-16, but the cross-references weren't (C-S4-01).
- **Freshness:** "60/120 min" → 120 min.
- **Added:**
  - S2-03 (the click id is the only id passed on) and S2-07 (unavailable app);
  - S1-08…11 (activation, versioning, rollback, no restart);
  - S4-20…25 (affiliate reports and send records);
  - the event name `checkout_started` (was `checkout`).
- **Open questions:** v1.1's OQ-04, 05, 06, 08, 13 and 17 were removed; the rest were renumbered 01–11.
- **Success metrics:** North Star and attribution coverage were added. Split accuracy, funnel reconciliation and postback delivery were removed.

## 19. Contradiction and open-point index

Every item is **Open** until we resolve it together. Resolutions are recorded on the item itself and as ADRs in `docs/adr/`.

Progress so far:
- **Resolved:** C-S1-03 (ADR-011), C-S1-08 (ADR-014), C-S1-20 (ADR-013).
- **Partly resolved:** C-S1-13 (ADR-011).

| Service | Items |
|---|---|
| **S1** | 01 tier numbering · 02 Tier-0 traffic · 03 default window · 04 commission placement and shape · 05 landing path · 06 reasons, history, rollback · 07 link format and immutability · 08 affiliate entity and contract window · 09 campaign cost/budget · 10 lifecycle · 11 Tier-2 enablement · 12 agreement/tier changes on live campaigns · 13 category taxonomy · 14 mobile readiness · 15 schema publication and deprecation · 16 AOV buckets · 17 concentration-cap scope · 18 targets · 19 disclosure ownership (note) · 20 channels |
| **S2** | 01 auto-failover · 02 meaning of "unavailable" · 03 redirect vs page · 04 sticky routing · 05 taps that can't be routed · 06 bots, previews and fraud · 07 split accuracy · 08 in-flight clicks · 09 extra query parameters |
| **S3** | 01 event names · 02 campaign_id on landing · 03 Tier-1 status updates · 04 never-dropped vs tier · 05 envelope fields · 06 organic session key · 07 one window or both · 08 window clock · 09 multiple clicks · 10 category-match details · 11 test events · 12 cancellations · 13 schema strictness · 14 attribution-rate denominator · 15 "postback" terminology (note) · 16 duplicate orders · 17 accepted losses · 18 event authentication · 19 order_confirmed shape |
| **S4** | 01 rule numbering · 02 R-05 postback health · 03 editable rules · 04 value at stake · 05 gap semantics and minimum volume · 06 funnel stages · 07 metric definitions · 08 ROI cost · 09 commission payable · 10 dismissal vs acknowledgement · 11 outage alert · 12 claimed figures · 13 Buyer App reports · 14 cohort edge cases · 15 time in the daily view · 16 affiliate report contents · 17 report period · 18 timing data · 19 confirmations in the queue · 20 traffic quality needs Tier 2 · 21 prototype-only features · 22 North Star action record · 23 freshness labels (note) |
| **S5** | 01 roles and permissions · 02 missing screens · 03 contradicting screens · 04 shareable views |
