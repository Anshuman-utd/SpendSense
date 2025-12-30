"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function SpendingTrendChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-500">No data available</div>;
  }

  return (
    <div className="w-full h-full min-h-[300px]">
      <h3 className="text-lg font-semibold text-white mb-4">Spending Trend</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
          <XAxis 
            dataKey="day" 
            stroke="#94a3b8" 
            tick={{fill: '#94a3b8'}}
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            stroke="#94a3b8" 
            tick={{fill: '#94a3b8'}}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip 
             contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', borderColor: '#475569', borderRadius: '12px', color: '#fff' }}
             itemStyle={{ color: '#fff' }}
          />
          <Area 
            type="monotone" 
            dataKey="amount" 
            stroke="#8b5cf6" 
            fillOpacity={1} 
            fill="url(#colorAmount)" 
            strokeWidth={3}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
