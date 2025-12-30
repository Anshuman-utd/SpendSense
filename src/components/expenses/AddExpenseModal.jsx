"use client";

import { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, BanknotesIcon, CalendarIcon, TagIcon, BuildingStorefrontIcon, CreditCardIcon, DocumentTextIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Housing', 'Utilities', 'Health', 'Education', 'Personal', 'Other'];
const PAYMENT_METHODS = ['Credit Card', 'Debit Card', 'Cash', 'Bank Transfer', 'Mobile Payment', 'Other'];

export default function AddExpenseModal({ isOpen, onClose, onExpenseAdded }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    category: '',
    merchant: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'Credit Card',
    description: '',
    receiptUrl: '',
    isRecurring: false
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           ...formData,
           amount: parseFloat(formData.amount)
        })
      });

      const data = await res.json();
      if (data.success) {
        onExpenseAdded?.();
        onClose();
        // Reset form
        setFormData({
            amount: '',
            category: '',
            merchant: '',
            date: new Date().toISOString().split('T')[0],
            paymentMethod: 'Credit Card',
            description: '',
            receiptUrl: '',
            isRecurring: false
        });
      }
    } catch (error) {
      console.error('Failed to add expense', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-[#09090b] border border-[#27272a] text-left align-middle shadow-xl transition-all">
                <div className="flex justify-between items-center p-6 border-b border-[#27272a]">
                  <Dialog.Title as="h3" className="text-xl font-bold text-white">
                    Add Expense
                  </Dialog.Title>
                  <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                   {/* Amount */}
                   <div>
                     <label className="block text-sm font-medium text-zinc-400 mb-2">Amount</label>
                     <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-lg">$</span>
                       <input 
                         type="number" 
                         name="amount"
                         step="0.01"
                         required
                         value={formData.amount}
                         onChange={handleChange}
                         placeholder="0.00"
                         className="w-full bg-[#18181b] border border-[#27272a] rounded-xl py-3 pl-10 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-lg font-medium" 
                       />
                     </div>
                   </div>

                   <div className="grid grid-cols-2 gap-5">
                     {/* Category */}
                     <div>
                       <label className="block text-sm font-medium text-zinc-400 mb-2">Category</label>
                       <div className="relative">
                         <TagIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                         <select 
                           name="category"
                           required
                           value={formData.category}
                           onChange={handleChange}
                           className="w-full bg-[#18181b] border border-[#27272a] rounded-xl py-2.5 pl-10 pr-4 text-white appearance-none focus:outline-none focus:border-emerald-500"
                         >
                           <option value="">Select category</option>
                           {CATEGORIES.map(cat => (
                             <option key={cat} value={cat}>{cat}</option>
                           ))}
                         </select>
                       </div>
                     </div>

                     {/* Merchant */}
                     <div>
                       <label className="block text-sm font-medium text-zinc-400 mb-2">Merchant</label>
                       <div className="relative">
                         <BuildingStorefrontIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                         <input 
                           type="text" 
                           name="merchant"
                           value={formData.merchant}
                           onChange={handleChange}
                           placeholder="Store name"
                           className="w-full bg-[#18181b] border border-[#27272a] rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500" 
                         />
                       </div>
                     </div>
                   </div>

                   <div className="grid grid-cols-2 gap-5">
                      {/* Date */}
                      <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-2">Date</label>
                        <div className="relative">
                          <CalendarIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                          <input 
                            type="date" 
                            name="date"
                            required
                            value={formData.date}
                            onChange={handleChange}
                            className="w-full bg-[#18181b] border border-[#27272a] rounded-xl py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500" 
                          />
                        </div>
                      </div>

                      {/* Payment Method */}
                      <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-2">Payment Method</label>
                        <div className="relative">
                          <CreditCardIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                          <select 
                            name="paymentMethod"
                            value={formData.paymentMethod}
                            onChange={handleChange}
                            className="w-full bg-[#18181b] border border-[#27272a] rounded-xl py-2.5 pl-10 pr-4 text-white appearance-none focus:outline-none focus:border-emerald-500"
                          >
                             {PAYMENT_METHODS.map(method => (
                               <option key={method} value={method}>{method}</option>
                             ))}
                          </select>
                        </div>
                      </div>
                   </div>

                   {/* Description */}
                   <div>
                     <label className="block text-sm font-medium text-zinc-400 mb-2">Description (optional)</label>
                     <div className="relative">
                       <DocumentTextIcon className="w-5 h-5 absolute left-3 top-3 text-zinc-500" />
                       <textarea 
                           name="description"
                           rows="2"
                           value={formData.description}
                           onChange={handleChange}
                           placeholder="Add a note..."
                           className="w-full bg-[#18181b] border border-[#27272a] rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none"
                       />
                     </div>
                   </div>

                   {/* Receipt Upload Placeholder */}
                   <div className="border border-dashed border-[#27272a] rounded-xl p-8 flex flex-col items-center justify-center text-zinc-500 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all cursor-pointer group">
                      <ArrowUpTrayIcon className="w-8 h-8 mb-3 group-hover:text-emerald-500 transition-colors" />
                      <p className="text-sm">Drop receipt here or <span className="text-emerald-500">browse</span></p>
                   </div>
                   
                   {/* Recurring Toggle */}
                   <div className="bg-[#18181b] p-4 rounded-xl border border-[#27272a] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="bg-zinc-800 p-2 rounded-lg">
                           <BanknotesIcon className="w-5 h-5 text-zinc-400" />
                         </div>
                         <div>
                            <p className="text-white font-medium text-sm">Recurring expense</p>
                            <p className="text-zinc-500 text-xs">This expense repeats monthly</p>
                         </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          name="isRecurring"
                          checked={formData.isRecurring}
                          onChange={handleChange}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                   </div>

                   {/* Actions */}
                   <div className="flex gap-4 pt-4">
                     <button
                       type="button"
                       onClick={onClose}
                       className="flex-1 py-3 px-4 bg-transparent border border-[#27272a] text-white rounded-xl hover:bg-[#27272a] transition-colors font-medium"
                     >
                       Cancel
                     </button>
                     <button
                       type="submit"
                       disabled={loading}
                       className="flex-1 py-3 px-4 bg-emerald-500 text-black rounded-xl hover:bg-emerald-400 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                       {loading ? 'Saving...' : 'Save Expense'}
                     </button>
                   </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
