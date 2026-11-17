# 💸 SpendSense – AI-Powered Personal Finance Intelligence Platform

SpendSense is a **production-ready, full-stack AI-powered expense tracking and financial analytics platform** designed to help users manage their spending, understand financial habits, and make smarter budgeting decisions through data-driven insights and visual analytics.

---

## 🚀 Features

### 🧠 AI-Powered Features
- **Smart Receipt Scanner**
  - Upload receipt images and automatically extract amount, category, date, and merchant details using AI Vision APIs.
- **AI Spending Insights**
  - Generate weekly/monthly summaries explaining spending patterns, trends, and anomalies.
- **Smart Budget Suggestions**
  - Personalized budget recommendations based on income and historical spending behavior.
- **Financial Health Score**
  - AI-assisted scoring system to evaluate overall financial wellness with improvement tips.

---

### 💼 Core Expense Management
- Add, edit, and delete expenses manually
- Categorize expenses (Food, Transport, Entertainment, etc.)
- Split expenses with friends
- Multi-currency support with automatic conversion

---

### 📊 Visual Analytics Dashboard
- Monthly and yearly spending trends
- Category-wise pie charts
- Budget vs actual spending comparison
- Cash flow analysis (Income vs Expenses)

---

### 🔁 Recurring Expenses & Subscriptions
- Track recurring expenses (rent, subscriptions, utilities)
- Subscription reminders before due dates
- Identify low-value or unused subscriptions

---

### 📤 Reports & Exports
- Export expense data as **PDF** or **CSV**
- Download monthly financial statements

---

### 🔐 Authentication & Security
- Secure authentication using **NextAuth.js**
- Google OAuth integration
- Protected API routes and user-specific data isolation

---

## 🏗️ Tech Stack

### Frontend
- **Next.js 14 (App Router)**
- React
- Tailwind CSS
- Recharts.js
- React Hook Form
- Zustand
- date-fns

### Backend
- Next.js API Routes
- MongoDB
- Mongoose (ODM)

### AI & Integrations
- **Groq AI SDK** (Fast Inference & Multimodal LLMs)
  - `openai/gpt-oss-120b` for structured financial insights and transaction categorization
  - `qwen/qwen3.8-27b` for receipt scanning vision
- Cloudinary (Receipt Image Storage)
- PapaParse (High-performance CSV parsing)
- BullMQ & Redis (Asynchronous background processing)
- MongoDB GridFS (Encrypted statement staging & lifecycle management)

### Authentication
- NextAuth.js
- Google OAuth
- MongoDB Adapter

---

## 🗂️ Project Structure

```bash

src/
├── app/
│   ├── (auth)/
│   │   └── auth/
│   ├── (dashboard)/
│   │   ├── ai-insights/
│   │   ├── analytics/
│   │   ├── budget/
│   │   ├── dashboard/
│   │   ├── expenses/
│   │   ├── recurring/
│   │   ├── scan-receipt/
│   │   ├── settings/
│   │   └── layout.jsx
│   ├── api/
│   │   ├── ai/
│   │   ├── analytics/
│   │   ├── auth/
│   │   ├── budgets/
│   │   ├── expenses/
│   │   ├── upload/
│   │   └── user/
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.js
│   └── page.jsx
├── components/
│   ├── budget/
│   │   ├── CategoryBudgetCard.jsx
│   │   └── EditBudgetModal.jsx
│   ├── dashboard/
│   │   ├── CategoryPieChart.jsx
│   │   └── SpendingTrendChart.jsx
│   ├── expenses/
│   │   ├── AddExpenseModal.jsx
│   │   └── ExpenseForm.jsx
│   ├── layout/
│   │   ├── Footer.jsx
│   │   ├── Navbar.jsx
│   │   ├── Sidebar.jsx
│   │   └── UserMenu.jsx
│   ├── providers/
│   │   └── AuthProvider.jsx
│   └── ui/
│       ├── CategoryIcon.jsx
│       └── MiniCalendar.jsx
├── lib/
│   ├── cloudinary.js
│   ├── db.js
│   └── mongodb.js
└── models/
    ├── AIInsight.js
    ├── Budget.js
    ├── Category.js
    ├── Expense.js
    └── User.js

```
---

