"use client";

import { useForm } from 'react-hook-form';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function EditBudgetModal({ isOpen, onClose, category, currentAmount, onSave }) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      amount: currentAmount
    }
  });

  if (!isOpen) return null;

  const onSubmit = (data) => {
    onSave(category, parseFloat(data.amount));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="bg-[#18181b] rounded-2xl border border-[#27272a] w-full max-w-sm shadow-xl">
        <div className="flex justify-between items-center p-4 border-b border-[#27272a]">
          <h3 className="font-semibold text-white">Set Budget for {category}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Monthly Limit</label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                <input 
                  type="number" 
                  step="0.01"
                  {...register('amount', { required: true, min: 0 })}
                  className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl py-3 pl-7 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="0.00"
                />
            </div>
          </div>
          
          <button 
            type="submit" 
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 rounded-xl transition-colors"
          >
            Save Budget
          </button>
        </form>
      </div>
    </div>
  );
}
