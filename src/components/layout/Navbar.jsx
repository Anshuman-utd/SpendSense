"use client";

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { SparklesIcon } from '@heroicons/react/24/solid';

export default function Navbar() {
  const { data: session } = useSession();

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#050505]/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
              <SparklesIcon className="w-5 h-5 text-emerald-500" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">SpendSense</span>
          </Link>
          
          <div className="flex items-center gap-4">
            {session ? (
               <Link 
                 href="/dashboard"
                 className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
               >
                 Dashboard
               </Link>
            ) : (
              <>
                <Link 
                  href="/auth/signin"
                  className="px-5 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link 
                  href="/auth/signup"
                  className="px-5 py-2 text-sm font-medium text-black bg-emerald-400 rounded-full hover:bg-emerald-500 transition-all hover:shadow-[0_0_20px_rgba(52,211,153,0.3)]"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
