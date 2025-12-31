
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  HomeIcon,
  BanknotesIcon,
  ChartBarIcon,
  SparklesIcon,
  CameraIcon,
  WalletIcon,
  ArrowPathIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import clsx from 'clsx';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Expenses', href: '/expenses', icon: BanknotesIcon },
  { name: 'Scan Receipt', href: '/scan-receipt', icon: CameraIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'AI Insights', href: '/ai-insights', icon: SparklesIcon },
  { name: 'Budget', href: '/budget', icon: WalletIcon },
  { name: 'Recurring', href: '#', icon: ArrowPathIcon },
  { name: 'Settings', href: '#', icon: Cog6ToothIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-screen flex-col justify-between border-r border-[#1a1a1a] bg-[#09090b] w-64 fixed left-0 top-0 z-40">
      <div className="px-4 py-6">
        <Link href="/" className="flex items-center gap-3 px-2 mb-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <SparklesIcon className="h-5 w-5 text-emerald-500" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">SpendSense</span>
        </Link>
        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-500'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white',
                  'group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all'
                )}
              >
                <item.icon
                  className={clsx(
                    isActive ? 'text-emerald-500' : 'text-zinc-400 group-hover:text-white',
                    'mr-3 h-5 w-5 flex-shrink-0'
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4">
        <div className="rounded-xl bg-gradient-to-br from-emerald-900/20 to-zinc-900 border border-emerald-500/10 p-4">
          <h3 className="font-semibold text-white text-sm mb-1">Pro Tips</h3>
          <p className="text-xs text-zinc-400 mb-2">Scan receipts with AI for instant expense logging</p>
        </div>
      </div>
    </div>
  );
}
