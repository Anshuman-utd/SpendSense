"use client";

import { useState } from 'react';
import {
    CheckCircleIcon,
    ArrowPathIcon,
    ExclamationCircleIcon,
    DocumentMagnifyingGlassIcon
} from '@heroicons/react/24/outline';

const STAGES = [
    { key: 'upload', label: 'File received & staged in secure storage' },
    { key: 'parsing', label: 'Parsing statement rows and headers' },
    { key: 'normalizing', label: 'Normalizing dates & monetary amounts' },
    { key: 'merchants', label: 'Extracting merchant identities' },
    { key: 'duplicates', label: 'Detecting duplicates against history' },
    { key: 'categorizing', label: 'Categorizing spending (Rules & Groq AI)' },
    { key: 'ready', label: 'Ready for review' }
];

export default function ImportProgress({ importJob, onRetry }) {
    const [retrying, setRetrying] = useState(false);
    const progress = importJob?.progress || { stage: 'Processing', percent: 20, message: 'Processing statement...' };
    const isFailed = importJob?.status === 'failed';
    const percent = Math.min(100, Math.max(0, progress.percent || 10));

    const handleRetry = async () => {
        setRetrying(true);
        try {
            const res = await fetch(`/api/imports/${importJob._id}/retry`, { method: 'POST' });
            const data = await res.json();
            if (data.success && onRetry) {
                onRetry(data.data);
            }
        } catch (err) {
            console.error('Retry failed:', err);
        } finally {
            setRetrying(false);
        }
    };

    return (
        <div className="bg-[#18181b] border border-[#27272a] rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                        isFailed ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                        {isFailed ? (
                            <ExclamationCircleIcon className="w-6 h-6" />
                        ) : (
                            <DocumentMagnifyingGlassIcon className="w-6 h-6" />
                        )}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">
                            {isFailed ? 'Processing Failed' : 'Processing Bank Statement'}
                        </h3>
                        <p className="text-xs text-zinc-400">
                            {progress.message || 'Analyzing transactions...'}
                        </p>
                    </div>
                </div>

                <span className="text-xl font-bold text-emerald-400">
                    {percent}%
                </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[#09090b] rounded-full h-2.5 overflow-hidden border border-[#27272a]">
                <div
                    className={`h-full transition-all duration-500 ${
                        isFailed ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${percent}%` }}
                />
            </div>

            {/* Error Message & Retry */}
            {isFailed && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-300 text-xs space-y-3">
                    <p className="font-semibold">Statement Processing Encountered an Error:</p>
                    <p className="text-red-200/80">{progress.message || importJob?.errorSummary?.[0] || 'Unknown error'}</p>
                    <div>
                        <button
                            type="button"
                            onClick={handleRetry}
                            disabled={retrying}
                            className="px-4 py-2 bg-red-500 hover:bg-red-400 text-black font-semibold rounded-xl text-xs flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            {retrying ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ArrowPathIcon className="w-4 h-4" />}
                            <span>Retry Processing</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Pipeline Stage Indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {STAGES.map((s, idx) => {
                    const stageIndex = idx + 1;
                    const activeIndex = Math.ceil((percent / 100) * STAGES.length);
                    const isDone = stageIndex < activeIndex || percent === 100;
                    const isCurrent = stageIndex === activeIndex && !isDone && !isFailed;

                    return (
                        <div
                            key={s.key}
                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs transition-all ${
                                isDone
                                    ? 'bg-emerald-500/5 border-emerald-500/20 text-zinc-200'
                                    : isCurrent
                                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                                    : 'bg-[#09090b]/50 border-[#27272a] text-zinc-600'
                            }`}
                        >
                            {isDone ? (
                                <CheckCircleIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : isCurrent ? (
                                <ArrowPathIcon className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                            ) : (
                                <div className="w-4 h-4 rounded-full border border-zinc-700 shrink-0" />
                            )}
                            <span className="truncate">{s.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
