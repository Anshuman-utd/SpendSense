import { SparklesIcon } from '@heroicons/react/24/solid';

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#050505] py-12 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
               <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center">
                 <SparklesIcon className="w-4 h-4 text-emerald-500" />
               </div>
               <span className="text-lg font-bold text-white tracking-tight">SpendSense</span>
            </div>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
              AI-powered expense tracking that helps you makes smarter financial decisions.
            </p>
          </div>
          
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm">Product</h3>
            <ul className="space-y-3 text-sm text-slate-500">
              <li><a href="#" className="hover:text-emerald-400 transition-colors">Features</a></li>
              <li><a href="#" className="hover:text-emerald-400 transition-colors">Pricing</a></li>
              <li><a href="#" className="hover:text-emerald-400 transition-colors">About</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm">Legal</h3>
            <ul className="space-y-3 text-sm text-slate-500">
               <li><a href="#" className="hover:text-emerald-400 transition-colors">Privacy</a></li>
               <li><a href="#" className="hover:text-emerald-400 transition-colors">Terms</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 mt-12 pt-8 text-center text-slate-600 text-sm">
          © {new Date().getFullYear()} SpendSense. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
