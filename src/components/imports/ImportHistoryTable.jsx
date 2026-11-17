"use client";

import { useState, useEffect } from 'react';
import {
    ClockIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    DocumentTextIcon,
    ChevronLeftIcon,
    ChevronRightIcon
} from '@heroicons/react/24/outline';
import { CURRENCY_SYMBOLS } from '@/lib/imports/constants';

export default function ImportHistoryTable({ onSelectJob, refreshTrigger }) {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/imports?page=${page}&limit=10`);
            const data = await res.json();
            if (data.success) {
                setJobs(data.data || []);
                setTotalPages(data.pagination.totalPages || 1);
            }
        } catch (err) {
            console.error('Failed to fetch import history:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [page, refreshTrigger]);

    const getStatusBadge = (status) => {
        switch (status) {
            case 'completed':
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                        <CheckCircleIcon className="w-3 h-3" />
                        Completed
                    </span>
                );
            case 'ready_for_review':
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 inline-flex items-center gap-1">
                        <ClockIcon className="w-3 h-3" />
                        Needs Review
                    </span>
                );
            case 'processing':
            case 'importing':
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 inline-flex items-center gap-1">
                        <ArrowPathIcon className="w-3 h-3 animate-spin" />
                        Processing
                    </span>
                );
            case 'failed':
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 inline-flex items-center gap-1">
                        <ExclamationCircleIcon className="w-3 h-3" />
                        Failed
                    </span>
                );
            case 'mapping_required':
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        Mapping Required
                    </span>
                );
            default:
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-400">
                        {status}
                    </span>
                );
        }
    };

    return (
        <div className="bg-[#18181b] border border-[#27272a] rounded-3xl p-6 md:p-8 space-y-4">
            <div className="flex justify-between items-center pb-2">
                <div>
                    <h3 className="text-lg font-bold text-white">Import History</h3>
                    <p className="text-xs text-zinc-400">All statement batches uploaded and processed for your account</p>
                </div>
                <button
                    type="button"
                    onClick={fetchHistory}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
                    title="Refresh history"
                >
                    <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#27272a]">
                <table className="w-full text-left text-xs">
                    <thead className="bg-[#09090b] text-zinc-400 border-b border-[#27272a] uppercase tracking-wider text-[11px]">
                        <tr>
                            <th className="p-3">File / Account</th>
                            <th className="p-3">Uploaded</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-center">Transactions</th>
                            <th className="p-3 text-right">Imported Value</th>
                            <th className="p-3 text-center">Duplicates</th>
                            <th className="p-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272a] text-zinc-300">
                        {loading && jobs.length === 0 ? (
                            <tr>
                                <td colSpan="7" className="p-10 text-center text-zinc-500">
                                    Loading import history...
                                </td>
                            </tr>
                        ) : jobs.length === 0 ? (
                            <tr>
                                <td colSpan="7" className="p-10 text-center text-zinc-500">
                                    No statements uploaded yet. Upload your first CSV statement above!
                                </td>
                            </tr>
                        ) : (
                            jobs.map((job) => {
                                const symbol = CURRENCY_SYMBOLS[job.currency] || job.currency || '₹';
                                return (
                                    <tr key={job._id} className="hover:bg-[#27272a]/40 transition-colors">
                                        <td className="p-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-emerald-400 shrink-0">
                                                    <DocumentTextIcon className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-white truncate max-w-[160px] md:max-w-xs" title={job.originalFilename}>
                                                        {job.originalFilename}
                                                    </p>
                                                    <p className="text-[11px] text-zinc-500 truncate">
                                                        {job.accountId?.accountName || 'Primary Account'}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="p-3 text-zinc-400 whitespace-nowrap">
                                            {new Date(job.createdAt).toLocaleDateString('en-IN', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric'
                                            })}
                                        </td>

                                        <td className="p-3 whitespace-nowrap">
                                            {getStatusBadge(job.status)}
                                        </td>

                                        <td className="p-3 text-center whitespace-nowrap">
                                            <span className="font-semibold text-white">
                                                {job.importedRows > 0 ? job.importedRows : (job.approvedRows || job.validRows || 0)}
                                            </span>
                                            <span className="text-zinc-500"> / {job.totalRows || 0}</span>
                                        </td>

                                        <td className="p-3 text-right font-mono font-semibold text-white whitespace-nowrap">
                                            {symbol}{(job.selectedAmountTotal || 0).toFixed(2)}
                                        </td>

                                        <td className="p-3 text-center whitespace-nowrap">
                                            {job.duplicateRows > 0 ? (
                                                <span className="text-amber-400 font-medium">
                                                    {job.duplicateRows}
                                                </span>
                                            ) : (
                                                <span className="text-zinc-600">0</span>
                                            )}
                                        </td>

                                        <td className="p-3 text-right whitespace-nowrap">
                                            <button
                                                type="button"
                                                onClick={() => onSelectJob && onSelectJob(job)}
                                                className="px-3 py-1.5 bg-[#27272a] hover:bg-zinc-700 text-white text-xs font-medium rounded-lg transition-colors"
                                            >
                                                {job.status === 'ready_for_review' || job.status === 'mapping_required' ? 'Resume' : 'View'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="flex justify-between items-center pt-2 text-xs text-zinc-400">
                    <span>Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-1.5 rounded-lg border border-[#27272a] hover:bg-zinc-800 disabled:opacity-30"
                        >
                            <ChevronLeftIcon className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-1.5 rounded-lg border border-[#27272a] hover:bg-zinc-800 disabled:opacity-30"
                        >
                            <ChevronRightIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
