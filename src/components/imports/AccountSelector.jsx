"use client";

import { useState } from 'react';
import { BuildingLibraryIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function AccountSelector({ accounts = [], selectedAccountId, onSelect, onAccountCreated }) {
    const [isCreating, setIsCreating] = useState(false);
    const [name, setName] = useState('');
    const [institution, setInstitution] = useState('');
    const [type, setType] = useState('savings');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/imports/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountName: name.trim(),
                    institutionName: institution.trim(),
                    accountType: type
                })
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to create account');
            }

            setName('');
            setInstitution('');
            setIsCreating(false);
            if (onAccountCreated) {
                onAccountCreated(data.data);
            }
            onSelect(data.data._id);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex justify-between items-center">
                <label className="block text-sm font-medium text-zinc-300">
                    Target Bank Account
                </label>
                {!isCreating && (
                    <button
                        type="button"
                        onClick={() => setIsCreating(true)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
                    >
                        <PlusIcon className="w-3.5 h-3.5" />
                        Add New Account
                    </button>
                )}
            </div>

            {!isCreating ? (
                <div className="relative">
                    <BuildingLibraryIcon className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                    <select
                        value={selectedAccountId || ''}
                        onChange={(e) => onSelect(e.target.value)}
                        className="w-full bg-[#18181b] border border-[#27272a] rounded-xl py-2.5 pl-11 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer appearance-none"
                    >
                        {accounts.length === 0 && <option value="">No accounts available</option>}
                        {accounts.map((acc) => (
                            <option key={acc._id} value={acc._id}>
                                {acc.accountName} {acc.institutionName ? `(${acc.institutionName})` : ''} — {acc.accountType} [{acc.currency}]
                            </option>
                        ))}
                    </select>
                </div>
            ) : (
                <form onSubmit={handleCreate} className="p-4 bg-[#18181b] border border-[#27272a] rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">New Financial Account</span>
                        <button
                            type="button"
                            onClick={() => setIsCreating(false)}
                            className="text-zinc-500 hover:text-zinc-300"
                        >
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg border border-red-500/20">{error}</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            type="text"
                            placeholder="Account Name (e.g. HDFC Salary)"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                        />
                        <input
                            type="text"
                            placeholder="Bank / Institution (Optional)"
                            value={institution}
                            onChange={(e) => setInstitution(e.target.value)}
                            className="bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                        />
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                        <button
                            type="button"
                            onClick={() => setIsCreating(false)}
                            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white rounded-lg"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name.trim()}
                            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs rounded-lg transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Save Account'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
