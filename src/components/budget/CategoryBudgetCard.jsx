"use client";

import { PencilIcon } from '@heroicons/react/24/outline';
import CategoryIcon from '@/components/ui/CategoryIcon';

export default function CategoryBudgetCard({ category, spent, budget, onEdit }) {
  const progress = budget > 0 ? (spent / budget) * 100 : 0;
  const isOverBudget = spent > budget && budget > 0;
  
  // Color Logic
  let progressColor = 'bg-emerald-500';
  let statusColor = 'text-emerald-500';
  
  if (isOverBudget) {
      progressColor = 'bg-red-500';
      statusColor = 'text-red-500';
  } else if (progress > 80) {
      progressColor = 'bg-yellow-500';
      statusColor = 'text-yellow-500';
  } else if (budget === 0 && spent > 0) {
      // No budget set but spending happened
      progressColor = 'bg-zinc-600';
      statusColor = 'text-zinc-400';
  }

  return (
    <div className="bg-[#18181b] p-5 rounded-2xl border border-[#27272a] relative group">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
            <CategoryIcon category={category} />
            <div>
                <h3 className="font-semibold text-white">{category}</h3>
                <p className="text-xs text-zinc-500">
                    <span className={isOverBudget ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>${spent.toFixed(0)}</span> of ${budget.toFixed(0)}
                </p>
            </div>
        </div>
        <button 
            onClick={() => onEdit(category, budget)}
            className="p-2 rounded-lg hover:bg-[#27272a] text-zinc-500 hover:text-white transition-colors"
        >
            <PencilIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="h-2 w-full bg-[#27272a] rounded-full overflow-hidden mb-2">
        <div 
            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
            style={{ width: `${Math.min(progress, 100)}%` }}
        ></div>
      </div>
      
      <div className="flex justify-between items-center text-xs">
          <span className={statusColor}>
              {isOverBudget ? `$${(spent - budget).toFixed(0)} over budget` : `$${(budget - spent).toFixed(0)} remaining`}
          </span>
          <span className="text-zinc-500">{progress.toFixed(0)}%</span>
      </div>
    </div>
  );
}