## ⚙️ Environment Variables

```bash

Create a `.env.local` file and add:

App
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret

Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

Database
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/spensense

Google Gemini
GOOGLE_API_KEY=your_google_gemini_api_key

Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

yaml
Copy code

⚠️ Do not wrap values in quotes and never commit this file.

``` 

---

## 🛠️ Installation & Setup

```bash
# Clone repository
git clone https://github.com/your-username/spensense.git

# Navigate into project
cd spensense

# Install dependencies
npm install

# Start development server
npm run dev
Open http://localhost:3000 in your browser.
```


## 🧠 AI Architecture (High-Level)

- All generative AI capabilities across SpendSense are powered by **Groq AI SDK** using high-throughput open-weights models.
- **AI Receipt Scanning:** Uses `qwen/qwen3.8-27b` multimodal vision model to accurately parse merchant, total amount, transaction date, and items from receipt images.
- **AI Spending Insights & Budgets:** Uses `openai/gpt-oss-120b` with structured JSON output enforcement to evaluate 30-day spending trends and deliver personalized, actionable savings tips.
- **Transaction Categorization:** Employs a 3-level categorization pipeline where Groq assists in categorizing ambiguous bank statement narrations when deterministic rules do not yield high confidence.
- Sensitive financial data (such as account numbers or PII) is stripped prior to calling LLM APIs, and API keys are strictly kept server-side.

---

## ⚡ Smart Transaction Ingestion Engine

The **Smart Transaction Ingestion Engine** allows authenticated SpendSense users to upload bank statements in CSV format and automatically convert their financial transaction records into structured, categorized expenses.

### Architecture Overview

```mermaid
flowchart TD
    User([User in Browser]) -->|Upload Statement CSV| UploadAPI["POST /api/imports/upload"]
    UploadAPI -->|Store Raw File| GridFS[(MongoDB GridFS)]
    UploadAPI -->|Create Job| ImportJob[(ImportJob Doc)]
    UploadAPI -->|Enqueue Job| BullMQ[BullMQ Import Queue]
    
    subgraph BackgroundWorker [Persistent Node.js Worker / Docker]
        BullMQ -->|Populate Job| Worker[src/workers/importWorker.js]
        Worker -->|1. Parse CSV| CSVParser[PapaParse Parser]
        Worker -->|2. Detect Columns| ColMapper[Column Mapper]
        Worker -->|3. Normalize Dates & Amounts| Normalizer[Transaction Normalizer]
        Worker -->|4. Extract Merchants| MerchantExt[Merchant Extractor]
        Worker -->|5. Detect Duplicates| DupDetector[Duplicate Detector]
        Worker -->|6. 3-Level Categorization| Categorizer[Transaction Categorizer]
        Categorizer -->|Level 1| UserRules[(MerchantCategoryRules)]
        Categorizer -->|Level 2| DeterministicRules[Pattern Dictionary]
        Categorizer -->|Level 3 Fallback| GroqAI[Groq AI openai/gpt-oss-120b]
        Worker -->|Store Staged Rows| ImportedTxn[(ImportedTransactions)]
        Worker -->|Update Status| ReadyStatus["status: ready_for_review"]
    end
    
    ReadyStatus -->|Notify User| ReviewUI["/imports Interactive Review Table"]
    ReviewUI -->|User Customizes & Confirms| ConfirmAPI["POST /api/imports/:id/confirm"]
    ConfirmAPI -->|Idempotent Write| ExpenseDocs[(Expense Records)]
    ConfirmAPI -->|Cleanup Staged File| GridFSCleanup[Delete from GridFS]
    ExpenseDocs -->|Immediate Visibility| Dashboards["Dashboard, Expenses & Analytics"]
```

### Key Capabilities

