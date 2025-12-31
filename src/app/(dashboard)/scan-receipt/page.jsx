"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CloudArrowUpIcon, DocumentTextIcon, XMarkIcon, SparklesIcon, PhotoIcon } from '@heroicons/react/24/outline';

export default function ScanReceiptPage() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleScan = async () => {
    if (!file) return;
    setScanning(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/ai/receipt', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Scan failed');
        }

        setResult(data.data); // The saved expense
        alert('Receipt scanned and saved successfully!');
        // Optionally redirect or clear
        // router.push('/expenses');
    } catch (err) {
        console.error(err);
        setError(err.message);
    } finally {
        setScanning(false);
    }
  };

  return (
    <div className=" mx-auto">
      <div className="flex justify-between items-center mb-12">
         <h1 className="text-3xl font-bold text-white">Scan Receipt</h1>
      </div>

      <div className="text-center mb-12 space-y-2">
         <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto text-emerald-500 mb-6">
             <SparklesIcon className="w-6 h-6" />
         </div>
         <h2 className="text-3xl font-bold text-white">AI Receipt Scanner</h2>
         <p className="text-zinc-400">Upload or take a photo of your receipt and let AI extract the details</p>
      </div>

      <div className="max-w-2xl mx-auto relative mb-16">
        {/* Main Upload Area */}
        <div 
            className={`border border-[#27272a] bg-[#09090b] rounded-3xl p-16 text-center transition-all ${dragActive ? 'border-emerald-500 bg-emerald-500/5' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
        >
             {!file ? (
                <div className="space-y-6">
                    <div className="w-20 h-20 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                        <PhotoIcon className="w-10 h-10" />
                    </div>
                    <div>
                        <h3 className="text-xl font-medium text-white mb-2">Drop your receipt here</h3>
                        <p className="text-zinc-500 text-sm">or click to browse from your device</p>
                    </div>
                    
                    <div className="pt-4 flex justify-center gap-4">
                        <div className="relative">
                            <input 
                                type="file" 
                                id="receipt-upload" 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                onChange={handleChange}
                                accept="image/*,.pdf"
                            />
                            <button className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center gap-2 transition-colors">
                                <CloudArrowUpIcon className="w-5 h-5" />
                                Upload Receipt
                            </button>
                        </div>
                    </div>
                </div>
             ) : (
                <div className="py-8">
                     <div className="flex items-center justify-center gap-4 mb-8">
                        <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                            <DocumentTextIcon className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                            <p className="text-white font-medium">{file.name}</p>
                            <p className="text-zinc-500 text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <button 
                            onClick={() => { setFile(null); setResult(null); setError(null); }} 
                            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors ml-4"
                            disabled={scanning}
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>

                    {error && (
                         <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                             {error}
                         </div>
                    )}

                    {result && (
                         <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
                             Expense saved: {result.title} - ${result.amount}
                         </div>
                    )}

                    {scanning ? (
                        <div className="text-center">
                            <div className="w-16 h-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-white font-medium">Scanning receipt...</p>
                        </div>
                    ) : (
                        <button 
                            onClick={handleScan}
                            className="w-full max-w-xs mx-auto py-3 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors"
                            disabled={!!result}
                        >
                            {result ? 'Scanned Successfully' : 'Start Scanning'}
                        </button>
                    )}
                </div>
             )}
        </div>
        {/* Dashed Border Overlay Effect */}
        <div className="absolute inset-4 border-2 border-dashed border-[#27272a] rounded-2xl pointer-events-none"></div>
      </div>
    </div>
  );
}
