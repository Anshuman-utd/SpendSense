import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-[#09090b] text-white">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen scrollbar-hide">
        {children}
      </main>
    </div>
  );
}
