"use client";

import { useState } from 'react';
import { TableCellsIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { SUPPORTED_DATE_FORMATS } from '@/lib/imports/constants';

export default function ColumnMappingForm({ importJob, onMappingSaved }) {
    const headers = importJob?.detectedFormat?.headers || [];
    const sampleRows = importJob?.detectedFormat?.sampleRows || [];
    const initialMapping = importJob?.selectedMapping || importJob?.detectedFormat?.detectedMapping || {};

    const [mapping, setMapping] = useState({
        date: initialMapping.date || '',
        description: initialMapping.description || '',
        debit: initialMapping.debit || '',
        credit: initialMapping.credit || '',
        amount: initialMapping.amount || '',
        transactionType: initialMapping.transactionType || '',
        reference: initialMapping.reference || '',
        balance: initialMapping.balance || ''
    });

    const [dateFormat, setDateFormat] = useState(importJob?.dateFormat || 'DD/MM/YYYY');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleFieldChange = (field, value) => {
        setMapping((prev) => ({ ...prev, [field]: value }));
        setError(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        // Validation: date + description + (debit || credit || amount)
        if (!mapping.date) {
            setError('Please map the Date column');
            return;
        }
        if (!mapping.description) {
            setError('Please map the Description column');
            return;
        }
        if (!mapping.debit && !mapping.credit && !mapping.amount) {
            setError('Please map at least one monetary column (Debit, Credit, or Amount)');
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`/api/imports/${importJob._id}/mapping`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mapping, dateFormat })
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to update mapping');
            }

            if (onMappingSaved) {
                onMappingSaved(data.data);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-[#18181b] border border-[#27272a] rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-[#27272a]">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                    <TableCellsIcon className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white">Map Column Headers</h3>
                    <p className="text-xs text-zinc-400">
                        Help SpendSense identify which CSV columns correspond to transaction dates, amounts, and descriptions.
                    </p>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Field mapping grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Date */}
                <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Date Column <span className="text-emerald-500">*</span>
                    </label>
                    <select
                        value={mapping.date}
                        onChange={(e) => handleFieldChange('date', e.target.value)}
                        required
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                        <option value="">Select column...</option>
                        {headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                        ))}
                    </select>
                </div>

                {/* Date Format */}
                <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Date Format <span className="text-emerald-500">*</span>
                    </label>
                    <select
                        value={dateFormat}
                        onChange={(e) => setDateFormat(e.target.value)}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                        {SUPPORTED_DATE_FORMATS.map((fmt) => (
                            <option key={fmt} value={fmt}>{fmt}</option>
                        ))}
                    </select>
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Description / Narration <span className="text-emerald-500">*</span>
                    </label>
                    <select
                        value={mapping.description}
                        onChange={(e) => handleFieldChange('description', e.target.value)}
                        required
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                        <option value="">Select column...</option>
                        {headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                        ))}
                    </select>
                </div>

                {/* Debit Column */}
                <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Debit / Withdrawal Amount
                    </label>
                    <select
                        value={mapping.debit}
                        onChange={(e) => handleFieldChange('debit', e.target.value)}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                        <option value="">None / Not separate</option>
                        {headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                        ))}
                    </select>
                </div>

                {/* Credit Column */}
                <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Credit / Deposit Amount
                    </label>
                    <select
                        value={mapping.credit}
                        onChange={(e) => handleFieldChange('credit', e.target.value)}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                        <option value="">None / Not separate</option>
                        {headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                        ))}
                    </select>
                </div>

                {/* Single Signed Amount */}
                <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Single Amount Column (if not separate)
                    </label>
                    <select
                        value={mapping.amount}
                        onChange={(e) => handleFieldChange('amount', e.target.value)}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                        <option value="">None</option>
                        {headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                        ))}
                    </select>
                </div>

                {/* Reference Number */}
                <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Reference / UTR / Cheque (Optional)
                    </label>
                    <select
                        value={mapping.reference}
                        onChange={(e) => handleFieldChange('reference', e.target.value)}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                        <option value="">None</option>
                        {headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Sample data rows preview */}
            {sampleRows.length > 0 && (
                <div className="space-y-2 pt-2">
                    <span className="text-xs font-semibold text-zinc-400">Sample Rows from File:</span>
                    <div className="overflow-x-auto rounded-xl border border-[#27272a] bg-[#09090b]">
                        <table className="w-full text-left text-xs text-zinc-400">
                            <thead className="bg-[#18181b] text-zinc-300 border-b border-[#27272a]">
                                <tr>
                                    {headers.map((h) => (
                                        <th key={h} className="p-2.5 whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#27272a]">
                                {sampleRows.map((row, idx) => (
                                    <tr key={idx}>
                                        {headers.map((h) => (
                                            <td key={h} className="p-2.5 whitespace-nowrap">{row[h] || '—'}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="flex justify-end pt-2">
                <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                >
                    {submitting ? (
                        <>
                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                            <span>Saving & Processing...</span>
                        </>
                    ) : (
                        <span>Confirm Mapping & Continue</span>
                    )}
                </button>
            </div>
        </form>
    );
}
