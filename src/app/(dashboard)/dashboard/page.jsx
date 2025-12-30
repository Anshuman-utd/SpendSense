"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { 
  MagnifyingGlassIcon, 
  BellIcon, 
  UserCircleIcon,
  WalletIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CalendarIcon,
  PlusIcon,
  CameraIcon,
  DocumentChartBarIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";
import Link from 'next/link';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AddExpenseModal from '@/components/expenses/AddExpenseModal';

export default function Dashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState({ 
    total: 0, 
    lastMonthTotal: 0,
    byCategory: [], 
    dailyTrend: [], 
    upcomingRecurring: [],
    lastMonthCount: 0
  });
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
     try {
       const [analyticsRes, expensesRes] = await Promise.all([
         fetch('/api/analytics'),
         fetch('/api/expenses?limit=5')
       ]);
       
       const analyticsData = await analyticsRes.json();
       const expensesData = await expensesRes.json();

       if (analyticsData.success) setStats(analyticsData.data);
       if (expensesData.success) setRecentExpenses(expensesData.data);
     } catch (error) {
       console.error("Failed to fetch dashboard data", error);
     } finally {
       setLoading(false);
     }
  }

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  const budgetRemaining = (session?.user?.monthlyBudget || 0) - stats.total;
  const budgetProgress = session?.user?.monthlyBudget ? (stats.total / session.user.monthlyBudget) * 100 : 0;
  
  // Prepare chart data (ensure it has data for the whole week/month view if possible, or just what we have)
  const chartData = stats.dailyTrend.map(d => ({ day: d.day, amount: d.amount }));

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-4">
           <div className="relative">
             <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
             <input 
               type="text" 
               placeholder="Search expenses..." 
               className="bg-[#18181b] border border-[#27272a] rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-emerald-500 w-64 text-zinc-300"
             />
           </div>
           <div className="flex items-center gap-3 pl-4 border-l border-[#27272a]">
             {session?.user?.image ? (
                <img src={session.user.image} alt="Profile" className="w-9 h-9 rounded-full ring-2 ring-[#27272a]" />
             ) : (
                <UserCircleIcon className="w-9 h-9 text-zinc-400" />
             )}
           </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Spent */}
        <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
           <div className="flex justify-between items-start mb-4">
             <div>
               <p className="text-zinc-500 text-sm font-medium mb-1">Total Spent</p>
               <h3 className="text-3xl font-bold">${stats.total.toFixed(2)}</h3>
             </div>
             <div className="p-3 bg-emerald-500/10 rounded-xl">
               <WalletIcon className="w-6 h-6 text-emerald-500" />
             </div>
           </div>
           <div className="flex items-center gap-2 text-xs">
             <span className="text-emerald-500 flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-0.5 rounded">
               <ArrowTrendingUpIcon className="w-3 h-3" /> +12.5%
             </span>
             <span className="text-zinc-500">from last month</span>
           </div>
        </div>

        {/* Budget Remaining */}
        <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
           <div className="flex justify-between items-start mb-4">
             <div>
               <p className="text-zinc-500 text-sm font-medium mb-1">Budget Remaining</p>
               <h3 className="text-3xl font-bold">${budgetRemaining.toFixed(2)}</h3>
             </div>
             <div className="p-3 bg-blue-500/10 rounded-xl">
               <ArrowTrendingDownIcon className="w-6 h-6 text-blue-500" />
             </div>
           </div>
           <div className="flex items-center gap-2 text-xs">
             <span className="text-blue-500 flex items-center gap-1 font-medium bg-blue-500/10 px-2 py-0.5 rounded">
               {(100 - budgetProgress).toFixed(1)}%
             </span>
             <span className="text-zinc-500">of budget left</span>
           </div>
        </div>

        {/* This Month (vs data) */}
        <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
           <div className="flex justify-between items-start mb-4">
             <div>
               <p className="text-zinc-500 text-sm font-medium mb-1">This Month</p>
               <h3 className="text-3xl font-bold">${stats.total.toFixed(2)}</h3>
             </div>
             <div className="p-3 bg-purple-500/10 rounded-xl">
               <CalendarIcon className="w-6 h-6 text-purple-500" />
             </div>
           </div>
           <p className="text-xs text-zinc-500">
             Same as Total for monthly view
           </p>
        </div>

        {/* Last Month */}
        <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
           <div className="flex justify-between items-start mb-4">
             <div>
               <p className="text-zinc-500 text-sm font-medium mb-1">Last Month</p>
               <h3 className="text-3xl font-bold">${stats.lastMonthTotal.toFixed(2)}</h3>
             </div>
             <div className="p-3 bg-zinc-800 rounded-xl">
               <ArrowTrendingUpIcon className="w-6 h-6 text-zinc-400" />
             </div>
           </div>
           <p className="text-xs text-zinc-500">{stats.lastMonthCount} transactions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart Section */}
        <div className="lg:col-span-2 space-y-8">
           {/* Spending Trends Chart */}
           <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
             <div className="flex justify-between items-center mb-6">
               <h3 className="font-semibold text-lg">Spending Trends</h3>
               <select className="bg-[#27272a] text-xs text-zinc-400 border border-[#3f3f46] rounded-lg px-3 py-1.5 focus:outline-none">
                 <option>This Month</option>
                 <option>Last Month</option>
               </select>
             </div>
             <div className="h-64 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={chartData}>
                   <defs>
                     <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                       <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                   <XAxis dataKey="day" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                   <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                   <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }}
                      itemStyle={{ color: '#10b981' }}
                   />
                   <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                 </AreaChart>
               </ResponsiveContainer>
             </div>
           </div>

           {/* Recent Transactions */}
           <div className="space-y-4">
             <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">Recent Transactions</h3>
                <Link href="/expenses" className="text-sm text-emerald-500 hover:text-emerald-400 flex items-center gap-1 font-medium">
                  View All <ArrowTrendingUpIcon className="w-3 h-3 rotate-45" />
                </Link>
             </div>
             
             <div className="space-y-3">
               {recentExpenses.map((expense) => (
                 <div key={expense._id} className="bg-[#18181b] p-4 rounded-xl border border-[#27272a] flex justify-between items-center hover:bg-[#27272a] transition-colors group">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-colors">
                       <WalletIcon className="w-5 h-5" /> 
                       {/* Ideally map category icons here */}
                     </div>
                     <div>
                       <p className="font-semibold text-sm">{expense.description}</p>
                       <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                             {expense.category}
                          </span>
                          <span className="text-xs text-zinc-500">
                             {new Date(expense.date).toLocaleDateString()}
                          </span>
                       </div>
                     </div>
                   </div>
                   <span className="font-bold text-white">-${expense.amount.toFixed(2)}</span>
                 </div>
               ))}
               
               {recentExpenses.length === 0 && (
                 <div className="text-center py-8 text-zinc-500 text-sm">No recent transactions</div>
               )}
             </div>
           </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-6">
          <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
             <h3 className="font-semibold mb-4">Quick Actions</h3>
             <div className="space-y-3">
               <button onClick={() => setIsModalOpen(true)} className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 rounded-xl transition-all">
                  <PlusIcon className="w-5 h-5" /> Add Expense
               </button>
               <Link href="/scan-receipt" className="w-full flex items-center justify-center gap-2 bg-[#27272a] hover:bg-[#3f3f46] text-white font-medium py-3 rounded-xl transition-all border border-[#3f3f46]">
                  <CameraIcon className="w-5 h-5" /> Scan Receipt
               </Link>
               <Link href="/reports" className="w-full flex items-center justify-center gap-2 bg-[#27272a] hover:bg-[#3f3f46] text-white font-medium py-3 rounded-xl transition-all border border-[#3f3f46]">
                  <DocumentChartBarIcon className="w-5 h-5" /> View Reports
               </Link>
             </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-6 rounded-2xl border border-indigo-500/20 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-20">
               <SparklesIcon className="w-24 h-24 text-indigo-500" />
             </div>
             <div className="relative z-10">
               <div className="flex items-center gap-2 text-indigo-400 font-bold mb-2">
                 <SparklesIcon className="w-5 h-5" /> AI Insight
               </div>
               <p className="text-sm text-zinc-300 mb-4 leading-relaxed">
                 You re spending 23% more on food this month. Consider meal prepping to save ~$120.
               </p>
               <Link href="/reports" className="text-xs bg-indigo-500/20 text-indigo-300 px-3 py-2 rounded-lg hover:bg-indigo-500/30 transition-colors inline-block font-medium">
                 View All Insights →
               </Link>
             </div>
          </div>
        </div>
      </div>
      <AddExpenseModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onExpenseAdded={fetchData}
      />
    </div>
  );
}
