"use client";

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ArrowPathIcon,
    XMarkIcon,
    BanknotesIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { CURRENCY_SYMBOLS } from '@/lib/imports/constants';

export default function ImportConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    selectedCount = 0,
    totalAmount = 0,
    currency = 'INR'
}) {
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const symbol = CURRENCY_SYMBOLS[currency] || currency;

    const handleConfirm = async () => {
        setImporting(true);
        setError(null);

        try {
            const res = await onConfirm();
            setResult(res || { success: true });
        } catch (err) {
            setError(err.message || 'Import failed');
        } finally {
            setImporting(false);
        }
    };

    const handleReset = () => {
        setResult(null);
        setError(null);
        onClose();
    };

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={handleReset}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-3xl bg-[#09090b] border border-[#27272a] p-6 text-left align-middle shadow-2xl transition-all space-y-5">
                                {!result ? (
                                    <>
                                        <div className="flex justify-between items-start">
                                            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400">
                                                <BanknotesIcon className="w-6 h-6" />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleReset}
                                                className="text-zinc-500 hover:text-white"
                                            >
                                                <XMarkIcon className="w-5 h-5" />
                                            </button>
                                        </div>

                                        <div>
                                            <Dialog.Title as="h3" className="text-xl font-bold text-white mb-2">
                                                Confirm Transaction Import
                                            </Dialog.Title>
                                            <p className="text-sm text-zinc-400 leading-relaxed">
                                                Import <strong className="text-white">{selectedCount}</strong> selected spending transactions totaling{' '}
                                                <strong className="text-emerald-400">
                                                    {symbol}{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </strong>
                                                ?
                                            </p>
                                        </div>

                                        <div className="p-3 bg-zinc-900 border border-[#27272a] rounded-xl text-xs text-zinc-400 space-y-1.5">
                                            <p className="font-semibold text-zinc-300">What happens next:</p>
                                            <p>• Approved expenses will be added directly into your SpendSense dashboard.</p>
                                            <p>• Credits and excluded transfers will NOT inflate your expense totals.</p>
                                            <p>• Any edited categories will be saved to improve future statement recognition.</p>
                                        </div>

                                        {error && (
                                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
                                                <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                                                <span>{error}</span>
                                            </div>
                                        )}

                                        <div className="flex gap-3 pt-2">
                                            <button
                                                type="button"
                                                onClick={handleReset}
                                                disabled={importing}
                                                className="flex-1 py-3 bg-[#18181b] hover:bg-zinc-800 text-white font-semibold text-sm rounded-xl border border-[#27272a] transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleConfirm}
                                                disabled={importing || selectedCount === 0}
                                                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {importing ? (
                                                    <>
                                                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                                        <span>Importing...</span>
                                                    </>
                                                ) : (
                                                    <span>Confirm & Import</span>
                                                )}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center py-4 space-y-4">
                                        <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                                            <CheckCircleIcon className="w-10 h-10" />
                                        </div>

                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-1">
                                                Import Completed Successfully!
                                            </h3>
                                            <p className="text-xs text-zinc-400">
                                                Your transactions have been recorded in MongoDB and are now available across your dashboards.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                                            <div className="p-3 bg-[#18181b] border border-[#27272a] rounded-xl">
                                                <span className="text-zinc-500 block">Imported Expenses</span>
                                                <span className="text-lg font-bold text-white">
                                                    {result.importedCount ?? selectedCount}
                                                </span>
                                            </div>
                                            <div className="p-3 bg-[#18181b] border border-[#27272a] rounded-xl">
                                                <span className="text-zinc-500 block">Total Value</span>
                                                <span className="text-lg font-bold text-emerald-400">
                                                    {symbol}{totalAmount.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2 pt-2">
                                            <Link
                                                href="/expenses"
                                                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs rounded-xl transition-colors block"
                                            >
                                                View Expenses
                                            </Link>
                                            <Link
                                                href="/analytics"
                                                className="w-full py-3 bg-[#18181b] hover:bg-zinc-800 text-white font-semibold text-xs rounded-xl border border-[#27272a] transition-colors block"
                                            >
                                                View Analytics
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={handleReset}
                                                className="text-xs text-zinc-500 hover:text-zinc-300 py-1"
                                            >
                                                Import Another Statement
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
