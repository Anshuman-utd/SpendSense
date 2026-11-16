"use client";

import {
    DocumentTextIcon,
    ShoppingBagIcon,
    ArrowDownLeftIcon,
    ExclamationTriangleIcon,
    CheckBadgeIcon,
    CurrencyRupeeIcon,
    BanknotesIcon
} from '@heroicons/react/24/outline';
import { CURRENCY_SYMBOLS } from '@/lib/imports/constants';

export default function ImportSummaryCards({
    totalRows = 0,
    validRows = 0,
    duplicateRows = 0,
    creditRows = 0,
    invalidRows = 0,
    approvedRows = 0,
    selectedAmountTotal = 0,
    currency = 'INR'
}) {
    const symbol = CURRENCY_SYMBOLS[currency] || currency;

    const cards = [
        {
            label: 'Total Parsed Rows',
            value: totalRows,
            sub: `${validRows} valid rows`,
            icon: DocumentTextIcon,
            color: 'text-zinc-400',
            bg: 'bg-zinc-800/50'
        },
        {
            label: 'Eligible Expenses',
            value: validRows - creditRows,
            sub: 'Spending transactions',
            icon: ShoppingBagIcon,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10'
        },
        {
            label: 'Credits / Income',
            value: creditRows,
            sub: 'Excluded from spending',
            icon: ArrowDownLeftIcon,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10'
        },
        {
            label: 'Possible Duplicates',
            value: duplicateRows,
            sub: duplicateRows > 0 ? 'Deselected for review' : 'No duplicates detected',
            icon: ExclamationTriangleIcon,
            color: duplicateRows > 0 ? 'text-amber-400' : 'text-zinc-500',
            bg: duplicateRows > 0 ? 'bg-amber-500/10' : 'bg-zinc-800/50'
        },
        {
            label: 'Selected for Import',
            value: approvedRows,
            sub: `${symbol}${selectedAmountTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total`,
            icon: CheckBadgeIcon,
            color: 'text-emerald-300',
            bg: 'bg-emerald-500/20'
        }
    ];

    if (invalidRows > 0) {
        cards.push({
            label: 'Invalid Rows',
            value: invalidRows,
            sub: 'Malformed date/amount',
            icon: ExclamationTriangleIcon,
            color: 'text-red-400',
            bg: 'bg-red-500/10'
        });
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {cards.map((card, idx) => (
                <div key={idx} className="bg-[#18181b] border border-[#27272a] rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-medium text-zinc-400">{card.label}</span>
                        <div className={`p-2 rounded-xl ${card.bg} ${card.color}`}>
                            <card.icon className="w-4 h-4" />
                        </div>
                    </div>
                    <div>
                        <h4 className="text-xl font-bold text-white">{card.value}</h4>
                        <p className="text-[11px] text-zinc-500 truncate mt-0.5">{card.sub}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}
