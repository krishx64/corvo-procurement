# Corvo PR-to-PO App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Corvo chat-first PR intake + policy-driven PO/sourcing decision app, deployed and frozen before Thu 19 Nov 10:00 IST.

**Architecture:** One Next.js (App Router, TypeScript) app: React UI + API routes on top of a pure-TypeScript decision engine (`src/engine/*`) that consumes master data + a policy JSON document. Postgres (Neon in prod, docker compose locally) via `pg`. Policy is versioned data; amendments are parsed → diffed → approved through the app.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, `pg`, `unpdf` (PDF text), `chrono-node` (chat dates), `zod`, vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-corvo-pr-to-po-design.md` + kit PDFs (Corvo_Procurement_Policy.pdf = rules; Worked_Examples.pdf = golden cases; Cantill_FullStack_Task_Brief.pdf = deliverables).

## Global Constraints

- Repo public, **must not contain kit data files** — `.gitignore` `Cantill_FullStack_Task_Kit/`, `extracted/`, `secrets*`, `seed_data/`.
- Output CSV columns (exact order): `pr_no,pr_line,resolved_item_code,group_id,po_id,decision,route,supplier_id,unit_price,group_value_inr,suggested_supplier_ids,policy_version,reason`.
- All money exact 2dp (e.g. 106.38), never pre-rounded; displays may round.
- Every decision records clause + contract/PO relied on in `reason`; `policy_version` separate.
- Route vocabulary: CONTRACT_PO, EMERGENCY_PO, SPOT_PO, RFQ, RFP, CAPEX_SOURCING, NEW_ITEM_SOURCING, NOT_PROCESSED.
- Emergency value limit is ≤ ₹5,00,000 (5.3); spot is < ₹2,00,000 (5.4); RFQ < ₹10,00,000 (5.5); RFP ≥ ₹10,00,000 (5.6).
- Clubbing: same item+plant, created ≤14 calendar days of the requirement's FIRST line, need-by within 7 days either side of the first line's need-by; ties join the earliest requirement; new items never club.
- Valuation 3.1: contract-rate-else-lowest-applicable-contract-rate → most recent PO ≤365d → standard price.
- Contracts 4.1–4.3: covers item + date in range (inclusive) + supplier Active; ceiling check consumed + value@rate; pick lowest rate with room; consumption in requirement-date order; PDF-only contracts start at 0.
- Preferred list 6.1–6.3: Active + (PO ≤548d or contract covering item started ≤ date); reference price = most recent PO ≤548d else most recent contract rate.
- Consolidation 7.1–7.2: same supplier+plant+route, requirement's first line within 24h of the PO's first requirement's first line; join earliest open PO; sourcing never combined; PO ids `PO-0001…` sequential by first requirement creation time.
- Suggestion top-up: on_time_pct × quality_rating desc, tiebreak supplier_id.
- Engine = pure functions; no DB/network inside `src/engine/*`.

## Review Focus

- Free text that must NOT match anything (e.g. "Drinking water purifier 50 LPH") → NEW, never invented: pinned by matcher tests + golden example 13.
- Ceiling cascade: a big clubbed requirement earlier in the batch exhausts a contract and flips later requirements off CONTRACT_PO: golden example 3 + ceiling-order unit test.
- PDF-only contract (RC-2026-031) flipping a mid-batch decision: golden example 2 + extract-contract test.
- Urgency: "- urgent" inside description text with urgency=Normal must stay Normal (column authoritative): unit test on PR-26-00018-like row.
- Unknown plant PUN2 → NOT_PROCESSED with reason: unit test.

---

### Task 1: Scaffold repo + tooling

**Files:** Create `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind` v4 setup, `vitest.config.ts`, `docker-compose.yml`, `Dockerfile`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`.

- [ ] Step 1: `create-next-app` style scaffold (manual to control versions): Next 15 + TS + Tailwind + App Router; verify `npm run dev` boots at :3000.
- [ ] Step 2: Add deps `pg zod unpdf chrono-node papaparse vitest @types/pg`. Add `vitest.config.ts` with `environment: node`, include `src/**/*.test.ts`.
- [ ] Step 3: `.gitignore`: node_modules, .next, .env, `Cantill_FullStack_Task_Kit/`, `extracted/`, `secrets*`, `seed_data/`, `*.local`. `git init` + first commit.

### Task 2: Database schema + connection

**Files:** Create `src/db/schema.sql`, `src/db/index.ts`.

**Interfaces:**
- Produces: `export const q<T>(sql: string, params?: unknown[]): Promise<T[]>` (pg Pool wrapper, `DATABASE_URL` env), and idempotent `ensureSchema()` that runs `schema.sql`.
- Tables: `items, suppliers, plants, po_history, contracts(consumed_value, source), contract_lines, batches, pr_lines(batch_id FK, resolved_item_code, status), policy_versions(version, effective_date, status draft|active|superseded, doc jsonb), runs(batch_id, policy_id, stats), requirements(run_id, group_id, decision, route, supplier_id, po_id, unit_price, value, suggested_supplier_ids, policy_version, reason, contract_id, req_status, override_reason/by/at), requirement_lines(requirement_id, pr_line_id), purchase_orders(run_id, po_id, supplier_id, plant, route), sourcing_events(run_id, requirement_id, type, supplier_ids), audit_log(actor, action, entity, entity_id, details jsonb, at)`.

- [ ] Step 1: Write `schema.sql`; `ensureSchema()` runs it on demand (CREATE TABLE IF NOT EXISTS …).
- [ ] Step 2: Test: script connects to local docker postgres (Task 11 brings compose up early: start `docker compose up -d db` now), `ensureSchema()` twice → no error.
- [ ] Step 3: Commit.

### Task 3: Seed script (kit dir → DB, gitignored)

**Files:** Create `scripts/seed.mjs`, `src/db/seed.ts` (shared upsert logic), `seed_data/README.md` (tells user to drop kit files there; folder gitignored).

**Interfaces:**
- Produces: `seedFromDir(dir: string)` upserts items/suppliers/plants/po_history/contract register+lines; `seedContractPdfs(dir)` extracts RC-2026-031/033 via the Task 4 extractor and inserts `source='pdf'` contracts.

- [ ] Step 1: Implement CSV parse (papaparse) + upserts; `node scripts/seed.mjs --dir <kit> --db $DATABASE_URL`.
- [ ] Step 2: Run against local postgres; assert row counts 73 items, 48 suppliers, 468 POs, 10 register contracts + 2 PDF contracts, 26 contract lines.
- [ ] Step 3: Commit.

### Task 4: Engine core types + policy doc + item matcher

**Files:** Create `src/engine/types.ts`, `src/engine/policy.ts`, `src/engine/match.ts`, `src/engine/match.test.ts`, `src/engine/policy.json` (v5.0 as shipped data — loaded into DB by seed as the first policy version).

**Interfaces:**
- `type PrLine = { pr_no: string; pr_line: number; created_at: string; requester?: string; department?: string; plant: string; item_code?: string; description: string; quantity: number; uom?: string; estimated_unit_price?: number; need_by_date?: string; urgency: 'Normal'|'Emergency' }`
- `type Item = { item_code: string; description: string; uom: string; category: string; item_type: string; standard_price: number }`
- `matchItem(desc: string, items: Item[]): { item?: Item; score: number; ambiguous: boolean }` — token Dice score, digit-token weight 2, abbreviation map (brg→bearing, hyd→hydraulic, pneu→pneumatic…), noise strip ("for maintenance", "as per sample", "urgent", "(repeat)", "qty"), threshold 0.5 (match if all digit tokens also present).
- `type PolicyDoc` per spec: `{ version, effective_date, description?, clubbing:{creation_window_days,need_by_window_days}, valuation:{po_history_days, out_of_ceiling_fallback:'lowest_applicable_contract_rate'}, decision_rules: Array<{id, priority, conditions: Cond[], outcome:'PO'|'SOURCING_REQUEST', route, supplier?:'contract'|'first_preferred', price?:'contract_rate'|'reference_price', suggest_count?}>, preferred_suppliers:{history_days, recency:[90,365], weights:{recency,frequency,contract,on_time,quality}, frequency_cap, topup:'on_time_x_quality'}, po_consolidation:{window_hours, same_supplier, same_plant, same_route} }`
- `Cond = { field: 'item_type'|'item_category'|'plant'|'value'|'is_emergency'|'usable_contract'|'bought_from_active_supplier'|'item_code'|'uom', op:'eq'|'neq'|'lt'|'lte'|'gt'|'gte'|'in', value: unknown }`

- [ ] Step 1: Failing matcher tests: "brg 6308 ZZ for maintenance"→ITM-1022; "hyd hose 1/2 inch 2 wire"→ITM-1035; "eot crane 5 ton"→ITM-1071; "CMM calibration service"→ITM-1066; "monitor 24\""→ITM-1057; "v-belt b-54"→ITM-1024; "welding rod e6013 3.15mm"→ITM-1015; "Drinking water purifier 50 LPH"→no item; "Ultrasonic thickness gauge"→no item; "hydraulic pump seal kit (hydrax) (repeat)"→ITM-1040.
- [ ] Step 2: Run → fail (module missing).
- [ ] Step 3: Implement types, policy.ts (`evaluateConditions`, `loadDefaultPolicy`), match.ts.
- [ ] Step 4: Tests pass.
- [ ] Step 5: Commit.

### Task 5: Clubbing + valuation + contracts

**Files:** Create `src/engine/club.ts`, `src/engine/value.ts`, `src/engine/contracts.ts`, tests for each.

**Interfaces:**
- `clubLines(lines: PrLine[], resolved: Map<lineKey, Item|undefined>, policy: PolicyDoc): Requirement[]` — Requirement: `{ id: string; lines: PrLine[]; first_line_at: string; need_by_date: string; plant: string; item?: Item; total_qty: number; is_emergency: boolean }`; sort lines by (created_at, pr_no, pr_line); new-item lines singleton requirements; candidates joined earliest-first-line-at.
- `selectContract(req, contracts, contractLines, suppliers, policy, consumedSoFar): { contract?: ContractLine & {contract_id, supplier_id, rate, cap, remaining}, reason: string }` — 4.1 applicable, 4.2 ceiling with in-run consumption, 4.3 lowest rate with room.
- `valueRequirement(req, sel, poHistory, items, policy): { unit_price: number; basis: 'contract'|'contract_out_of_ceiling'|'po'|'standard'; ref?: {po_number, po_date} }` — 3.1 (a)(b)(c).

- [ ] Step 1: Failing tests — worked example 5 (three hyd-oil PRs club), example 6 (VCI different plants NOT clubbed), 14-day boundary join, need-by 8-day no-join, valuation standard-price case (ITM-1006), contract-selected rate case, all-out-of-ceiling lowest-rate case (example 3).
- [ ] Step 2: Run → fail.
- [ ] Step 3: Implement.
- [ ] Step 4: Tests pass.
- [ ] Step 5: Commit.

### Task 6: Preferred suppliers + suggestions

**Files:** Create `src/engine/preferred.ts` + test.

**Interfaces:**
- `preferredList(itemCode, asOf, suppliers, poHistory, contracts, contractLines, policy): Array<{supplier_id, status, po_count, recency, has_contract, on_time, quality, score, reference_price, ref_po_number?}>` sorted by score desc, supplier_id asc.
- `suggestions(itemCode, asOf, count, …): string[]` — preferred order + top-up (Active, lists category, not already suggested; on_time×quality desc, supplier_id asc); new items → [].
- Score = 35·recency(1|0.5|0 by ≤90/≤365d) + 25·min(po_count,5)/5 + 20·has_contract + 10·on_time/100 + 10·quality/5.

- [ ] Step 1: Failing tests pinning the 3 worked-example lists as of 1 Nov 2026 (ITM-1048: S029>S030, S031 excluded; ITM-1036: S023>S022>S024; ITM-1016: S009>S010) + ITM-1038 as of 2 Nov (S024 first) + top-up cases (ITM-1006 → S003,S002,S005; ITM-1071 capex list → S045,S047,S020,S048,S046; ITM-1066 → S043,S044,S042).
- [ ] Step 2: Run → fail. Step 3: Implement. Step 4: Pass. Step 5: Commit.

### Task 7: Decision rules + PO consolidation + run engine + export rows

**Files:** Create `src/engine/decide.ts`, `src/engine/consolidate.ts`, `src/engine/run.ts`, `src/engine/export.ts`, tests.

**Interfaces:**
- `decideRequirement(req, ctx: {usableContract, boughtFromActive, value, policy}): { decision:'PO'|'SOURCING_REQUEST', route, rule_id, supplier_id?, unit_price?, suggest_count? }` — first matching rule wins, 5.7 blocked never chosen (preferred list already excludes; contract selection already requires Active).
- `assignPos(reqs: PoRequirement[], policy): Map<reqId, po_id>` — chronological, `PO-` + zero-padded 4.
- `runEngine(input: { prLines, items, suppliers, poHistory, contracts, contractLines, policies: PolicyDoc[] }): { requirements: ReqResult[]; rows: ExportRow[]; pos; warnings }` — resolves items, clubs (per policy of the requirement's first line date), values, consumes ceilings in requirement-date order, decides, consolidates, builds export rows; NOT_PROCESSED rows for unknown plant / new-item-without-estimate / bad qty or need-by.
- `toCsv(results): string` — exact 12 columns; `suggested_supplier_ids` `;`-joined; blank supplier_id/unit_price/po_id for sourcing.

- [ ] Step 1: Failing tests — rule order (capex beats contract? no: 5.1 capex, 5.2 contract — a capex item WITH a contract still goes CAPEX_SOURCING per 5.1 first), emergency ≤5L with history, spot <2L, RFQ <10L incl. never-bought (example 10), RFP ≥10L, boundary 2,00,000 exactly → not spot.
- [ ] Step 2: Consolidation tests — example 14 (two requirements one PO-0003), >24h new PO, sourcing never combined.
- [ ] Step 3: Implement decide/consolidate/run/export.
- [ ] Step 4: Unit tests pass.
- [ ] Step 5: Commit.

### Task 8: Golden run — 14 worked examples + full batch

**Files:** Create `src/engine/golden.test.ts` (fixtures: copy of the needed `sample_pr_batch.csv` rows into `src/engine/fixtures/` — wait, no kit data in repo! Instead: fixtures constructed inline from the worked-examples values, plus the full batch read at test time from `seed_data/` when present, skipped otherwise).

**Interfaces:** `runEngine` over DB-loaded data via a test helper that seeds an isolated schema from `seed_data/` if available; golden assertions hard-coded from the PDFs (allowed — they're decisions, not the data files; but keep numbers inline, no CSV copies).

- [ ] Step 1: Tests: ex1 CONTRACT_PO S001 9168.71 val 137530.65 PO-0011; ex2 CONTRACT_PO S021 2439.01 val 26829.11 PO-0072 (needs PDF contract seeded); ex3 RFQ S014;S013;S016 val 220255.60; ex4/ex14 S007 7.06 val 32546.60/23227.40 both PO-0003; ex5 SPOT_PO S024 166.41 val 126471.60 PO-0001; ex6 SPOT_PO S027 val 156170.30 PO-0002; ex7 SPOT_PO S023 391.82 val 97955 PO-0023; ex8 EMERGENCY_PO S014 106.38 val 253184.40 PO-0024; ex9 RFQ S043;S044;S042 val 336562.15; ex10 RFQ S003;S002;S005 val 80300; ex11 RFP S020;S017;S019;S018 val 2070780; ex12 CAPEX_SOURCING S045;S047;S020;S048;S046 val 6036704.04; ex13 NEW_ITEM_SOURCING val 141100 no suggestions; full-batch: 186 rows, 0 NOT_PROCESSED except none (PUN2 row IS in batch → exactly 1 NOT_PROCESSED), PO numbering monotonic, hyd-oil=PO-0001, VCI=PO-0002.
- [ ] Step 2: Run → fix engine until all pass (this is where the policy meets reality).
- [ ] Step 3: Commit. Any ambiguity discovered → append to `DECISIONS_LOG.md` (grows into DECISIONS.md).

### Task 9: Batch APIs

**Files:** Create `src/app/api/process-batch/route.ts`, `src/app/api/batches/route.ts`, `src/app/api/batches/[id]/process/route.ts`, `src/app/api/runs/[id]/export/route.ts`, `src/app/api/preferred/route.ts`, `src/app/api/preferred/export/route.ts`, `src/app/api/audit/route.ts`, `src/lib/parseCsv.ts`.

**Interfaces:**
- `POST /api/process-batch` — multipart file OR raw CSV text → stores batch + pr_lines → runs engine (policies by requirement date) → stores requirements/POs/sourcing → returns JSON decisions; `?format=csv` returns the 12-col CSV.
- `GET /api/runs/[id]/export` → CSV download.
- `GET /api/preferred?item_code=&as_of=` → ranked list + score breakdown; `GET /api/preferred/export?as_of=` → `item_code,rank,supplier_id,reference_price` top 3 for every item.
- All wrapped with audit_log entries (actor from `x-user` header/cookie set by UI role switcher).

- [ ] Step 1: Implement routes with zod validation.
- [ ] Step 2: Manual curl test: upload `sample_pr_batch.csv` → 186 rows out, correct header, spot-check 3 golden lines match Task 8.
- [ ] Step 3: Commit.

### Task 10: Policy-as-data APIs (versions, amendment parse, approve)

**Files:** Create `src/app/api/policy/route.ts` (GET list), `src/app/api/policy/amend/route.ts` (POST amendment text/PDF → proposed PolicyDoc + plain-language diff), `src/app/api/policy/[id]/approve/route.ts`, `src/engine/policyDiff.ts` (diff → plain-language lines), `src/engine/amendmentParser.ts` (deterministic), tests for parser + diff.

**Interfaces:**
- `parseAmendment(text, current: PolicyDoc): { proposed: PolicyDoc; changes: Change[]; unparsed: string[] }` — Change: `{kind:'limit'|'window'|'new_rule'|'modify_rule'|'reorder'|'remove_rule', target, before, after, plain: string}`.
- Parser recognizes: rule ids (5.1…5.9, "new rule 5.4A"), ₹ amounts (₹5,00,000 / 500000 / 5 lakh), windows (days/hours), plant codes (PUN1/CHK1/bhosari/chakan), categories (from supplier master list), item types (Capex/Material/Service), routes, suggest counts, "applies only to", "replace X with Y", "limit", "threshold".
- Approve → new row status active (effective_date from amendment or today), older overlapping version superseded; run 2 then decides each requirement under the version effective on its requirement date.

- [ ] Step 1: Failing parser tests: "In rule 5.4, replace ₹2,00,000 with ₹3,00,000" → 5.4 value 300000; "New rule 5.4A: for plant CHK1, value below ₹5,00,000 with purchase history → SPOT_PO" → new rule with plant condition; "clubbing window 21 days" → clubbing.creation_window_days 21; "RFP threshold ₹15,00,000" → 5.5 lt 1500000 + 5.6 gte 1500000.
- [ ] Step 2: Implement parser + diff + routes.
- [ ] Step 3: Tests pass; commit.

### Task 11: Contracts APIs incl. PDF extraction

**Files:** Create `src/app/api/contracts/route.ts` (GET list, POST manual add), `src/app/api/contracts/extract/route.ts` (POST PDF → parsed {contract_id, supplier_id, start, end, cap, lines[]} for confirmation), `src/lib/pdf.ts` (unpdf text), test with kit `RC-2026-031.pdf`.

- [ ] Step 1: Extract test asserts RC-2026-031 → S021, 2026-11-15→2027-11-14, cap 2000000, 3 lines with rates.
- [ ] Step 2: Implement; commit.

### Task 12: Chat intake (NLU + API + UI)

**Files:** Create `src/lib/chatNlu.ts` (+test), `src/app/api/chat/route.ts` (stateless per message: server re-derives slots from conversation), `src/app/page.tsx` (chat UI + batch upload dropzone), `src/app/api/chat/confirm/route.ts` (creates PR + runs engine for instant decision).

**Interfaces:**
- `parseMessage(text, now: Date): { quantity?, plant?, need_by?, urgency?, est_price?, item_hint?, item_code? }` via regex + chrono-node + plant/city names.
- Flow: extract → match item (chat shows top-3 candidates with scores when ambiguous) → ask missing slots one at a time → confirm summary → create PR `PR-26-00XXX` → run engine → reply with decision in plain language.
- [ ] Step 1: NLU tests: "need 200 nitrile gloves for Chakan by next Friday" → qty 200, plant CHK1, item ITM-1048 hint, need_by = next Friday (from fixed `now`); "urgent!" → Emergency; "20 bearings" ambiguous → asks which (6205/6308/32210).
- [ ] Step 2: Implement NLU + routes + chat UI (message list, quick-reply chips, confirm card).
- [ ] Step 3: Manual test in browser; commit.

### Task 13: Buyer workspace UI

**Files:** Create `src/app/buyer/page.tsx`, `src/app/buyer/[id]/page.tsx`, `src/app/api/requirements/[id]/approve|override/route.ts`, shared `src/components/*`.

- Requirements list (run selector, filters by route/status), each row → decision detail: value, route, supplier+price or ranked suggestions, WHY (rule id, policy version, contract id/rate or ref PO number+date), clubbed lines, status. Approve button (creates PO/sourcing event + audit); Override (comment required).
- [ ] Step 1: Implement pages + endpoints with audit.
- [ ] Step 2: Browser test: approve one CONTRACT_PO, override one RFQ with comment, audit shows both. Commit.

### Task 14: Policy UI (versions, amendment upload, diff, approve, editor)

**Files:** Create `src/app/policy/page.tsx`, `src/app/policy/[id]/page.tsx`, rule-editor component.

- List versions (status, effective date); upload amendment (PDF/txt/paste) → shows plain-language changes + unparsed leftovers warning → editable proposed policy (rule table: conditions/outcome/limits, add/remove/reorder) → Approve (effective date input) → active. Raw JSON view for power users.
- [ ] Step 1: Implement; commit.

### Task 15: Contracts + preferred suppliers + admin data UI

**Files:** Create `src/app/contracts/page.tsx` (register + add via PDF extract or manual form), `src/app/suppliers/page.tsx` (item search → ranked list with score breakdown + as-of export), `src/app/admin/page.tsx` (upload master CSVs + contract PDFs, runs list with export links, audit log view).

- [ ] Step 1: Implement pages; commit.

### Task 16: Deploy (Neon + Vercel) + seed prod + verify

- [ ] Step 1: `docker compose up` full local stack verified end-to-end.
- [ ] Step 2: User provides Neon URL → `.env` + `vercel env add DATABASE_URL`; `vercel deploy`; run seed script against Neon; upload sample batch through hosted UI; verify golden rows.
- [ ] Step 3: Keep `vercel logs` clean; commit compose files.

### Task 17: DECISIONS.md, APPROACH.md, README + final freeze

- [ ] Step 1: DECISIONS.md from `DECISIONS_LOG.md` (ambiguities: urgency-column-authoritative, PUN2, new-item-no-estimate, ranking formula + validation vs worked examples, top-up formula, requirement-date policy versioning, run-scoped ceiling consumption, rounding, tie-breaks, PO/REQ id formats).
- [ ] Step 2: APPROACH.md (AI tools used: OpenCode agent w/ GLM model; engine hand-verified against worked examples), README (docker compose up, env, seed instructions, hosted link, API examples).
- [ ] Step 3: Full golden suite green, repo pushed to GitHub `krishx64/corvo-procurement`, submission links handed to user.
