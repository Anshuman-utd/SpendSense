"use client";

import { useState } from 'react';
import { jsPDF } from 'jspdf';
import Papa from 'papaparse';
import { useSession } from 'next-auth/react';

export default function ReportsPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState(null);
  const [expenses, setExpenses] = useState([]);

  const fetchExpenses = async () => {
    const res = await fetch('/api/expenses');
    const data = await res.json();
    if (data.success) {
      setExpenses(data.data);
      return data.data;
    }
    return [];
  };

  const generateAIInsights = async () => {
    setLoading(true);
    try {
      const currentExpenses = expenses.length > 0 ? expenses : await fetchExpenses();
      
      // Calculate summary for AI
      const total = currentExpenses.reduce((sum, e) => sum + e.amount, 0);
      const byCategory = currentExpenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      }, {});

      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseSummary: { total, byCategory },
          userBudget: session?.user?.monthlyBudget
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setInsight(data.data);
      }
    } catch (error) {
      console.error(error);
      alert('Failed to generate insights');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    const doc = new jsPDF();
    const data = expenses.length > 0 ? expenses : await fetchExpenses();

    doc.setFontSize(20);
    doc.text("Expense Report", 20, 20);
    
    let y = 40;
    data.forEach((exp, i) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.text(`${exp.date.split('T')[0]} - ${exp.category}: $${exp.amount}`, 20, y);
      doc.setFontSize(10);
      doc.text(exp.description, 20, y + 5);
      y += 15;
    });

    doc.save("expenses.pdf");
  };

  const downloadCSV = async () => {
    const data = expenses.length > 0 ? expenses : await fetchExpenses();
    const csv = Papa.unparse(data.map(e => ({
      Date: e.date.split('T')[0],
      Category: e.category,
      Amount: e.amount,
      Description: e.description,
      Recurring: e.isRecurring ? 'Yes' : 'No'
    })));
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'expenses.csv';
    link.click();
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
          Reports & Insights
        </h1>
        <p className="text-slate-400 mt-2">Analyze your spending and export data.</p>
      </header>

      {/* AI Insights Section */}
      <section className="glass-card p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span>✨</span> AI Financial Advisor
            </h2>
            <button 
              onClick={generateAIInsights}
              disabled={loading}
              className="btn-primary flex items-center gap-2"
            >
              {loading ? 'Analyzing...' : 'Generate New Insights'}
            </button>
          </div>

          {insight ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-2">Summary</h3>
                <p className="text-lg text-slate-200 leading-relaxed">{insight.summary}</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-emerald-900/20 p-6 rounded-xl border border-emerald-500/20">
                  <h3 className="text-emerald-400 font-semibold mb-2 flex items-center gap-2">
                    💡 Money Saving Tip
                  </h3>
                  <p className="text-emerald-100">{insight.tip}</p>
                </div>
                
                <div className="bg-blue-900/20 p-6 rounded-xl border border-blue-500/20">
                  <h3 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
                    📊 Budget Recommendation
                  </h3>
                  <p className="text-blue-100">{insight.budgetRecommendation}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-700 rounded-xl">
              <p>Click "Generate New Insights" to get AI-powered analysis of your spending habits.</p>
            </div>
          )}
        </div>
      </section>

      {/* Export Section */}
      <section className="glass-card p-8">
        <h2 className="text-xl font-semibold text-white mb-6">Export Data</h2>
        <div className="flex gap-4">
          <button onClick={downloadPDF} className="flex-1 btn-secondary py-4 flex flex-col items-center gap-2">
            <span className="text-2xl">📄</span>
            <span>Download PDF Report</span>
          </button>
          <button onClick={downloadCSV} className="flex-1 btn-secondary py-4 flex flex-col items-center gap-2">
            <span className="text-2xl">📊</span>
            <span>Export CSV Data</span>
          </button>
        </div>
      </section>
    </div>
  );
}
