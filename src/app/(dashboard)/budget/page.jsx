"use client";

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import CategoryBudgetCard from '@/components/budget/CategoryBudgetCard';
import EditBudgetModal from '@/components/budget/EditBudgetModal';

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Housing', 'Utilities', 'Health', 'Education', 'Personal', 'Other'];

import UserMenu from '@/components/layout/UserMenu';

export default function BudgetPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [budgetData, setBudgetData] = useState(null);
  const [expensesData, setExpensesData] = useState([]);
  // State for Recurring
  const [recurringData, setRecurringData] = useState([]);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingAmount, setEditingAmount] = useState(0);

  const currentDate = new Date();
  const currentMonthName = currentDate.toLocaleString('default', { month: 'long' });
  const currentYear = currentDate.getFullYear();

  const fetchData = async () => {
    try {
        const month = currentDate.getMonth();
        const year = currentDate.getFullYear();
        
        // Fetch Budget Settings
        const budgetRes = await fetch(`/api/budgets?month=${month}&year=${year}`);
        const budgetJson = await budgetRes.json();
        
        // Fetch Actual Expenses for this month (using the API filter we implemented)
        const expenseMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
        const expensesRes = await fetch(`/api/expenses?month=${expenseMonthStr}`);
        const expensesJson = await expensesRes.json();

        // Fetch Recurring Expenses
        const recurringRes = await fetch('/api/expenses/recurring');
        const recurringJson = await recurringRes.json();

        if (budgetRes.ok) setBudgetData(budgetJson);
        if (expensesRes.ok) setExpensesData(expensesJson.data);
        if (recurringRes.ok) setRecurringData(recurringJson.data.subscriptions || []);

    } catch (error) {
        console.error("Failed to fetch budget data", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
        fetchData();
    }
  }, [session]);

  const handleEditBudget = (category, currentAmount) => {
    setEditingCategory(category);
    setEditingAmount(currentAmount);
    setIsModalOpen(true);
  };

  const saveBudget = async (category, amount) => {
    try {
        const res = await fetch('/api/budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                month: currentDate.getMonth(),
                year: currentDate.getFullYear(),
                category,
                amount
            })
        });
        
        if (res.ok) {
            fetchData(); // Refresh data
        }
    } catch (error) {
        console.error("Failed to save budget", error);
    }
  };

  // Calculations
  const totalBudget = budgetData?.totalBudget || 0;
  
  // Calculate spent per category
  const spentByCategory = {};
  CATEGORIES.forEach(cat => spentByCategory[cat] = 0);
  
  let totalSpent = 0;

  // 1. Add actual expenses
  expensesData.forEach(exp => {
      const cat = exp.category;
      if (spentByCategory[cat] !== undefined) {
          spentByCategory[cat] += exp.amount;
      } else {
           // Handle categories not in default list if any
           spentByCategory['Other'] = (spentByCategory['Other'] || 0) + exp.amount;
      }
      totalSpent += exp.amount;
  });

  // 2. Add projected recurring expenses (if active and not already in actual expenses)
  const normalizedExpenses = expensesData.map(e => (e.merchant || e.description || '').toLowerCase().trim());
  
  recurringData.forEach(sub => {
      // Only count active
      if (sub.subscriptionStatus === 'inactive') return;

      // Check if this subscription is already represented in this month's expenses
      const subKey = (sub.merchant || sub.description || '').toLowerCase().trim();
      
      // Simple check: is there an expense with same name?
      // A more robust check might check within a date range, but strict name matching is a decent proxy for now
      // given "active" definition.
      // However, if the user added it manually, it IS in expensesData.
      if (!normalizedExpenses.includes(subKey)) {
           // It's active but not yet paid/recorded this month -> Add projected cost
          const cat = sub.category;
          if (spentByCategory[cat] !== undefined) {
              spentByCategory[cat] += sub.amount;
          } else {
              spentByCategory['Other'] = (spentByCategory['Other'] || 0) + sub.amount;
          }
          totalSpent += sub.amount;
      }
  });

  const remaining = totalBudget - totalSpent;
  const progress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  if (loading) return <div className="p-8 text-white">Loading budget...</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Budget</h1>
      </div>

      {/* Monthly Overview Card */}
      <div className="bg-[#18181b] p-8 rounded-3xl border border-[#27272a] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
          
          <div className="relative z-10">
              <div className="flex justify-between items-start mb-8">
                  <div>
                      <h2 className="text-lg font-semibold text-white mb-1">Monthly Budget Overview</h2>
                      <p className="text-zinc-500">{currentMonthName} {currentYear}</p>
                  </div>
                  <div className="flex gap-8 text-right">
                      <div>
                          <p className="text-xs text-zinc-500 mb-1">Total Budget</p>
                          <p className="text-2xl font-bold text-white">${totalBudget.toFixed(0)}</p>
                      </div>
                      <div>
                          <p className="text-xs text-zinc-500 mb-1">Spent</p>
                          <p className="text-2xl font-bold text-white">${totalSpent.toFixed(0)}</p>
                      </div>
                      <div>
                          <p className="text-xs text-zinc-500 mb-1">Remaining</p>
                          <p className={`text-2xl font-bold ${remaining < 0 ? 'text-red-500' : 'text-emerald-500'}`}>${remaining.toFixed(0)}</p>
                      </div>
                  </div>
              </div>

              {/* Main Progress Bar */}
              <div className="w-full">
                  <div className="flex justify-between text-xs mb-2">
                      <span className="text-zinc-400">Overall Progress</span>
                      <span className="text-white font-bold">{Math.min(progress, 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-3 w-full bg-[#27272a] rounded-full overflow-hidden">
                      <div 
                          className={`h-full rounded-full transition-all duration-700 ${remaining < 0 ? 'bg-red-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(progress, 100)}%` }}
                      ></div>
                  </div>
              </div>
          </div>
      </div>

      {/* Category Grid */}
      <div>
          <h2 className="text-xl font-bold text-white mb-6">Category Budgets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {CATEGORIES.map(category => {
                  const catBudgetObj = budgetData?.data?.categories?.find(c => c.category === category);
                  const catBudget = catBudgetObj ? catBudgetObj.amount : 0;
                  const catSpent = spentByCategory[category] || 0;

                  return (
                      <CategoryBudgetCard 
                          key={category}
                          category={category}
                          budget={catBudget}
                          spent={catSpent}
                          onEdit={handleEditBudget}
                      />
                  );
              })}
          </div>
      </div>

      <EditBudgetModal 
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          category={editingCategory}
          currentAmount={editingAmount}
          onSave={saveBudget}
      />
    </div>
  );
}
