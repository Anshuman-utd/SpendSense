"use client";

import { useState } from 'react';
import { CloudArrowUpIcon, DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function ScanReceiptPage() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);

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

  const handleScan = () => {
    if (!file) return;
    setScanning(true);
    // Simulation of scanning process
    setTimeout(() => {
        setScanning(false);
        alert("Scan complete! (This is a simplified demo, AI integration would happen here)");
        // In real app, we would redirect to Add Expense modal pre-filled with scanned data
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Scan Receipt</h1>
      <p className="text-zinc-400">Upload a receipt to automatically extract expense details using AI.</p>

      <div className="max-w-2xl mx-auto mt-10">
        {!file ? (
            <div 
              className={`relative border-2 border-dashed rounded-3xl p-12 text-center transition-all ${dragActive ? 'border-emerald-500 bg-emerald-500/5' : 'border-[#27272a] hover:border-zinc-500'}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
                <input 
                    type="file" 
                    id="receipt-upload" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleChange}
                    accept="image/*,.pdf"
                />
                <div className="flex flex-col items-center justify-center pointer-events-none">
                    <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-4 text-emerald-500">
                        <CloudArrowUpIcon className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Click or drag receipt here</h3>
                    <p className="text-zinc-500 text-sm">Supports JPG, PNG, PDF (Max 5MB)</p>
                </div>
            </div>
        ) : (
            <div className="bg-[#18181b] border border-[#27272a] rounded-3xl p-8">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                            <DocumentTextIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-white font-medium">{file.name}</p>
                            <p className="text-zinc-500 text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setFile(null)} 
                        className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                        disabled={scanning}
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {scanning ? (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-white font-medium">Scanning receipt...</p>
                        <p className="text-zinc-500 text-sm mt-1">Extracting merchant, date, and items</p>
                    </div>
                ) : (
                    <button 
                        onClick={handleScan}
                        className="w-full py-4 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors"
                    >
                        Start Scanning
                    </button>
                )}
            </div>
        )}
      </div>
    </div>
  );
}