1. **Flexible CSV Header Mapping:**
   - Detects standard column formats automatically (e.g. HDFC, SBI, ICICI, Axis, generic statements).
   - Supports manual mapping UI if column detection is ambiguous.
   - Robust date parser supporting `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY`, and month names.
   - Strict decimal parser using integer minor units (paise/cents) to avoid floating-point drift.

2. **Accurate Financial Classification:**
   - **Debits vs Credits:** Separate debit and credit columns or signed amounts are cleanly distinguished.
   - **Income:** Salary and deposits are tagged as Income and excluded from spending expenses.
   - **Refunds:** Reversals and cashbacks are tagged as Refunds and excluded from regular spending.
   - **Transfers:** Self/linked account transfers are marked as Transfers and excluded from expense totals.

3. **Multi-Tier Duplicate Detection:**
   - **File-level:** SHA-256 cryptographic checksums prevent re-importing the same file.
   - **Strong Identity:** Stable bank transaction reference numbers (UTR/Cheque) match against previous imports.
   - **Fallback Fingerprinting:** Hashes `date + amount + direction + merchant`.
   - **Manual Review:** Suspected duplicates are flagged and deselected by default, letting the user verify them.

4. **Personalized 3-Level Categorization Pipeline:**
   - **Level 1 (User Mappings):** Reuses categories previously assigned by the user to specific merchants.
   - **Level 2 (Deterministic Rules):** Fast regex dictionary for popular merchants (Swiggy, Uber, Netflix, Amazon, etc.).
   - **Level 3 (Groq AI Fallback):** Calls `openai/gpt-oss-120b` for ambiguous transactions, sanitizing PII before calling.

5. **Asynchronous BullMQ & Redis Worker:**
   - Runs as an independent, persistent Node.js worker process (`npm run worker`), decoupled from Vercel serverless request limits.
   - Seamless inline fallback for zero-setup local development when Redis is not running.
   - Docker Compose provided for running Redis in one command.

6. **Secure GridFS Staging & Automatic Cleanup:**
   - Raw statements are staged in MongoDB GridFS instead of swelling MongoDB document sizes.
   - Staged statement files are automatically purged from GridFS upon successful import confirmation.

---

## 🚀 Running the Ingestion Engine Locally

### 1. Prerequisites
- Node.js 18+ (tested on Node.js 22)
- MongoDB instance (MongoDB Atlas or local)
- Docker (optional, for Redis)

### 2. Start Redis (Optional for local queue)
```bash
docker compose up -d redis
```

### 3. Start the Background Worker
```bash
npm run worker
```

### 4. Start Next.js Development Server
```bash
npm run dev
```

### 5. Run Automated Tests
```bash
npm test
```

---

## 📋 Required Environment Variables

Add these to your `.env.local` or production environment:

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://...` |
| `NEXTAUTH_SECRET` | NextAuth JWT signing secret | `random_base64_string` |
| `NEXTAUTH_URL` | Base application URL | `http://localhost:3000` |
| `GROQ_API_KEY` | Groq AI API Key | `gsk_...` |
| `GROQ_TEXT_MODEL` | Groq text & structured output model | `openai/gpt-oss-120b` |
| `GROQ_VISION_MODEL` | Groq vision model for receipts | `qwen/qwen3.8-27b` |
| `REDIS_URL` | Redis URL for BullMQ worker | `redis://localhost:6379` |
| `CLOUDINARY_*` | Cloudinary credentials for images | Cloud name, API key, Secret |

---

## 🚢 Vercel + Railway Production Deployment Guide

