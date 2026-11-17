"use client";

import { useState, useEffect } from 'react';
import {
    SparklesIcon,
    ArrowUpTrayIcon,
    ArrowPathIcon,
    CheckBadgeIcon,
    BuildingLibraryIcon
} from '@heroicons/react/24/outline';
import StatementUploadCard from '@/components/imports/StatementUploadCard';
import ColumnMappingForm from '@/components/imports/ColumnMappingForm';
import ImportProgress from '@/components/imports/ImportProgress';
import ImportSummaryCards from '@/components/imports/ImportSummaryCards';
import TransactionPreviewTable from '@/components/imports/TransactionPreviewTable';
import ImportConfirmationModal from '@/components/imports/ImportConfirmationModal';
import ImportHistoryTable from '@/components/imports/ImportHistoryTable';

export default function ImportsPage() {
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [activeJob, setActiveJob] = useState(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Fetch accounts on mount
    useEffect(() => {
        async function fetchAccounts() {
            try {
                const res = await fetch('/api/imports/accounts');
                const data = await res.json();
                if (data.success && data.data.length > 0) {
                    setAccounts(data.data);
                    setSelectedAccountId(data.data[0]._id);
                }
            } catch (err) {
                console.error('Failed to load accounts:', err);
            }
        }
        fetchAccounts();
    }, []);

    // Polling for processing status
    useEffect(() => {
        if (!activeJob) return;
        const needsPolling = ['uploaded', 'processing', 'confirmation_queued', 'importing'].includes(activeJob.status);
        if (!needsPolling) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/imports/${activeJob._id}`);
                const data = await res.json();
                if (data.success) {
                    setActiveJob(data.data);
                    if (data.data.status === 'completed' || data.data.status === 'ready_for_review') {
                        setRefreshTrigger((prev) => prev + 1);
                    }
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 2500);

        return () => clearInterval(interval);
    }, [activeJob?._id, activeJob?.status]);

    const handleUploadSuccess = (job) => {
        setActiveJob(job);
        setRefreshTrigger((prev) => prev + 1);
    };

    const handleMappingSaved = (updatedJob) => {
        setActiveJob(updatedJob);
    };

    const handleConfirmImport = async () => {
        if (!activeJob) return;
        const res = await fetch(`/api/imports/${activeJob._id}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to confirm import');
        }
        // Refresh job
        const jobRes = await fetch(`/api/imports/${activeJob._id}`);
        const jobData = await jobRes.json();
        if (jobData.success) {
            setActiveJob(jobData.data);
        }
        setRefreshTrigger((prev) => prev + 1);
        return data.data;
    };

    const handleSummaryChange = (summary) => {
        if (!activeJob) return;
        setActiveJob((prev) => ({
            ...prev,
            approvedRows: summary.selectedCount,
            selectedAmountTotal: summary.selectedAmountTotal
        }));
    };

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
                        <SparklesIcon className="w-4 h-4" />
                        Smart Ingestion Engine
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Smart Transaction Import</h1>
                    <p className="text-zinc-400 text-sm mt-1">
                        Upload your bank statement and let SpendSense automatically organize your transactions.
                    </p>
                </div>

                {activeJob && (
                    <button
                        type="button"
                        onClick={() => setActiveJob(null)}
                        className="px-4 py-2 bg-[#18181b] hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold border border-[#27272a] transition-colors self-start md:self-auto flex items-center gap-2"
                    >
                        <ArrowUpTrayIcon className="w-4 h-4" />
                        Upload Another Statement
                    </button>
                )}
            </div>

            {/* Workflow Steps */}

            {/* Step 1: Upload Card (when no active job or user wants fresh upload) */}
            {!activeJob && (
                <StatementUploadCard
                    accounts={accounts}
                    selectedAccountId={selectedAccountId}
                    onSelectAccount={setSelectedAccountId}
                    onAccountCreated={(newAcc) => {
                        setAccounts((prev) => [newAcc, ...prev]);
                        setSelectedAccountId(newAcc._id);
                    }}
                    onUploadSuccess={handleUploadSuccess}
                />
            )}

            {/* Step 2: Mapping Form (when status is mapping_required) */}
            {activeJob && activeJob.status === 'mapping_required' && (
                <ColumnMappingForm
                    importJob={activeJob}
                    onMappingSaved={handleMappingSaved}
                />
            )}

            {/* Step 3: Processing Progress Bar */}
            {activeJob && ['uploaded', 'processing', 'importing', 'failed'].includes(activeJob.status) && (
                <ImportProgress
                    importJob={activeJob}
                    onRetry={(retriedJob) => setActiveJob(retriedJob)}
                />
            )}

            {/* Step 4: Review Screen (when ready_for_review or completed) */}
            {activeJob && ['ready_for_review', 'completed', 'partially_completed'].includes(activeJob.status) && (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <ImportSummaryCards
                        totalRows={activeJob.totalRows}
                        validRows={activeJob.validRows}
                        duplicateRows={activeJob.duplicateRows}
                        creditRows={activeJob.creditRows}
                        invalidRows={activeJob.invalidRows}
                        approvedRows={activeJob.approvedRows}
                        selectedAmountTotal={activeJob.selectedAmountTotal || 0}
                        currency={activeJob.currency || 'INR'}
                    />

                    {/* Action Bar for Confirmation */}
                    {activeJob.status === 'ready_for_review' && (
                        <div className="bg-gradient-to-r from-emerald-500/10 via-zinc-900 to-[#18181b] border border-emerald-500/20 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div>
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                    <CheckBadgeIcon className="w-5 h-5 text-emerald-400" />
                                    Review & Confirm Approved Spending
                                </h4>
                                <p className="text-xs text-zinc-400">
                                    Review recognized merchants and categories below. Suspected duplicates and credits are deselected by default.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsConfirmModalOpen(true)}
                                disabled={!activeJob.approvedRows || activeJob.approvedRows === 0}
                                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 whitespace-nowrap"
                            >
                                Import {activeJob.approvedRows || 0} Transactions
                            </button>
                        </div>
                    )}

                    {/* Interactive Review Table */}
                    <TransactionPreviewTable
                        importJobId={activeJob._id}
                        currency={activeJob.currency || 'INR'}
                        onSummaryChange={handleSummaryChange}
                    />

                    {/* Confirmation Modal */}
                    <ImportConfirmationModal
                        isOpen={isConfirmModalOpen}
                        onClose={() => setIsConfirmModalOpen(false)}
                        onConfirm={handleConfirmImport}
                        selectedCount={activeJob.approvedRows || 0}
                        totalAmount={activeJob.selectedAmountTotal || 0}
                        currency={activeJob.currency || 'INR'}
                    />
                </div>
            )}

            {/* Import History Table */}
            <ImportHistoryTable
                onSelectJob={(job) => setActiveJob(job)}
                refreshTrigger={refreshTrigger}
            />
        </div>
    );
}
