"use client";

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import { ArrowDownIcon, ArrowUpIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

export default function AnalyticsPage() {
  const { data: session } = useSession();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('this-month'); // 'this-month', 'last-month'

  useEffect(() => {
    async function fetchData() {
      if (!session) return;
      try {
        const now = new Date();
        let queryYear = now.getFullYear();
        let queryMonth = now.getMonth();

        if (timeRange === 'last-month') {
           const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
           queryYear = lastMonthDate.getFullYear();
           queryMonth = lastMonthDate.getMonth();
        }

        const res = await fetch(`/api/analytics?month=${queryMonth}&year=${queryYear}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        } else {
             console.error("Analytics fetch failed:", json.error);
        }
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [timeRange, session]);

  if (loading) return <div className="p-8 text-white">Loading analytics...</div>;
  if (!data) return <div className="p-8 text-white">Failed to load data</div>;

  // Process Daily Trend Data for Area Chart
  const trendData = data.dailyTrend.map(item => ({
      name: `Day ${item.day}`,
      amount: item.amount
  }));

  // Process Weekly Comparison
  // Group days into 4 weeks
  const weeklyData = [
      { name: 'Week 1', selectedPeriod: 0, previousPeriod: data.lastMonthTotal / 4 }, 
      { name: 'Week 2', selectedPeriod: 0, previousPeriod: data.lastMonthTotal / 4 },
      { name: 'Week 3', selectedPeriod: 0, previousPeriod: data.lastMonthTotal / 4 },
      { name: 'Week 4', selectedPeriod: 0, previousPeriod: data.lastMonthTotal / 4 },
  ];

  data.dailyTrend.forEach(item => {
      const day = item.day;
      if (day <= 7) weeklyData[0].selectedPeriod += item.amount;
      else if (day <= 14) weeklyData[1].selectedPeriod += item.amount;
      else if (day <= 21) weeklyData[2].selectedPeriod += item.amount;
      else weeklyData[3].selectedPeriod += item.amount;
  });

  // Calculate Category Breakdowns
  const categoryBreakdown = data.byCategory.map((cat, index) => {
      const lastMonthCat = data.lastMonthByCategory?.find(c => c.name === cat.name);
      const lastVal = lastMonthCat ? lastMonthCat.value : 0;
      const change = lastVal === 0 ? 100 : ((cat.value - lastVal) / lastVal) * 100;
      
      return {
          ...cat,
          color: COLORS[index % COLORS.length],
          change: change,
          percentage: (cat.value / data.total) * 100
      };
  }).sort((a,b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Analytics</h1>
        <div className="flex gap-4">
             {/* Time Range Toggles */}
             <div className="bg-[#18181b] p-1 rounded-xl border border-[#27272a] flex">
                <button 
                    onClick={() => setTimeRange('this-month')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${timeRange === 'this-month' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'}`}
                >
                    This Month
                </button>
                <button 
                    onClick={() => setTimeRange('last-month')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${timeRange === 'last-month' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'}`}
                >
                    Last Month
                </button>
             </div>
             <button className="flex items-center gap-2 px-4 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-sm font-medium text-white hover:bg-[#27272a] transition-colors">
                <ArrowTopRightOnSquareIcon className="w-4 h-4" /> Export Report
             </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending Trends */}
        <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
            <h3 className="text-lg font-bold text-white mb-6">Spending Trends</h3>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                        <defs>
                            <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis dataKey="name" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#fff' }}
                            itemStyle={{ color: '#10b981' }}
                        />
                        <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorTrend)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Spending by Category */}
        <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
            <h3 className="text-lg font-bold text-white mb-6">Spending by Category</h3>
            <div className="flex items-center justify-between">
                <div className="h-[300px] w-1/2">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={categoryBreakdown}
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {categoryBreakdown.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="w-1/2 space-y-3 pl-4">
                    {categoryBreakdown.slice(0, 5).map((cat, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></span>
                                <span className="text-zinc-300">{cat.name}</span>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-white">${cat.value.toFixed(0)}</p>
                                <p className="text-xs text-zinc-500">{cat.percentage.toFixed(0)}%</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Comparison */}
        <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
             <h3 className="text-lg font-bold text-white mb-6">Monthly Comparison</h3>
             <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyData} barGap={8}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis dataKey="name" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                        <Tooltip 
                            cursor={{ fill: '#27272a' }}
                            contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#fff' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Bar dataKey="selectedPeriod" name={timeRange === 'this-month' ? "This Month" : "Selected Month"} fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="previousPeriod" name={timeRange === 'this-month' ? "Last Month (Avg)" : "Previous Month (Avg)"} fill="#3f3f46" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
             </div>
        </div>

        {/* Top Merchants */}
        <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
             <h3 className="text-lg font-bold text-white mb-6">Top Merchants</h3>
             <div className="space-y-4">
                 {data.topMerchants.map((merchant, index) => (
                     <div key={index} className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                                 {index + 1}
                             </div>
                             <div>
                                 <p className="font-medium text-white">{merchant.merchant}</p>
                                 <p className="text-xs text-zinc-500">{merchant.count} transactions</p>
                             </div>
                         </div>
                         <span className="font-bold text-white">${merchant.amount.toFixed(2)}</span>
                     </div>
                 ))}
                 {data.topMerchants.length === 0 && <p className="text-zinc-500 text-sm">No merchant data available.</p>}
             </div>
        </div>

        {/* Category Breakdown Progress */}
        <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a] lg:col-span-1">
             <h3 className="text-lg font-bold text-white mb-6">Category Breakdown</h3>
             <div className="space-y-6">
                 {categoryBreakdown.slice(0, 4).map((cat, index) => (
                     <div key={index}>
                         <div className="flex justify-between items-center mb-2 text-sm">
                             <span className="text-zinc-300">{cat.name}</span>
                             <span className="font-bold text-white">${cat.value.toFixed(0)}</span>
                         </div>
                         <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                             <div 
                                style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }} 
                                className="h-full rounded-full"
                             ></div>
                         </div>
                         <div className="flex items-center gap-1 mt-1 text-xs">
                             {cat.change > 0 ? (
                                 <ArrowUpIcon className="w-3 h-3 text-red-500" />
                             ) : (
                                 <ArrowDownIcon className="w-3 h-3 text-emerald-500" />
                             )}
                             <span className={cat.change > 0 ? "text-red-500" : "text-emerald-500"}>
                                 {Math.abs(cat.change).toFixed(1)}%
                             </span>
                              <span className="text-zinc-500">vs previous month</span>
                         </div>
                     </div>
                 ))}
             </div>
        </div>
      </div>
    </div>
  );
}
