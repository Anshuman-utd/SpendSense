"use client";

import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-[#09090b] text-white">
      <Sidebar />
      <main className="flex-1 ml-64 relative bg-[#09090b]">
           <div className="p-8 h-screen overflow-y-auto scrollbar-hide">
             {children}
           </div>
      </main>
    </div>
  );
}
