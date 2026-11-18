# APPROACH

## What this is

A chat-first procurement intake app for Corvo Engineering. Requesters describe a need; the app matches the item, asks only for missing details, and decides — by applying the company policy as **versioned data** — whether to place a purchase order or start a sourcing event. Buyers review, approve, override with a reason, and everything is audited. Procurement can upload a policy amendment, see the change in plain language, approve it, and the engine's behaviour changes with no code edit.

## AI tools used

- **OpenCode** coding agent (agentic CLI) running the model **DeepSeek V4.1 Flash**, used for: scaffolding, engine implementation, tests, API and UI code, and documentation drafts.
- No AI service is required at runtime. The app's chat intake and policy-amendment reading are deterministic. An optional BYOK OpenAI-compatible key (`OPENAI_API_KEY`) is scaffolded for future prose-parsing assistance, but the shipped flows work without it.
- The human owner reviewed the result, owns the decisions in `DECISIONS.md`, and can explain/change every part of the code.

## How correctness was driven

1. **Policy first.** The policy PDF was transcribed into an executable rule document (`web/src/engine/policy-v5.json`) with ordered rules, thresholds, windows and outcomes as data — not code.
2. **Golden tests.** The 14 worked examples plus the three preferred-supplier lists and the seven known PO numbers are encoded as automated tests (`web/src/engine/golden.test.ts`, `preferred.test.ts`, etc.). The full sample batch is run in tests; outputs are asserted against the PDF values. This caught real subtleties: valuation price vs reference price (example 6), ceiling consumption order (examples 3/4), PDF-only contracts (examples 2/4), and the appended-row PO-number offset (documented in `DECISIONS.md` §1.9).
3. **TDD for engine modules.** Matcher, clubbing, valuation, contract selection, ranking, consolidation, amendment parsing and chat NLU each began with failing tests.
4. **Pure engine.** `web/src/engine/*` has no DB or network dependencies, so the same code powers the UI, the batch API and the tests.

## Architecture

- **Next.js (App Router) single app** — React UI + route handlers.
- **PostgreSQL** via `pg` (Neon in production, `postgres:16` in docker compose).
- **Engine** (`web/src/engine`): item matcher → clubbing → valuation/contract selection with ceiling consumption → ordered decision rules → preferred lists/suggestions → PO consolidation → export rows.
- **Policies** (`policy_versions`): JSON documents with effective dates and status; the engine selects the version in force at each requirement date.
- **Amendments**: `POST /api/policy/amend` extracts a proposed policy + plain-language diff from text/PDF; the Procurement UI lets the user correct the rules, then `POST /api/policy` activates a new version.
- **Audit**: `audit_log` captures actor, role, action, entity and details for uploads, runs, approvals, overrides, contract adds and policy activations.
- **PDF contracts**: `unpdf` text extraction + a deterministic parser for the signed contract format, with a review step before saving.

## Local setup

`docker compose up --build` starts Postgres and the app. Seed master data with the provided seed script (kit kept outside the public repo), or upload the CSVs on the Admin screen. See `README.md`.

## What I would improve with more time

- Real authentication/SSO and per-plant buyer queues.
- Persisting approved POs back into contract consumption as a formal monthly register update workflow.
- A richer amendment grammar (and an LLM-assisted mode with the same review gate).
- Dozens more edge-case tests around catalogue matching and near-threshold values.
