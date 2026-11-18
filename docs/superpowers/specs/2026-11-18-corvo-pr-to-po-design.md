# Corvo PR-to-PO App — Design

Date: 2026-11-18 · Owner: jaisw (via AI agent) · Deadline: build freeze Thu 19 Nov 2026 10:00 IST; blind test 10:00–12:00 IST.

## Intent

Corvo Engineering (fictional) wants to replace manual PR triage with a chat-first intake app
whose decision engine routes every purchase requisition line to a PO or a sourcing request
strictly per the company procurement policy. The policy must live as **versioned data**:
a Procurement user uploads an amendment document, the app shows what will change in plain
language, and on approval the new version is active from its effective date — no code change.

## Why

Today people split large needs into small PRs to dodge quote thresholds, and every policy
change means retraining. Automating clubbing + limits fixes both. The kit's grading:
Decisions 40%, Policy-as-data 15%, Chat/UX 20%, DECISIONS.md 15%, Engineering 10%.

## Goals

1. Employees raise PRs by chatting (missing fields asked as follow-ups; unknown items become
   NEW_ITEM_SOURCING, never invented) or by CSV batch upload.
2. Engine reproduces policy v5.0 exactly: item matching, clubbing (14d create / 7d need-by),
   valuation (contract → last PO 365d → standard, with out-of-ceiling fallback to lowest
   applicable contract rate), contracts incl. ceiling consumption in requirement-date order
   and PDF-only contracts, rules 5.1–5.7 in order, preferred supplier lists (our ranking),
   PO consolidation (same supplier+plant+route, 24h from the PO's first requirement).
3. Policy-as-data: versioned JSON; amendment ingestion (parse → plain-language diff →
   approve → activate from effective date); rule editor UI as the guaranteed no-LLM path;
   optional BYOK LLM assist.
4. Buyer workspace: requirements with decision, value, supplier/price or suggestions, the
   clause + contract/PO relied on; approve creates PO/RFQ/RFP; override requires a comment;
   full audit (who, when).
5. `POST /api/process-batch` (CSV in → decisions out) + CSV export in the exact 12-column
   format; preferred-supplier CSV export as of a chosen date.
6. Public repo (no kit data files), hosted demo that stays up, `docker compose up` local run.

## Non-goals

- No real auth (role switcher: Requester/Buyer/Admin user identity for the audit log).
- No email/notifications. No multi-tenant. No live ERP integration.

## Constraints (from brief + kit)

- Output CSV columns: pr_no, pr_line, resolved_item_code, group_id, po_id, decision, route,
  supplier_id, unit_price, group_value_inr, suggested_supplier_ids, policy_version, reason.
- Routes: CONTRACT_PO, EMERGENCY_PO, SPOT_PO, RFQ, RFP, CAPEX_SOURCING, NEW_ITEM_SOURCING,
  NOT_PROCESSED (for lines we deliberately skip, with reason).
- Repo must be public and must NOT contain the task data files (kit CSVs/PDFs). Data reaches
  the app via an admin upload screen / seed script against the DB.
- Hosted link must stay up; graders may repeat blind-test runs against it.
- Frozen app at deadline; amendment must flow through the app's own policy-update feature.

## Approaches considered

1. **Next.js single app + Postgres (Neon) + Vercel.** One language, one deploy, serverless
   never sleeps, Neon free tier persistent. PDF text extraction via `unpdf`. Chosen.
2. **FastAPI + React (Vite) split, Render + Neon.** Python pdfplumber is nicer, but two
   services, two deploys, and Render free tier cold-starts. Rejected.
3. **SQLite-only.** Simplest locally, but no persistent filesystem on Vercel → blind-test
   repeatability risk. Rejected for hosted; Postgres everywhere keeps one code path.

## Key design decisions

- **Engine is pure TypeScript** (`src/engine/*`), no DB/IO deps: takes data + policy JSON in,
   returns decisions. Golden tests pin the 14 worked examples + the 7 known PO numbers.
- **Policy JSON schema** (version, effective_date, clubbing windows, valuation config,
   ordered decision_rules with a small condition DSL over {item_type, item_category, plant,
   value, is_emergency, usable_contract, bought_from_active_supplier, item_code, uom},
   outcomes with supplier/price/suggest-count, preferred-supplier weights, consolidation
   window). New rules / new limits / plant- or category-scoped rules = data edits only.
- **Requirement-date-driven versioning**: each requirement is decided under the policy
   version effective on its requirement date (v5.0 everywhere in Nov 2026; a mid-month
   amendment splits the batch automatically). Recorded in DECISIONS.md.
- **Preferred ranking** (validated against all 4 worked-example lists): weighted score
   recency 35 / frequency(min(POs,5)/5) 25 / contract-held 20 / on-time 10 / quality 10,
   tiebreak supplier_id. **Suggestion top-up** (validated on examples 10 & 12):
   on_time_pct × quality_rating desc, then supplier_id.
- **Reference price**: supplier's most recent PO price in 548d, else most recent contract
   rate (policy 6.3). Exact values exported (e.g. 106.38), displays rounded.
- **NOT_PROCESSED**: unknown plant (PUN2), new item with no estimate, unparseable qty/date.
- **Amendment ingestion** (policy-as-data): upload PDF/txt/paste → deterministic parser
  (limits, windows, category/plant rules, new rules, reorderings) proposes a policy diff →
  plain-language diff view → buyer can hand-edit in the rule editor → approve → active from
  effective date. Optional "Parse with AI" button (BYOK key in settings) as an assist.
- **Chat intake**: deterministic slot-filling (quantity, plant, date via chrono-node, urgency
  keywords) + the engine's item matcher; asks one missing field at a time; creates the PR and
  shows the immediate decision. Unknown items → new-item flow asking for an estimated price.

## What's left to the builder

- Exact chat copy, page layout polish, and small UX affordances.
- DECISIONS.md final wording (I keep a running list as ambiguities surface).
