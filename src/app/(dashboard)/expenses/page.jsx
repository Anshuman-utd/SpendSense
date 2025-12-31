"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { MagnifyingGlassIcon, FunnelIcon, CalendarIcon, Squares2X2Icon, ListBulletIcon } from '@heroicons/react/24/outline';
import AddExpenseModal from '@/components/expenses/AddExpenseModal';
import MiniCalendar from '@/components/ui/MiniCalendar';
import CategoryIcon, { getCategoryStyle } from '@/components/ui/CategoryIcon';

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Housing', 'Utilities', 'Health', 'Education', 'Personal', 'Other'];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarRef = useRef(null);

  // Close calendar when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/expenses');
      const data = await res.json();
      if (data.success) {
        setExpenses(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch expenses', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  // Filter Logic
  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
        const matchesSearch = 
            expense.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
            expense.merchant?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            expense.amount.toString().includes(searchQuery);
        
        const matchesCategory = selectedCategory ? expense.category === selectedCategory : true;
        
        const matchesDate = selectedDate ? new Date(expense.date).toISOString().split('T')[0] === selectedDate.toISOString().split('T')[0] : true;

        return matchesSearch && matchesCategory && matchesDate;
    });
  }, [expenses, searchQuery, selectedCategory, selectedDate]);

  if (loading) return <div className="text-white p-8">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Expenses</h1>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#18181b] p-4 rounded-2xl border border-[#27272a] flex flex-wrap gap-4 justify-between items-center">
        <div className="flex-1 min-w-[200px] relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search expenses..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#09090b] border border-[#27272a] rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
        </div>
        <div className="flex items-center gap-3">
            {/* Category Filter */}
            <div className="relative">
                <select 
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="appearance-none pl-10 pr-8 py-2.5 bg-[#09090b] border border-[#27272a] rounded-xl text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                    <option value="">All Categories</option>
                    {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
                <FunnelIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>

            {/* Date Filter with Mini Calendar Popover */}
            <div className="relative" ref={calendarRef}>
                <button 
                  onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                  className="flex items-center gap-2 pl-4 pr-4 py-2.5 bg-[#09090b] border border-[#27272a] rounded-xl text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors focus:outline-none focus:border-emerald-500 w-[140px] justify-between"
                >
                    <span className="truncate">{selectedDate ? selectedDate.toLocaleDateString() : 'dd/mm/yyyy'}</span>
                    <CalendarIcon className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                </button>
                {isCalendarOpen && (
                   <MiniCalendar 
                      selectedDate={selectedDate}
                      onSelect={(date) => {
                          setSelectedDate(date);
                          setIsCalendarOpen(false);
                      }}
                      onClose={() => setIsCalendarOpen(false)}
                   />
                )}
            </div>
            
            <div className="flex bg-[#09090b] rounded-xl border border-[#27272a] p-1">
                <button 
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'}`}
                >
                    <ListBulletIcon className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'}`}
                >
                    <Squares2X2Icon className="w-5 h-5" />
                </button>
            </div>
        </div>
      </div>

      <div className="flex justify-between items-center text-sm text-zinc-400">
          <p>Showing {filteredExpenses.length} expenses</p>
          <p>Total: <span className="text-white font-medium">${filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)}</span></p>
      </div>

      {/* Expenses List / Grid */}
      <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-3"}>
        {filteredExpenses.map((expense) => (
          <div key={expense._id} className={`group bg-[#18181b] rounded-2xl border border-[#27272a] hover:border-zinc-600 transition-all ${viewMode === 'list' ? 'p-5 flex items-center justify-between' : 'p-6 flex flex-col justify-between h-full relative overflow-hidden'}`}>
             
             {viewMode === 'list' ? (
                 // List View Layout
                 <>
                    <div className="flex items-center gap-5">
                        <CategoryIcon category={expense.category} />
                        <div>
                            <h3 className="font-bold text-white text-lg">{expense.merchant || expense.description}</h3>
                            <div className="flex items-center gap-3 text-sm mt-1">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium border border-white/5 ${getCategoryStyle(expense.category).text} ${getCategoryStyle(expense.category).bg}`}>
                                    {expense.category}
                                </span>
                                <span className="text-zinc-500">
                                    {new Date(expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                {expense.receiptUrl && (
                                    <span className="text-emerald-500 flex items-center gap-1 text-xs cursor-pointer hover:underline">
                                        📎 Receipt
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xl font-bold text-white">-${expense.amount.toFixed(2)}</p>
                    </div>
                 </>
             ) : (
                 // Grid View Layout (Matching User Image Request)
                 <>
                    <div className="flex justify-between items-start mb-4">
                        <CategoryIcon category={expense.category} />
                        <p className="text-xl font-bold text-white">-${expense.amount.toFixed(2)}</p>
                    </div>
                    
                    <div>
                        <h3 className="font-bold text-white text-lg mb-2 truncate">{expense.merchant || expense.description}</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${getCategoryStyle(expense.category).bg} ${getCategoryStyle(expense.category).text}`}>
                                {expense.category}
                            </span>
                            <span className="text-zinc-500 text-xs font-medium">
                                {new Date(expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {expense.receiptUrl && (
                                <span className="text-emerald-500 flex items-center gap-1 text-xs cursor-pointer hover:underline ml-auto">
                                    📎 Receipt
                                </span>
                            )}
                        </div>
                        { expense.merchant && expense.description && expense.description !== expense.merchant && (
                             <p className="text-zinc-600 text-xs mt-3 truncate">{expense.description}</p>
                        )}
                    </div>
                 </>
             )}
              
          </div>
        ))}
        
        {expenses.length === 0 && (
            <div className="text-center py-20 bg-[#18181b] rounded-2xl border border-[#27272a] border-dashed">
                <p className="text-zinc-500">No expenses found. Start by adding one!</p>
            </div>
        )}
      </div>

      {/* Floating Add Button */}
      <button 
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-emerald-500 hover:bg-emerald-400 text-black rounded-full shadow-lg shadow-emerald-500/20 flex items-center justify-center transition-all hover:scale-105 z-30"
      >
        <span className="text-3xl font-light mb-1">+</span>
      </button>

      <AddExpenseModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onExpenseAdded={fetchExpenses}
      />
    </div>
  );
}
