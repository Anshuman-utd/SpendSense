# SpendSense

**AI-Powered Personal Finance & Smart Transaction Intelligence Platform**

SpendSense is a full-stack personal finance platform for tracking expenses, managing monthly budgets and recurring subscriptions, scanning receipts with multimodal AI, and ingesting bank CSV statements through an asynchronous Redis/BullMQ processing pipeline.

[![Live Demo](https://img.shields.io/badge/Live_Demo-spend--sense--pink.vercel.app-10b981?style=flat-square)](https://spend-sense-pink.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-20232a?style=flat-square&logo=react)](https://react.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas_%2B_GridFS-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-Upstash_%2B_BullMQ-DC382D?style=flat-square&logo=redis&logoColor=white)](https://upstash.com/)
[![Groq](https://img.shields.io/badge/AI-Groq_SDK-f55036?style=flat-square)](https://groq.com/)

**Live Demo:** https://spend-sense-pink.vercel.app/ · **Repository:** https://github.com/Anshuman-utd/SpendSense

---

## Overview

Personal expense trackers typically break down when users have to enter transactions manually or reconcile noisy bank CSV exports. SpendSense combines day-to-day expense management with a multi-stage statement ingestion pipeline and Groq-powered AI workflows so users can:

- Track, filter, and categorize daily expenses, monthly category budgets, and recurring subscriptions.
- Upload bank statements in CSV format and process transactions asynchronously in the background.
- Automatically normalize dates/amounts, extract merchants, detect duplicates, and classify debits, credits, refunds, and transfers.
- Review and edit staged transactions before committing them to the main expense ledger.
- Scan receipt images with multimodal AI to extract structured expense records automatically.
- Generate 30-day AI spending insights and inspect spending patterns through interactive analytics charts.

---

## Key Features

### Smart Transaction Ingestion Engine
- **CSV Upload & GridFS Staging:** Accepts CSV statements (up to 5 MB / 10,000 rows), validates non-binary text content, stages raw files in MongoDB GridFS, and purges them automatically after confirmation. Includes a downloadable sample CSV template (`GET /api/imports/template`).
- **Automatic & Manual Column Mapping:** Detects common bank CSV header schemas (separate Debit/Credit or signed Amount columns) and falls back to a manual column-mapping UI when headers are ambiguous.
- **Transaction Normalization & Merchant Extraction:** Parses multiple date formats (`DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY`, `DD-MMM-YYYY`, etc.), converts amounts into integer minor units to prevent floating-point drift, and strips banking prefixes (e.g., UPI/NEFT tokens) to extract clean merchant names.
- **Multi-Tier Duplicate Detection:** Guards against duplicates using file-level SHA-256 checksums, bank reference numbers (UTR/reference IDs), and fallback fingerprints (`date + amount + direction + merchant`). Suspected duplicates are flagged and deselected by default for user verification.
- **Three-Stage Categorization Pipeline:**
  1. **Level 1 — User Rules:** Applies previously learned per-user `MerchantCategoryRule` mappings.
  2. **Level 2 — Deterministic Rules:** Matches common merchants and keywords using fast pattern dictionaries.
  3. **Level 3 — Groq AI Fallback:** Sends only ambiguous debit descriptions (with PII sanitized) to Groq for structured classification.
- **Financial Classification & Review Workflow:** Distinguishes expenses from income, refunds, and self-transfers, stages rows in `ImportedTransaction`, and presents an interactive `/imports` review table before idempotently writing approved expenses to MongoDB.

### AI-Powered Features
- **Groq Vision Receipt Scanner:** Uploads receipt images to Cloudinary and uses Groq multimodal vision (`qwen/qwen3.8-27b`) to extract merchant, total amount, currency, category, date, and item summary directly into a saved expense.
- **AI Spending Insights:** Aggregates the last 30 days of user expenses locally and prompts Groq (`openai/gpt-oss-120b`) with strict JSON output enforcement to produce a spending overview, areas for attention, and actionable savings tips persisted in MongoDB.
- **Fallback Transaction Categorization:** Assists the ingestion worker in categorizing unrecognized bank narrations when user and deterministic rules do not match with high confidence.

### Personal Finance Management
- **Expense Management:** Full CRUD API (`/api/expenses`, `/api/expenses/[id]`) with list/grid views, keyword search, month switching, category filters, and a mini-calendar date picker.
- **Monthly Budgets:** Category-level monthly budgets (`/api/budgets`) with progress tracking and budget-vs-actual summaries on the dashboard and `/budget` view.
- **Financial Analytics:** Interactive Recharts dashboards displaying daily spending trends, category distribution, weekly month-over-month comparisons, and top merchants.
- **Recurring Payments & Subscriptions:** Dedicated `/recurring` tracker calculating active monthly/yearly recurring totals, active/paused toggles, and upcoming weekly dues.
- **Authentication & User Isolation:** NextAuth.js JWT authentication supporting Google OAuth and email/password registration (`bcryptjs`), server-side session checks across all API routes, and profile/avatar management in `/settings`.

---

## Tech Stack

| Layer | Technologies | Purpose |
|---|---|---|
| **Frontend** | Next.js 16 (`16.1.1`, App Router), React 19 (`19.2.3`), JavaScript / JSX, Tailwind CSS v4 | Server/client UI, dark-theme dashboard, interactive review tables |
| **UI & Charts** | Recharts, Headless UI, Heroicons, React Hook Form, `date-fns` | Financial visualizations, accessible modals/menus, form and date utilities |
| **Backend & API** | Node.js (v22), Next.js Route Handlers, Zod, PapaParse | REST API endpoints, payload validation, high-speed CSV parsing |
| **Database & Storage** | MongoDB Atlas, Mongoose (`9.0.2`), MongoDB GridFS | Primary document store, indexed financial models, staged CSV storage & cleanup |
| **Async Queue & Worker** | BullMQ (`6.7.6`), `ioredis` (`6.0.0`), Upstash Redis / Local Redis | Decoupled background job queue (`statement-import-queue`) and persistent Node.js worker |
| **AI & Media** | Groq SDK (`1.6.0`), Cloudinary (`2.8.0`) | Multimodal receipt parsing (`qwen/qwen3.8-27b`), structured text inference (`openai/gpt-oss-120b`), receipt & avatar hosting |
| **Authentication** | NextAuth.js (`4.24.13`), Google OAuth, `@auth/mongodb-adapter`, `bcryptjs` | OAuth + credentials auth with JWT sessions and per-user data isolation |
| **DevOps & Quality** | Vercel, Docker (`Dockerfile.worker`, `docker-compose.yml`), GitHub Actions, Biome, `node:test` | Web hosting, containerized worker packaging, CI pipeline, linting, and unit/integration tests |

---

## System Architecture

```mermaid
flowchart LR
    Browser["Browser (React 19 / Next.js UI)"] --> API["Next.js App Router APIs (Vercel)"]

    API -->|"CRUD, Auth, GridFS Staging"| Mongo[("MongoDB Atlas + GridFS")]
    API -->|"Receipt Images & Avatars"| Cloudinary["Cloudinary"]
    API -->|"Receipt Vision & 30-Day Insights"| Groq["Groq AI"]
    API -->|"Enqueue process-import / confirm-import"| Redis[("Upstash Redis (BullMQ Queue)")]

    Redis -->|"Consume Jobs (TLS rediss://)"| Worker["Standalone Node.js Worker (src/workers/importWorker.js)"]
    Worker -->|"Read CSV, Stage Rows, Idempotent Writes"| Mongo
    Worker -->|"Level 3 Fallback Categorization"| Groq
```

> **Deployment Architecture Note:** The Next.js frontend and API routes are deployed on **Vercel**, while **Upstash Redis** hosts the BullMQ queue. The BullMQ worker (`src/workers/importWorker.js`) runs as a separate Node.js process (run locally when needed or deployed independently via `Dockerfile.worker`) rather than inside Vercel serverless functions. Asynchronous CSV statement imports require an active worker connected to the same Redis and MongoDB instances.

---

## Engineering Highlights

- **Separated Producer & Worker Redis Clients:** API producers run with bounded timeouts (`connectTimeout: 5000ms`, `maxRetriesPerRequest: 1`, `enableOfflineQueue: false`) so serverless routes fail fast with `503 Service Unavailable` if Redis is unreachable, while the standalone worker uses persistent reconnection (`maxRetriesPerRequest: null`) with verified TLS (`rediss://`) and credential-sanitized logging.
- **Atomic Confirmation State Machine:** Enforces explicit lifecycle transitions (`ready_for_review -> confirmation_queued -> importing -> completed` / `partially_completed`) via conditional MongoDB `findOneAndUpdate` claims, preventing double-queueing and ensuring API responses cannot overwrite faster worker transitions.
- **Attempt-Scoped Confirmation Tokens:** Both `/api/imports/[id]/confirm` and `/api/imports/[id]/retry` generate a per-attempt `crypto.randomUUID()` token persisted with `confirmation_queued` and embedded in deterministic BullMQ job IDs (`confirm-<jobId>-<token>`). Delayed or stale worker jobs from timed-out attempts are safely reconciled without interfering with active attempts, and enqueue failures perform token-scoped rollback.
- **Active Worker Protection & Idempotent Retries:** The retry endpoint blocks reclamation of jobs updated within the last 30 seconds (`409 Conflict`), preserves staged transaction edits without re-parsing CSVs, and skips previously imported rows (`importStatus: "imported"`) to avoid duplicate `Expense` records.
- **Production Safety Guards:** Synchronous import fallbacks (`SYNC_PROCESSING`, `?sync=true`) and insecure TLS overrides (`REDIS_TLS_REJECT_UNAUTHORIZED=false`) are strictly disabled when `NODE_ENV=production`.
- **Isolated Integration Testing:** Integration tests bootstrap `MONGODB_TEST_URI` before importing application database modules, verify the active Mongoose database name, and normalize Redis URLs to refuse execution against primary application resources.

---

## Getting Started

### Prerequisites

- **Node.js 22+** (CI runs on Node 22; requires Node 18+ with native `node:test` and `--env-file` support)
- **MongoDB** (MongoDB Atlas cluster or local MongoDB instance)
- **Redis** (Upstash Redis or local Docker Redis)
- **Groq API Key** (for receipt scanning, spending insights, and AI fallback categorization)
- **Cloudinary Account** (for receipt and avatar image uploads)

### Installation

```bash
git clone https://github.com/Anshuman-utd/SpendSense.git
cd SpendSense
npm ci
```

### Configuration

Copy the template environment file and populate your credentials:

```bash
cp .env.example .env
```

### Running Locally

The Next.js web application and the BullMQ statement worker run as **separate processes**:

1. **Start Redis locally** (skip if using Upstash Redis via `REDIS_URL`):

   ```bash
   docker compose up -d redis
   ```

2. **Start the Next.js development server** (Terminal 1):

   ```bash
   npm run dev
   ```

3. **Start the BullMQ background worker** (Terminal 2):

   ```bash
   npm run worker:dev
   ```

   > `npm run worker:dev` loads variables from `.env` for local development. Use `npm run worker` (`node src/workers/importWorker.js`) in container or cloud environments where environment variables are injected at runtime.

Open [http://localhost:3000](http://localhost:3000) in your browser.

*(Optional: for local development without Redis, set `SYNC_PROCESSING=true` in `.env` to execute imports inline. This fallback is disabled in production.)*

---

## Environment Variables

### Application Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `MONGODB_URI` | Yes | MongoDB Atlas or local connection string | `mongodb+srv://user:pass@cluster.mongodb.net/?appName=SpendSense` |
| `NEXTAUTH_SECRET` | Yes | Random secret used to sign NextAuth JWTs | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | Canonical base URL of the web application | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth 2.0 client ID | `your_google_client_id` |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth 2.0 client secret | `your_google_client_secret` |
| `GROQ_API_KEY` | Yes (AI) | Groq API key for vision and text inference | `gsk_your_groq_api_key` |
| `GROQ_TEXT_MODEL` | Optional | Groq model for insights & categorization | `openai/gpt-oss-120b` (default) |
| `GROQ_VISION_MODEL` | Optional | Groq multimodal model for receipt scanning | `qwen/qwen3.8-27b` (default) |
| `REDIS_URL` | Yes (Queue) | Native Redis TCP/TLS URL for BullMQ | `redis://localhost:6379` or `rediss://default:pass@host:port` |
| `CLOUDINARY_CLOUD_NAME` | Yes (Media) | Cloudinary cloud name | `your_cloud_name` |
| `CLOUDINARY_API_KEY` | Yes (Media) | Cloudinary API key | `your_api_key` |
| `CLOUDINARY_API_SECRET` | Yes (Media) | Cloudinary API secret | `your_api_secret` |
| `QUEUE_NAME` | Optional | BullMQ queue name override | `statement-import-queue` (default) |
| `SYNC_PROCESSING` | Dev only | Set `true` to allow sync fallback without Redis in dev | `false` |

> **Upstash Redis Note:** BullMQ requires the native Redis TCP/TLS connection string (`rediss://default:<password>@<endpoint>:<port>`), **not** the Upstash HTTPS REST API URL (`UPSTASH_REDIS_REST_URL`).

### Test-Only Variables (Integration Suite)

| Variable | Required | Description | Example |
|---|---|---|---|
| `MONGODB_TEST_URI` | Integration tests | Dedicated, isolated MongoDB test database URI | `mongodb+srv://user:pass@cluster.mongodb.net/spendsense_test` |
| `REDIS_TEST_URL` | Integration tests | Dedicated, isolated Redis test DB/instance URL | `redis://localhost:6379/1` |

---

## Running Tests & Verification

```bash
# Run unit, parser, categorization, deduplication, and state-machine tests
npm test

# Run live BullMQ + Redis + MongoDB integration tests (requires isolated test DB & Redis)
npm run test:integration

# Verify production Next.js build
npm run build

# Run Biome static checks
npm run lint
```

- **Isolation Policy:** `npm run test:integration` validates that `MONGODB_TEST_URI` and `REDIS_TEST_URL` point to dedicated test resources distinct from `MONGODB_URI` and `REDIS_URL`, failing closed if isolation cannot be verified. Never run integration tests against production databases.
- **Local Parsing Benchmark:** `tests/benchmark_and_formats.test.js` benchmarks local in-memory CSV parsing, column detection, normalization, merchant extraction, batch deduplication, and deterministic categorization of 1,000 synthetic rows with a `< 500 ms` assertion (typically completing in ~20 ms locally). This measures in-memory pipeline performance rather than end-to-end network/database import throughput.

---

## Deployment

### Current Deployment Setup

- **Frontend & API Routes:** Deployed on **Vercel** ([spend-sense-pink.vercel.app](https://spend-sense-pink.vercel.app/)).
- **Database & Statement Staging:** **MongoDB Atlas** (including GridFS).
- **Queue Broker:** **Upstash Redis** (using `rediss://` with verified TLS).
- **AI Inference:** **Groq** (`openai/gpt-oss-120b` and `qwen/qwen3.8-27b`).
- **Media Storage:** **Cloudinary** (receipt uploads and user avatars).

### Running the Background Worker

The BullMQ worker is **not** currently continuously deployed on a separate PaaS. You can run it in two ways:

1. **Local Demonstration Worker:** Point `.env` to the same `REDIS_URL` (Upstash `rediss://`) and `MONGODB_URI` used by Vercel, then start `npm run worker:dev` locally when importing statements.
2. **Dockerized Cloud Worker (Optional):** Deploy `Dockerfile.worker` (`node:22-alpine`, excluding `.env` via `.dockerignore`) to Railway, Render, Fly.io, or any Docker host, injecting `NODE_ENV=production`, `MONGODB_URI`, `REDIS_URL`, `GROQ_API_KEY`, and `GROQ_TEXT_MODEL` as runtime environment variables.

---

## Project Structure

```text
SpendSense/
├── .github/workflows/ci.yml      # GitHub Actions CI (Node 22 tests + Next.js build)
├── Dockerfile.worker             # Production container image for the BullMQ worker
├── docker-compose.yml            # Local Redis + worker Docker Compose stack
├── .env.example                  # Environment variable template
├── src/
│   ├── app/
│   │   ├── (auth)/               # Sign-in and sign-up pages
│   │   ├── (dashboard)/          # Dashboard, expenses, imports, budgets, analytics, recurring, receipt scanner, AI insights, settings
│   │   └── api/                  # Next.js Route Handlers (auth, expenses, budgets, analytics, ai, imports, upload, user)
│   ├── components/               # Reusable UI components (dashboard, expenses, budget, imports, layout, ui)
│   ├── lib/
│   │   ├── imports/              # CSV parser, column mapper, normalizer, merchant extractor, deduplicator, categorizer, import service
│   │   ├── cloudinary.js         # Cloudinary media client
│   │   ├── db.js / mongodb.js    # Mongoose and NextAuth MongoDB connections
│   │   ├── gridfs.js             # MongoDB GridFS staging and cleanup helpers
│   │   ├── groq.js               # Groq SDK client with retries and JSON parsing
│   │   └── queue.js              # BullMQ queue and producer/worker Redis configuration
│   ├── models/                   # Mongoose schemas (User, Expense, Budget, AIInsight, ImportJob, ImportedTransaction, FinancialAccount, MerchantCategoryRule, Category)
│   └── workers/
│       └── importWorker.js       # Standalone BullMQ statement ingestion worker
└── tests/                        # Node.js unit, state-machine, benchmark, and isolated integration tests + CSV fixtures
```

---

## Future Improvements

Planned enhancements not yet implemented in the current release:

- **PDF Bank Statement Ingestion:** Add server-side PDF extraction alongside the current CSV parser.
- **Expense Report Exports:** Implement downloadable CSV and PDF financial reports from the analytics and expenses views.
- **Predictive Spending Forecasting:** Forecast end-of-month category spend based on recurring payments and historical velocity.
- **Conversational Finance Assistant:** Interactive Q&A over a user's categorized spending history.

---

## Author

**Anshuman Mehta** — [GitHub (@Anshuman-utd)](https://github.com/Anshuman-utd)

- **Live Application:** https://spend-sense-pink.vercel.app/
- **Repository:** https://github.com/Anshuman-utd/SpendSense