SpendSense uses a decoupled architecture designed for high availability and zero dropped jobs:
- **Vercel:** Hosts the Next.js frontend and App Router API endpoints (Serverless). Producers enqueue statement parsing and confirmation jobs to Redis with bounded timeouts (`connectTimeout: 5000ms`, `maxRetriesPerRequest: 1`) so serverless functions never hang.
- **Railway:** Hosts the long-running BullMQ background worker (`src/workers/importWorker.js` via `Dockerfile.worker`). Workers maintain persistent connections with exponential reconnection backoff and `maxRetriesPerRequest: null`.
- **Redis (Upstash / Railway / Redis Cloud):** Serves as the central job queue broker (`statement-import-queue`) bridging Vercel and Railway with full TLS (`rediss://`) support.
- **MongoDB Atlas:** Houses application documents, user accounts, and stages raw statement files in MongoDB GridFS with automatic post-import cleanup.

### 1. Vercel Environment Variables (Web Application)

Configure these in **Vercel Project Settings → Environment Variables**:

| Variable | Required | Description | Example |
|---|---|---|---|
| `NODE_ENV` | Yes | Application environment | `production` |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net/?appName=SpendSense` |
| `NEXTAUTH_URL` | Yes | Production URL | `https://spendsense.vercel.app` |
| `NEXTAUTH_SECRET` | Yes | Cryptographic JWT secret | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID | `...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret | `GOCSPX-...` |
| `GROQ_API_KEY` | Yes | Groq AI API key | `gsk_...` |
| `GROQ_TEXT_MODEL` | Yes | Text & transaction model | `openai/gpt-oss-120b` |
| `GROQ_VISION_MODEL` | Yes | Receipt scanner model | `qwen/qwen3.8-27b` |
| `REDIS_URL` | Yes | Production Redis URL (with TLS) | `rediss://default:password@host:port` |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary asset cloud name | `your_cloud_name` |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key | `1234567890` |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret | `your_api_secret` |

*Note: In production (`NODE_ENV=production`), synchronous import overrides (`?sync=true`, `SYNC_PROCESSING`) are strictly disabled. All imports are routed through BullMQ.*

---

### 2. Railway Environment Variables (Background Worker)

Configure these in **Railway Service → Variables** (no physical `.env` file needed):

| Variable | Required | Description | Example |
|---|---|---|---|
| `NODE_ENV` | Yes | Runtime environment | `production` |
| `REDIS_URL` | Yes | Shared Redis URL (matching Vercel) | `rediss://default:password@host:port` |
| `MONGODB_URI` | Yes | Shared MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net/?appName=SpendSense` |
| `GROQ_API_KEY` | Yes | Groq AI API key | `gsk_...` |
| `GROQ_TEXT_MODEL` | Yes | Groq text model | `openai/gpt-oss-120b` |

---

### 3. Redis Endpoint Requirements for Both Services

- **Unified Queue Endpoint:** Both Vercel and Railway must point to the exact same `REDIS_URL` so that jobs enqueued by Vercel are consumed by the Railway worker.
- **TLS Security (`rediss://`):**
  - If using Upstash or external cloud Redis, the connection string protocol must be `rediss://`.
  - SpendSense's Redis connection manager (`src/lib/queue.js` and `src/workers/importWorker.js`) automatically detects `rediss://` and attaches `{ tls: { rejectUnauthorized: false } }`.
- **Sanitized Logging:** Redis URLs containing embedded passwords (`redis://user:pass@host`) are automatically redacted in worker logs to prevent credential leakage.

---

### 4. Railway Build & Start Settings

#### Option A: Dockerfile Deployment (Recommended)
1. In your Railway service settings, set **Dockerfile Path** to: `Dockerfile.worker`
2. Set **Context** to: `/`
3. Railway will build the lightweight image based on `node:22-alpine` using `.dockerignore` (which strictly excludes credentials and `.env` files).
4. CMD is pre-configured to: `["node", "src/workers/importWorker.js"]`.

#### Option B: Nixpacks / Node Buildpack
1. **Build Command:** `npm ci --omit=dev`
2. **Start Command:** `node src/workers/importWorker.js` (or `npm run worker`)

---

### 5. Deployment Verification Procedure

1. **Verify Redis Connectivity:**
   Ensure your Redis instance is reachable and accepts TLS connections.
