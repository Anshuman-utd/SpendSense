import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { 
  BoltIcon, 
  ShieldCheckIcon, 
  CurrencyDollarIcon,
  CameraIcon,
  ChartBarIcon,
  SparklesIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-emerald-500/30 font-sans">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none opacity-50"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none opacity-30"></div>

        <div className="relative z-10 max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 text-xs font-medium uppercase tracking-wider backdrop-blur-sm">
             <BoltIcon className="w-3.5 h-3.5" />
             <span>AI-Powered Expense Tracking</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
            Track Expenses, <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-500">
              Gain Sense
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            The intelligent expense tracker that scans receipts, provides <span className='text-emerald-400/80'>AI insights</span>,
            and helps you make smarter financial decisions.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Link
              href="/auth/signup"
              className="group px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-full transition-all hover:scale-105 shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2"
            >
              Get Started Free 
              <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="#"
              className="px-8 py-4 bg-transparent border border-white/10 hover:border-white/20 hover:bg-white/5 text-white font-medium rounded-full transition-all"
            >
              Learn More
            </Link>
          </div>
          
          <div className="flex flex-wrap gap-6 md:gap-12 justify-center pt-16 text-sm text-slate-500 font-medium">
             <div className="flex items-center gap-2">
               <ShieldCheckIcon className="w-5 h-5 text-emerald-500" />
               <span>Bank-level security</span>
             </div>
             <div className="flex items-center gap-2">
               <BoltIcon className="w-5 h-5 text-emerald-500" />
               <span>Lightning fast</span>
             </div>
             <div className="flex items-center gap-2">
               <CurrencyDollarIcon className="w-5 h-5 text-emerald-500" />
               <span>Free to start</span>
             </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Everything you need</h2>
          <p className="text-slate-400">Powerful features to help you grow your wealth.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-3xl hover:border-emerald-500/30 transition-all group hover:bg-white/[0.02]">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <CameraIcon className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">AI Receipt Scanner</h3>
            <p className="text-slate-400 leading-relaxed text-sm">
              Simply snap a photo of your receipt and let AI extract amounts, dates, and categories automatically.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-3xl hover:border-cyan-500/30 transition-all group hover:bg-white/[0.02]">
            <div className="w-12 h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <SparklesIcon className="w-6 h-6 text-cyan-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Smart Insights</h3>
            <p className="text-slate-400 leading-relaxed text-sm">
               Get personalized AI-powered recommendations to cut costs and optimize your monthly budget.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-3xl hover:border-purple-500/30 transition-all group hover:bg-white/[0.02]">
            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <ChartBarIcon className="w-6 h-6 text-purple-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Visual Analytics</h3>
            <p className="text-slate-400 leading-relaxed text-sm">
               Beautiful clean charts that make understanding your spending patterns and trends effortless.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
