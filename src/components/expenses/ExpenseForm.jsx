"use client";

import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Shopping', 'Utilities', 'Health', 'Education', 'Other'];

export default function ExpenseForm({ expense = null }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    defaultValues: expense || {
      amount: '',
      description: '',
      category: 'Food',
      date: new Date().toISOString().split('T')[0],
      isRecurring: false,
    }
  });

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      const url = expense ? `/api/expenses/${expense._id}` : '/api/expenses';
      const method = expense ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        router.refresh();
        router.push('/expenses');
      } else {
        // Handle error
        alert('Failed to save expense');
      }
    } catch (error) {
       console.error(error);
       alert('An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Amount</label>
            <input 
              type="number" 
              step="0.01" 
              {...register('amount', { required: 'Amount is required' })}
              className="w-full glass-input px-4 py-3"
              placeholder="0.00"
            />
            {errors.amount && <p className="text-red-400 text-xs">{errors.amount.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Category</label>
            <select 
              {...register('category')}
              className="w-full glass-input px-4 py-3 bg-slate-900"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
       </div>

       <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Description</label>
          <input 
            type="text" 
            {...register('description', { required: 'Description is required' })}
            className="w-full glass-input px-4 py-3"
            placeholder="Dinner at Joe's"
          />
          {errors.description && <p className="text-red-400 text-xs">{errors.description.message}</p>}
       </div>

       <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Date</label>
          <input 
            type="date" 
            {...register('date', { required: 'Date is required' })}
            className="w-full glass-input px-4 py-3"
          />
       </div>
       
       <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Receipt / Image</label>
          <div className="flex gap-4">
             <button
               type="button"
               onClick={() => document.getElementById('receipt-upload').click()}
               className="btn-secondary flex-1"
               disabled={isSubmitting}
             >
               {isSubmitting ? 'Processing...' : '📷 Scan Receipt (AI)'}
             </button>
             <input 
               id="receipt-upload" 
               type="file" 
               accept="image/*" 
               className="hidden" 
               onChange={async (e) => {
                 const file = e.target.files[0];
                 if (!file) return;
                 
                 setIsSubmitting(true);
                 try {
                   // 1. Upload
                   const formData = new FormData();
                   formData.append('file', file);
                   const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
                   const uploadData = await uploadRes.json();
                   
                   if (!uploadData.success) throw new Error('Upload failed');
                   
                   // 2. Scan
                   const scanRes = await fetch('/api/ai/scan', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ imageUrl: uploadData.url })
                   });
                   const scanData = await scanRes.json();
                   
                   if (!scanData.success) throw new Error('Scan failed');
                   
                   // 3. Populate Form
                   const { amount, date, category, description } = scanData.data;
                   if (amount) setValue('amount', amount);
                   if (date) setValue('date', date);
                   if (category) setValue('category', category); // Might need mapping if categorical mismatch
                   if (description) setValue('description', description);
                   
                 } catch (err) {
                   console.error(err);
                   alert('Failed to scan receipt. Please enter details manually.');
                 } finally {
                   setIsSubmitting(false);
                 }
               }}
             />
          </div>
       </div>

       <button 
          type="submit" 
          disabled={isSubmitting}
          className="w-full btn-primary py-3 text-lg"
       >
          {isSubmitting ? 'Saving...' : (expense ? 'Update Expense' : 'Add Expense')}
       </button>
    </form>
  );
}
