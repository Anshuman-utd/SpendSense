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
- OpenAI GPT-4 (Insights & Budgeting)
- OpenAI Vision API (Receipt Scanning)
- Cloudinary (Receipt Image Storage)

### Authentication
- NextAuth.js
- Google OAuth
- MongoDB Adapter

---

## 🗂️ Project Structure

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


---

## ⚙️ Environment Variables

Create a `.env.local` file and add:

App
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret

Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

Database
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/spensense

OpenAI
OPENAI_API_KEY=your_openai_api_key

Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

yaml
Copy code

⚠️ Do not wrap values in quotes and never commit this file.

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

- Users add expenses manually or upload receipt images through the dashboard.
- Receipt images are securely uploaded to Cloudinary for storage.
- OpenAI Vision API extracts structured data such as amount, category, date, and merchant from receipts.
- Extracted and manually entered expenses are stored in MongoDB using Mongoose models.
- Backend services aggregate expense data including totals, category breakdowns, and spending trends.
- Aggregated summaries are sent to OpenAI GPT models to generate personalized insights, budget recommendations, and financial health summaries.
- AI-generated insights are cached in the database to minimize repeated API calls and optimize usage costs.
- Insights are displayed on the analytics dashboard for user-friendly interpretation.

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