2. **Verify Worker Startup on Railway:**
   Inspect the Railway deployment logs. You should observe:
   ```text
   --------------------------------------------------
    SpendSense — Smart Statement Ingestion Worker
   --------------------------------------------------
   [Worker] Connecting to Redis at: rediss://***:***@host:port
   [Worker] Connected to Redis successfully.
   [Worker] Connected to MongoDB database.
   [Worker] Worker is active and listening on queue "statement-import-queue".
   ```
3. **Verify Vercel Web Deployment:**
   - Navigate to your deployed application (`https://your-domain.vercel.app/imports`).
   - Upload a sample CSV statement (`tests/fixtures/sample_statement.csv`).
   - Observe the live polling progress: `Reading statement` → `Parsing` → `Categorizing` → `Ready for review`.
   - Railway worker logs will output:
     ```text
     [Worker] Starting job "process-import" (ID: process-<jobId>)
     [Worker] Job "process-import" (ID: process-<jobId>) completed successfully.
     ```
   - Customize classifications or categories in the review table and click **Confirm & Import**.
   - Observe the confirmation lifecycle: `confirmation_queued` → `importing` → `completed`.
   - Verify that transactions immediately appear in the **Expenses** table and analytics charts.

---

## 🚢 Deployment & Architecture Guidance

### 1. Web Application (Next.js & API Handlers)
- Deploy to **Vercel** or any containerized Node.js host.
- Environment variables: `MONGODB_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GROQ_API_KEY`, `GROQ_TEXT_MODEL`, `GROQ_VISION_MODEL`, `REDIS_URL`.
- During production on Vercel, requests are queued via BullMQ to Redis. No background workers run inside Vercel serverless functions, guaranteeing stability and zero premature process terminates.
- If Redis is temporarily unreachable, the API returns a structured `503 Service Unavailable` response rather than failing silently.
- In local development or testing without Redis, set `SYNC_PROCESSING=true` in `.env` to execute imports synchronously.

### 2. Statement Ingestion Worker (BullMQ + Redis)
- Deploy as a **Persistent Background Worker** on **Railway**, **Render**, **Fly.io**, or **Docker Compose**.
- Startup Command: `npm run worker` (or use the provided `Dockerfile.worker`).
- Required Environment Variables: `MONGODB_URI`, `REDIS_URL`, `GROQ_API_KEY`, `GROQ_TEXT_MODEL`.
- Concurrency: Defaults to 2 concurrent statement jobs with graceful `SIGTERM`/`SIGINT` handling and bounded retries (3 attempts with exponential backoff).

### 3. Redis Managed Instance
- Deploy via **Upstash Redis** (with TLS support) or managed Redis on Railway / AWS ElastiCache.
- Set `REDIS_URL=rediss://default:password@host:port` in both Next.js and the worker environment.

---

## ⚠️ Known Limitations
- Supported statement format is CSV. PDF parsing requires a dedicated server-side rendering library (e.g. `pdf-parse`) and is planned for a future release.
- Maximum statement size is 5 MB or 10,000 rows per file.

---

## 🚀 Deployment

- **Frontend & Backend:** Deployed on Vercel using Next.js App Router.
- **Database:** MongoDB Atlas for cloud-hosted data storage.
- **Media Storage:** Cloudinary for receipt image storage.
- **Authentication:** Google OAuth via NextAuth.js.
- **Environment Variables:** Managed through `.env.local` for development and Vercel Dashboard for production.

---

## 📌 Key Highlights

- AI-powered receipt scanning and automated expense extraction
- Personalized spending insights and smart budget recommendations
- Interactive dashboards with charts and financial analytics
- Secure authentication with user-specific data isolation
- Optimized AI usage through controlled triggers and caching
- Scalable and production-ready full-stack architecture

---

## 📄 License

This project is developed for educational and personal portfolio purposes.  
You are free to use, modify, and extend the codebase for learning and non-commercial use.

---

## ✨ Author

**Anshuman Mehta**  
Full-Stack Developer | AI Enthusiast  

If you found this project useful, consider starring ⭐ the repository.
