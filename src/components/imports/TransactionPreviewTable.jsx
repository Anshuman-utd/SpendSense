"use client";

import { useState, useEffect, useMemo } from 'react';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    CheckIcon,
    XMarkIcon,
    ExclamationTriangleIcon,
    PencilSquareIcon,
    ChevronLeftIcon,
    ChevronRightIcon
} from '@heroicons/react/24/outline';
import { CATEGORIES, CURRENCY_SYMBOLS } from '@/lib/imports/constants';
import CategoryIcon, { getCategoryStyle } from '@/components/ui/CategoryIcon';

export default function TransactionPreviewTable({
    importJobId,
    currency = 'INR',
    onSummaryChange
}) {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    // Filters
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // all, expenses, duplicates, credits, selected
    const [categoryFilter, setCategoryFilter] = useState('all');

    // Inline editing states
    const [editingMerchantId, setEditingMerchantId] = useState(null);
    const [merchantInput, setMerchantInput] = useState('');

    const symbol = CURRENCY_SYMBOLS[currency] || currency;

    const fetchTransactions = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '50',
                filter: activeTab
            });
            if (categoryFilter !== 'all') {
                params.append('category', categoryFilter);
            }
            if (search.trim()) {
                params.append('search', search.trim());
            }

            const res = await fetch(`/api/imports/${importJobId}/transactions?${params.toString()}`);
            const data = await res.json();

            if (data.success) {
                setTransactions(data.data || []);
                setTotalPages(data.pagination.totalPages || 1);
                setTotalItems(data.pagination.total || 0);
                if (onSummaryChange && data.summary) {
                    onSummaryChange(data.summary);
                }
            }
        } catch (err) {
            console.error('Failed to fetch transactions:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, [importJobId, page, activeTab, categoryFilter, search]);

    const handleToggleSelect = async (transaction) => {
        const newSelected = !transaction.selected;
        // Optimistic update
        setTransactions((prev) =>
            prev.map((t) => (t._id === transaction._id ? { ...t, selected: newSelected } : t))
        );

        try {
            const res = await fetch(`/api/imports/${importJobId}/transactions/${transaction._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selected: newSelected })
            });
            const data = await res.json();
            if (data.success && onSummaryChange) {
                // Refresh summary
                const sumRes = await fetch(`/api/imports/${importJobId}/transactions?limit=1`);
                const sumData = await sumRes.json();
                if (sumData.success && sumData.summary) {
                    onSummaryChange(sumData.summary);
                }
            }
        } catch (err) {
            console.error('Failed to toggle selection:', err);
        }
    };

    const handleCategoryChange = async (transactionId, newCategory) => {
        // Optimistic update
        setTransactions((prev) =>
            prev.map((t) => (t._id === transactionId ? { ...t, category: newCategory } : t))
        );

        try {
            await fetch(`/api/imports/${importJobId}/transactions/${transactionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: newCategory })
            });
        } catch (err) {
            console.error('Failed to update category:', err);
        }
    };

    const handleSaveMerchant = async (transactionId) => {
        if (!merchantInput.trim()) {
            setEditingMerchantId(null);
            return;
        }

        const newMerchant = merchantInput.trim();
        setTransactions((prev) =>
            prev.map((t) => (t._id === transactionId ? { ...t, merchant: newMerchant } : t))
        );
        setEditingMerchantId(null);

        try {
            await fetch(`/api/imports/${importJobId}/transactions/${transactionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ merchant: newMerchant })
            });
        } catch (err) {
            console.error('Failed to update merchant:', err);
        }
    };

    const handleSelectAllVisible = async (shouldSelect) => {
        // Update all currently visible
        setTransactions((prev) => prev.map((t) => ({ ...t, selected: shouldSelect })));
        await Promise.all(
            transactions.map((t) =>
                fetch(`/api/imports/${importJobId}/transactions/${t._id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ selected: shouldSelect })
                })
            )
        );
        // Refresh summary
        const sumRes = await fetch(`/api/imports/${importJobId}/transactions?limit=1`);
        const sumData = await sumRes.json();
        if (sumData.success && sumData.summary && onSummaryChange) {
            onSummaryChange(sumData.summary);
        }
    };

    return (
        <div className="bg-[#18181b] border border-[#27272a] rounded-3xl overflow-hidden space-y-4 p-5 md:p-6">
            {/* Filter Bar */}
            <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
                {/* Search */}
                <div className="relative w-full lg:w-72">
                    <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search merchant or description..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-xl py-2 pl-9 pr-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                    />
                </div>

                {/* Filter Tabs */}
                <div className="flex flex-wrap gap-1 bg-[#09090b] p-1 rounded-xl border border-[#27272a]">
                    {[
                        { id: 'all', label: 'All' },
                        { id: 'expenses', label: 'Expenses' },
                        { id: 'duplicates', label: 'Duplicates' },
                        { id: 'credits', label: 'Credits' },
                        { id: 'selected', label: 'Selected' }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => { setActiveTab(tab.id); setPage(1); }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                activeTab === tab.id
                                    ? 'bg-emerald-500 text-black font-semibold'
                                    : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Category Filter */}
                <div className="relative w-full sm:w-auto">
                    <select
                        value={categoryFilter}
                        onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-xl py-2 pl-8 pr-4 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500 cursor-pointer appearance-none"
                    >
                        <option value="all">All Categories</option>
                        {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                    <FunnelIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
            </div>

            {/* Quick Bulk Selection Controls */}
            <div className="flex justify-between items-center text-xs text-zinc-400 px-1 pt-1">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => handleSelectAllVisible(true)}
                        className="hover:text-emerald-400 font-medium transition-colors"
                    >
                        Select All Visible
                    </button>
                    <span>•</span>
                    <button
                        type="button"
                        onClick={() => handleSelectAllVisible(false)}
                        className="hover:text-zinc-200 transition-colors"
                    >
                        Deselect All Visible
                    </button>
                </div>
                <span>Showing {transactions.length} of {totalItems} rows</span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-[#27272a]">
                <table className="w-full text-left text-xs">
                    <thead className="bg-[#09090b] text-zinc-400 border-b border-[#27272a] uppercase tracking-wider text-[11px]">
                        <tr>
                            <th className="p-3 w-10 text-center">Import</th>
                            <th className="p-3">Date</th>
                            <th className="p-3">Merchant</th>
                            <th className="p-3">Original Description</th>
                            <th className="p-3">Type</th>
                            <th className="p-3 text-right">Amount</th>
                            <th className="p-3">Category</th>
                            <th className="p-3 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272a] text-zinc-300">
                        {loading ? (
                            <tr>
                                <td colSpan="8" className="p-12 text-center text-zinc-500">
                                    <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2" />
                                    Loading transactions...
                                </td>
                            </tr>
                        ) : transactions.length === 0 ? (
                            <tr>
                                <td colSpan="8" className="p-12 text-center text-zinc-500">
                                    No transactions match your current filters.
                                </td>
                            </tr>
                        ) : (
                            transactions.map((t) => {
                                const isDebit = t.direction === 'debit';
                                const isDuplicate = t.duplicateStatus === 'possible_duplicate' || t.duplicateStatus === 'confirmed_duplicate';

                                return (
                                    <tr
                                        key={t._id}
                                        className={`hover:bg-[#27272a]/40 transition-colors ${
                                            !t.selected ? 'opacity-60 bg-black/20' : ''
                                        }`}
                                    >
                                        {/* Select Checkbox */}
                                        <td className="p-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={t.selected}
                                                onChange={() => handleToggleSelect(t)}
                                                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
                                            />
                                        </td>

                                        {/* Date */}
                                        <td className="p-3 whitespace-nowrap text-zinc-400 font-mono text-[11px]">
                                            {new Date(t.transactionDate).toLocaleDateString('en-IN', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric'
                                            })}
                                        </td>

                                        {/* Merchant (Inline Editable) */}
                                        <td className="p-3">
                                            {editingMerchantId === t._id ? (
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="text"
                                                        value={merchantInput}
                                                        onChange={(e) => setMerchantInput(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveMerchant(t._id);
                                                            if (e.key === 'Escape') setEditingMerchantId(null);
                                                        }}
                                                        autoFocus
                                                        className="bg-[#09090b] border border-emerald-500 rounded px-2 py-1 text-xs text-white focus:outline-none w-32"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSaveMerchant(t._id)}
                                                        className="text-emerald-400 hover:text-emerald-300 p-0.5"
                                                    >
                                                        <CheckIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingMerchantId(null)}
                                                        className="text-zinc-500 hover:text-zinc-300 p-0.5"
                                                    >
                                                        <XMarkIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div
                                                    className="flex items-center gap-1.5 group cursor-pointer"
                                                    onClick={() => {
                                                        setEditingMerchantId(t._id);
                                                        setMerchantInput(t.merchant || '');
                                                    }}
                                                >
                                                    <span className="font-semibold text-white truncate max-w-[140px]">
                                                        {t.merchant || 'Unknown'}
                                                    </span>
                                                    <PencilSquareIcon className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                            )}
                                        </td>

                                        {/* Original Description */}
                                        <td className="p-3 max-w-[220px]">
                                            <p className="truncate text-zinc-400 text-xs" title={t.originalDescription}>
                                                {t.originalDescription}
                                            </p>
                                            {t.bankReference && (
                                                <span className="text-[10px] text-zinc-600 font-mono">
                                                    Ref: {t.bankReference}
                                                </span>
                                            )}
                                        </td>

                                        {/* Direction Badge */}
                                        <td className="p-3 whitespace-nowrap">
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                    isDebit
                                                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                }`}
                                            >
                                                {isDebit ? 'Debit' : 'Credit'}
                                            </span>
                                        </td>

                                        {/* Amount */}
                                        <td className="p-3 text-right whitespace-nowrap font-mono font-bold text-white">
                                            {isDebit ? '-' : '+'}{symbol}{(t.amountMinor / 100).toFixed(2)}
                                        </td>

                                        {/* Category Dropdown */}
                                        <td className="p-3 whitespace-nowrap">
                                            <select
                                                value={t.category || 'Other'}
                                                onChange={(e) => handleCategoryChange(t._id, e.target.value)}
                                                className="bg-[#09090b] border border-[#27272a] rounded-lg py-1 px-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                                            >
                                                {CATEGORIES.map((c) => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* Status Badge */}
                                        <td className="p-3 text-center whitespace-nowrap">
                                            {t.importStatus === 'imported' ? (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    Imported
                                                </span>
                                            ) : isDuplicate ? (
                                                <span
                                                    className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1 justify-center"
                                                    title="Matching amount & date found in records"
                                                >
                                                    <ExclamationTriangleIcon className="w-3 h-3 text-amber-400" />
                                                    Duplicate
                                                </span>
                                            ) : t.direction === 'credit' ? (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                    Income
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                                                    New
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center pt-2 text-xs text-zinc-400">
                    <span>
                        Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-1.5 rounded-lg border border-[#27272a] hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronLeftIcon className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-1.5 rounded-lg border border-[#27272a] hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronRightIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
