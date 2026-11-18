# Corvo Procurement — PR to PO

Chat-first purchase requests for Corvo Engineering, with a **policy-as-data** decision engine: every PR line is matched, clubbed into requirements, valued against contracts/PO history, and routed to a **purchase order** (contract, emergency or spot) or a **sourcing event** (RFQ, RFP, capex, new item) by the version of the procurement policy in force on the requirement date.

- **Hosted app:** _filled in after deploy_
- **Design / decisions:** [`DECISIONS.md`](DECISIONS.md) (judgment calls) · [`APPROACH.md`](APPROACH.md) (tools + architecture)
- **Design doc / plan:** `docs/superpowers/specs/` and `docs/superpowers/plans/`

## What it does

- **Chat intake.** “Need 200 nitrile gloves for Chakan by next Friday” → the assistant matches the item, asks only for missing quantity/plant/need-by, confirms, creates the PR and shows the engine decision immediately. Unknown items become new-item sourcing; the assistant never invents a catalogue entry.
- **Batch intake + API.** Upload a PR CSV in the sample format, or `POST /api/process-batch` (multipart `file` or raw CSV; add `?format=csv`). Decisions are exportable in the exact scoring format.
- **Policy as data.** The policy lives in versioned JSON (`policy_versions`) with effective dates and ordered rules over item type, category, plant, value, urgency, contracts and purchase history. Procurement uploads an amendment (PDF or text), the app shows a plain-language diff, the rules can be adjusted in the editor, and approval activates the new version — no code change.
- **Decision engine.** Item matching (with a numeric guard), 14-day/7-day clubbing, valuation hierarchy, contract ceiling consumption in requirement-date order, PDF-only contracts, preferred supplier ranking with reference prices, supplier suggestions with category top-up, PO consolidation (same supplier/plant/route within 24h).
- **Buyer workspace.** Every requirement with its lines, value, award or suggestions, and the clause/contract/PO relied on. Approve, or override with a mandatory written reason. Full audit trail.
- **Preferred suppliers.** Ranked list per item as of any date, with the score components shown, exportable as `item_code,rank,supplier_id,reference_price` (top 3).
- **Contracts.** Register + lines, ceiling usage, and “add contract from signed PDF” with an extraction preview.
- **Runs.** Reprocess a batch after a policy change; exports reflect the policy version actually applied per requirement.

## Quick start (local, one command)

Requirements: Docker Desktop (or a local Postgres 16+), Node 22.

```bash
docker compose up --build
# app:      http://localhost:3000
# database: postgres://corvo:corvo@localhost:5432/corvo
```

The app starts empty by design — the task kit data is **not** committed to this public repo. Load it either way:

**Option A — admin screens (no terminal):** open **Data & runs**, upload the six kit CSVs under *Master data* (item master, supplier master, plants, PO history, contract register, contract lines), then upload a PR batch. Two PDF-only contracts (signed after the register) can be added from **Contracts → Add contract → Upload signed PDF**; the extractor prefills the form. (The two kit PDFs are `RC-2026-031.pdf` and `RC-2026-033.pdf`.)

**Option B — seed script (reads the kit folder, writes to the DB):**

```bash
cd web
npm install
DATABASE_URL=postgres://corvo:corvo@localhost:5432/corvo npm run seed -- --dir "C:\\path\\to\\Cantill_FullStack_Task_Kit"
```

The seed also extracts the PDF-only contracts and loads policy v5.0. Then process a batch from **Data & runs** or via the API.

### Local without Docker

```bash
cd web
cp .env.example .env.local        # set DATABASE_URL to your Postgres
npm install
npm run seed -- --dir "C:\\path\\to\\Cantill_FullStack_Task_Kit"
npm run dev                        # http://localhost:3000
```

### Tests

```bash
cd web
npm test
```

70+ unit and golden tests. The golden suite pins all 14 worked examples, the three preferred-supplier lists and the published PO numbers; it runs automatically when the kit folder is available (next to the repo or via `KIT_DIR`) and skips cleanly otherwise.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/process-batch` | CSV in (multipart `file` or raw body) → decisions JSON; `?format=csv` returns the export CSV |
| POST/GET | `/api/batches` | upload/list PR batches |
| POST | `/api/batches/:id/process` | process (or reprocess) a batch → new run |
| GET | `/api/runs`, `/api/runs/:id` | run list/detail (requirements, POs, rows) |
| GET | `/api/runs/:id/export` | decisions CSV (exact scoring format) |
| GET | `/api/preferred?item_code=ITM-1038&as_of=2026-11-02` | ranked preferred list with score breakdown |
| GET | `/api/preferred/export?as_of=2026-11-01` | `item_code,rank,supplier_id,reference_price` top 3 |
| GET/POST | `/api/policy` | list versions / activate a new version |
| POST | `/api/policy/amend` | text or PDF → proposed policy + plain-language changes + unparsed notes |
| POST | `/api/requirements/:id` | approve |
| POST | `/api/requirements/:id/override` | override (comment required) |
| GET/POST | `/api/contracts` | register/lines; add or update a contract |
| POST | `/api/contracts/extract` | PDF → contract draft |
| GET | `/api/audit` | audit trail |

Example:

```bash
curl -X POST http://localhost:3000/api/process-batch \
  -F "file=@sample_pr_batch.csv" \
  -H "x-actor: Asha" -H "x-role: Buyer"
```

## Export format

`pr_no, pr_line, resolved_item_code, group_id, po_id, decision, route, supplier_id, unit_price, group_value_inr, suggested_supplier_ids, policy_version, reason`

- Sourcing rows have blank supplier/price/PO and `;`-joined suggestions.
- Lines deliberately not processed use `route=NOT_PROCESSED` and a reason.
- Values and prices are exact 2dp; `reason` names the rule and the contract/PO relied on.

## Architecture

```
web/src/engine/     pure decision engine (no DB/IO):
                    match → club → value/contracts → ordered rules →
                    preferred lists/suggestions → consolidate → export
web/src/app/api/    route handlers (batches, runs, policy, contracts, chat, admin)
web/src/app/        UI: chat intake, buyer workspace, suppliers, contracts, policy, data & runs
web/src/db/         schema + pg helpers
web/scripts/seed.mts  kit-dir seeder (also extracts PDF contracts)
```

PostgreSQL holds master data, contracts, policy versions, batches, runs, requirements, POs, sourcing events, run snapshots and the audit log. The engine is a pure projection of the data + the policy in force, so the same code powers tests, the UI and the API.

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (required) |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | optional BYOK hook for future AI-assisted parsing; not required |

## Notes

- The kit data files are intentionally **not** in this repo (per the task rules); everything the app needs is loaded through the screens above or the seed script.
- Demo authentication is a name/role switcher; every action is recorded with actor, role and timestamp in the audit log.
- Judgment calls (urgency column vs free text, PUN2, new-item without estimate, ranking weights, valuation vs reference price, PO numbering, policy-version semantics and more) are recorded in [`DECISIONS.md`](DECISIONS.md).
