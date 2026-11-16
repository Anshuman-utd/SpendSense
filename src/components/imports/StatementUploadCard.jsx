"use client";

import { useState, useRef } from 'react';
import {
    CloudArrowUpIcon,
    DocumentTextIcon,
    ArrowDownTrayIcon,
    XMarkIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import AccountSelector from './AccountSelector';

export default function StatementUploadCard({
    accounts = [],
    selectedAccountId,
    onSelectAccount,
    onAccountCreated,
    onUploadSuccess
}) {
    const [dragActive, setDragActive] = useState(false);
    const [file, setFile] = useState(null);
    const [currency, setCurrency] = useState('INR');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [duplicateWarning, setDuplicateWarning] = useState(null);
    const fileInputRef = useRef(null);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndSetFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            validateAndSetFile(e.target.files[0]);
        }
    };

    const validateAndSetFile = (f) => {
        setError(null);
        setDuplicateWarning(null);

        if (!f.name.toLowerCase().endsWith('.csv')) {
            setError('Only CSV (.csv) files are supported at this time.');
            return;
        }

        if (f.size > 5 * 1024 * 1024) {
            setError(`File size is ${(f.size / (1024 * 1024)).toFixed(2)} MB. Maximum supported size is 5 MB.`);
            return;
        }

        setFile(f);
    };

    const handleUpload = async () => {
        if (!file) {
            setError('Please choose a CSV statement first.');
            return;
        }
        if (!selectedAccountId) {
            setError('Please select or create a bank account for this statement.');
            return;
        }

        setUploading(true);
        setError(null);
        setDuplicateWarning(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('accountId', selectedAccountId);
        formData.append('currency', currency);

        try {
            const res = await fetch('/api/imports/upload', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to upload statement');
            }

            if (data.duplicateFile) {
                setDuplicateWarning({
                    message: data.message,
                    jobId: data.existingJobId
                });
                return;
            }

            if (onUploadSuccess) {
                onUploadSuccess(data.data);
            }

        } catch (err) {
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="bg-[#18181b] border border-[#27272a] rounded-3xl p-6 md:p-8 space-y-6">
            {/* Top configuration row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-[#27272a]">
                <div className="md:col-span-2">
                    <AccountSelector
                        accounts={accounts}
                        selectedAccountId={selectedAccountId}
                        onSelect={onSelectAccount}
                        onAccountCreated={onAccountCreated}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Statement Currency
                    </label>
                    <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full bg-[#09090b] border border-[#27272a] rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                    >
                        <option value="INR">INR (₹) — Indian Rupee</option>
                        <option value="USD">USD ($) — US Dollar</option>
                        <option value="EUR">EUR (€) — Euro</option>
                        <option value="GBP">GBP (£) — British Pound</option>
                    </select>
                </div>
            </div>

            {/* Drag & Drop Zone */}
            <div
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                    dragActive
                        ? 'border-emerald-500 bg-emerald-500/5'
                        : 'border-[#27272a] bg-[#09090b] hover:border-zinc-700'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                {!file ? (
                    <div className="space-y-4">
                        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto text-emerald-500">
                            <CloudArrowUpIcon className="w-8 h-8" />
                        </div>
                        <div>
                            <p className="text-base font-medium text-white mb-1">
                                Drop your bank statement CSV here
                            </p>
                            <p className="text-xs text-zinc-500">
                                Supports HDFC, SBI, ICICI, Axis, and standard CSV formats up to 5 MB (up to 10,000 rows)
                            </p>
                        </div>
                        <div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,text/csv"
                                onChange={handleChange}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-5 py-2.5 bg-[#27272a] hover:bg-zinc-700 text-white text-xs font-semibold rounded-xl transition-colors"
                            >
                                Browse Files
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between p-4 bg-[#18181b] border border-[#27272a] rounded-xl">
                        <div className="flex items-center gap-3 text-left">
                            <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                                <DocumentTextIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white truncate max-w-xs md:max-w-md">{file.name}</p>
                                <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setFile(null); setError(null); setDuplicateWarning(null); }}
                            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                            disabled={uploading}
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                    <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Duplicate File Warning */}
            {duplicateWarning && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm space-y-2">
                    <div className="flex items-center gap-2 font-medium">
                        <ExclamationTriangleIcon className="w-5 h-5 shrink-0 text-amber-400" />
                        Duplicate Statement Detected
                    </div>
                    <p className="text-xs text-amber-200/80 leading-relaxed">{duplicateWarning.message}</p>
                </div>
            )}

            {/* Footer with Sample CSV link and Upload button */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
                <a
                    href="/api/imports/template"
                    download="spendsense_sample_statement.csv"
                    className="text-xs text-zinc-400 hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
                >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    Download Sample CSV Template
                </a>

                <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!file || uploading || !selectedAccountId}
                    className="w-full sm:w-auto px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {uploading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            <span>Uploading & Staging...</span>
                        </>
                    ) : (
                        <span>Upload & Analyze Statement</span>
                    )}
                </button>
            </div>
        </div>
    );
}
