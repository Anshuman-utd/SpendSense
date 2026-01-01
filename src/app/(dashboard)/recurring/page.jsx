"use client";

import { useState, useEffect, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import AddExpenseModal from '@/components/expenses/AddExpenseModal';
import { Menu, Transition } from '@headlessui/react';
import { EllipsisVerticalIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';


export default function RecurringPage() {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [data, setData] = useState({
        monthlyTotal: 0,
        activeCount: 0,
        yearlyTotal: 0,
        subscriptions: [],
        upcomingThisWeek: []
    });

    const refreshData = async () => {
        try {
            const res = await fetch('/api/expenses/recurring');
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            }
        } catch (error) {
            console.error('Failed to fetch recurring expenses:', error);
        }
    };

    useEffect(() => {
        if (session) {
            refreshData().finally(() => setLoading(false));
        }
    }, [session]);

    const handleToggleStatus = async (expenseId, currentStatus) => {
        const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
        
        // Optimistic update
        setData(prev => {
            const updatedSubs = prev.subscriptions.map(sub => 
                sub._id === expenseId ? { ...sub, subscriptionStatus: newStatus } : sub
            );
            
            // Re-calculate totals roughly for valid UI feedback
            const activeSubs = updatedSubs.filter(s => s.subscriptionStatus !== 'inactive');
            const monthly = activeSubs.reduce((acc, curr) => acc + curr.amount, 0);
            
            return {
                ...prev,
                subscriptions: updatedSubs,
                monthlyTotal: monthly,
                yearlyTotal: monthly * 12,
                activeCount: activeSubs.length
            };
        });

        try {
            await fetch(`/api/expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscriptionStatus: newStatus })
            });
            // Background refresh to ensure consistency
            refreshData();
        } catch (error) {
            console.error('Failed to update status:', error);
            refreshData(); // Revert on error
        }
    };

    const handleDelete = async (expenseId) => {
        if (!confirm('Are you sure you want to delete this subscription?')) return;

        // Optimistic update
        setData(prev => ({
            ...prev,
            subscriptions: prev.subscriptions.filter(sub => sub._id !== expenseId)
        }));

        try {
            await fetch(`/api/expenses/${expenseId}`, {
                method: 'DELETE'
            });
            refreshData();
        } catch (error) {
            console.error('Failed to delete expense:', error);
            refreshData();
        }
    };

    if (loading) {
        return <div className="p-8 text-white">Loading recurring expenses...</div>;
    }

    return (
        <div className="space-y-8 pb-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-white">Recurring</h1>
                {/* Search could be added here if needed, but not strictly requested beyond "Active" logic */}
            </div>

            {/* Top Cards Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
                    <p className="text-zinc-400 text-sm font-medium mb-1">Monthly Cost</p>
                    <p className="text-3xl font-bold text-white">${data.monthlyTotal.toFixed(2)}</p>
                </div>
                <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
                    <p className="text-zinc-400 text-sm font-medium mb-1">Active Subscriptions</p>
                    <p className="text-3xl font-bold text-white">{data.activeCount}</p>
                </div>
                <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
                    <p className="text-zinc-400 text-sm font-medium mb-1">Yearly Cost</p>
                    <p className="text-3xl font-bold text-white">${data.yearlyTotal.toFixed(2)}</p>
                </div>
            </div>

            {/* Recurring Expenses List */}
            <div className="space-y-4">
                <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-2">Recurring Expenses</h1>
                    <p className="text-zinc-400">Manage your subscriptions and regular payments</p>
                </div>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black px-4 py-2 rounded-xl font-bold transition-all"
                    >
                        <PlusIcon className="w-5 h-5" />
                        Add Subscription
                    </button>
                </div>
            </header>

                {data.subscriptions.length === 0 ? (
                    <div className="text-zinc-500 text-center py-8">No active subscriptions found.</div>
                ) : (
                    data.subscriptions.map((sub, index) => {
                        const isInactive = sub.subscriptionStatus === 'inactive';
                        return (
                            <div key={sub._id || index} className={`bg-[#18181b] p-4 rounded-2xl border border-[#27272a] flex items-center justify-between hover:bg-[#27272a]/50 transition-colors group ${isInactive ? 'opacity-60' : ''}`}>
                                <div className="flex items-center gap-4">
                                    <CategoryIcon category={sub.category} />
                                    <div>
                                        <h3 className="font-bold text-white text-lg">{sub.merchant || sub.description}</h3>
                                        <p className="text-zinc-500 text-sm flex items-center gap-2">
                                            <span>Monthly</span>
                                            {/* Logic: If inactive, don't show "Next: ..." or show differently? User said remove if unknown, but here if inactive maybe "Paused"? */}
                                            {/* User also said: "remove the next : unknown for a recurring expense" */}
                                            {!isInactive && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
                                                    <span>Next: {formatNextDate(sub.date)}</span>
                                                </>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className="text-white font-bold text-lg">${sub.amount.toFixed(2)} <span className="text-zinc-500 text-sm font-normal">/mo</span></span>
                                    
                                    {/* Toggle Switch */}
                                    <div 
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer transition-colors ${isInactive ? 'bg-zinc-700' : 'bg-emerald-500'}`}
                                        onClick={() => handleToggleStatus(sub._id, sub.subscriptionStatus || 'active')}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-black transition-transform ${isInactive ? 'translate-x-1' : 'translate-x-6'}`}/>
                                    </div>

                                    {/* Menu for Delete */}
                                    <Menu as="div" className="relative">
                                        <Menu.Button className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors">
                                            <EllipsisVerticalIcon className="w-6 h-6" />
                                        </Menu.Button>
                                        <Transition
                                            as={Fragment}
                                            enter="transition ease-out duration-100"
                                            enterFrom="transform opacity-0 scale-95"
                                            enterTo="transform opacity-100 scale-100"
                                            leave="transition ease-in duration-75"
                                            leaveFrom="transform opacity-100 scale-100"
                                            leaveTo="transform opacity-0 scale-95"
                                        >
                                            <Menu.Items className="absolute right-0 mt-2 w-32 origin-top-right divide-y divide-gray-100 rounded-xl bg-[#18181b] border border-[#27272a] shadow-lg focus:outline-none z-50">
                                                <div className="p-1">
                                                    <Menu.Item>
                                                        {({ active }) => (
                                                            <button
                                                                onClick={() => handleDelete(sub._id)}
                                                                className={`${
                                                                    active ? 'bg-red-500/10 text-red-500' : 'text-zinc-300'
                                                                } group flex w-full items-center rounded-lg px-2 py-2 text-sm`}
                                                            >
                                                                <TrashIcon className="mr-2 h-4 w-4" />
                                                                Delete
                                                            </button>
                                                        )}
                                                    </Menu.Item>
                                                </div>
                                            </Menu.Items>
                                        </Transition>
                                    </Menu>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Add Expense Modal */}
            <AddExpenseModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onExpenseAdded={refreshData}
            />

            {/* Upcoming This Week Section */}
            <div>
                 <h2 className="text-xl font-bold text-white mb-4">Upcoming This Week</h2>
                 {data.upcomingThisWeek.length === 0 ? (
                     <div className="bg-[#18181b] p-8 rounded-2xl border border-[#27272a] text-center text-zinc-500">
                         No upcoming payments due this week.
                     </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.upcomingThisWeek.map((item, index) => (
                             <div key={index} className="bg-[#18181b] p-4 rounded-2xl border border-[#27272a] flex items-center gap-4">
                                <CategoryIcon category={item.category} />
                                <div className="flex-1">
                                    <h4 className="font-bold text-white truncate">{item.merchant || item.description}</h4>
                                    <p className="text-emerald-400 text-sm">Due {format(new Date(item.nextPaymentDate), 'MMM d')}</p>
                                </div>
                                <span className="font-bold text-white">${item.amount.toFixed(2)}</span>
                             </div>
                        ))}
                    </div>
                 )}
            </div>
        </div>
    );
}

function formatNextDate(originalDateStr) {
    if (!originalDateStr) return 'Unknown';
    try {
        const today = new Date();
        const date = new Date(originalDateStr);
        if (isNaN(date.getTime())) return 'Unknown'; 

        // Project forward
        let next = new Date(date);
        while (next < today) {
            next.setMonth(next.getMonth() + 1);
        }
        return format(next, 'MMM d, yyyy');
    } catch (e) {
        return 'Unknown';
    }
}
