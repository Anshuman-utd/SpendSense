"use client";

import { useState, useEffect } from 'react';
import { SparklesIcon, LightBulbIcon, ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function AIInsightsPage() {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      const res = await fetch('/api/ai/insights');
      const data = await res.json();
      if (data.success) {
        setInsight(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateNewInsights = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-insights', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setInsight(data.data);
      } else {
        alert('Failed to generate insights: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error generating insights:', error);
      alert('Error generating insights');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">Loading insights...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-3xl font-bold text-white mb-2">AI Insights</h1>
           <p className="text-zinc-400">Personalized financial advice powered by AI</p>
        </div>
        <button 
          onClick={generateNewInsights}
          disabled={generating}
          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
             <ArrowPathIcon className="w-5 h-5 animate-spin" />
          ) : (
             <SparklesIcon className="w-5 h-5" />
          )}
          {generating ? 'Analyzing...' : 'Generate New Insights'}
        </button>
      </div>

      {!insight ? (
        <div className="text-center py-20 bg-[#09090b] border border-[#27272a] rounded-3xl">
           <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto text-zinc-500 mb-4">
                <LightBulbIcon className="w-8 h-8" />
           </div>
           <h3 className="text-xl font-medium text-white mb-2">No insights yet</h3>
           <p className="text-zinc-500 max-w-md mx-auto mb-8">
             Click the button above to analyze your recent spending and get personalized tips.
           </p>
        </div>
      ) : (
        <div className="grid gap-6">
           {/* Summary Card */}
           <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 p-8 rounded-3xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                  <SparklesIcon className="w-32 h-32 text-indigo-500" />
              </div>
              <div className="relative z-10">
                  <h2 className="text-xl font-semibold text-indigo-400 mb-4 flex items-center gap-2">
                    <SparklesIcon className="w-6 h-6" />
                    Monthly Overview
                  </h2>
                  <p className="text-2xl text-white leading-relaxed font-light">
                    "{insight.data.summary}"
                  </p>
              </div>
           </div>

           <div className="grid md:grid-cols-2 gap-6">
              {/* Problems/Observations */}
              <div className="bg-[#09090b] border border-[#27272a] p-6 rounded-3xl">
                  <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                     <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />
                     Areas for Attention
                  </h3>
                  <div className="space-y-4">
                     {insight.data.problems?.map((problem, idx) => (
                        <div key={idx} className="flex gap-4 p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                            <div className="shrink-0 w-2 h-2 mt-2 rounded-full bg-amber-500" />
                            <p className="text-zinc-300">{problem}</p>
                        </div>
                     ))}
                  </div>
              </div>

              {/* Tips */}
              <div className="bg-[#09090b] border border-[#27272a] p-6 rounded-3xl">
                   <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                     <LightBulbIcon className="w-5 h-5 text-emerald-500" />
                     Smart Tips
                  </h3>
                  <div className="space-y-4">
                     {insight.data.tips?.map((tip, idx) => (
                        <div key={idx} className="flex gap-4 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                            <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 text-xs font-bold">
                                {idx + 1}
                            </div>
                            <p className="text-zinc-300">{tip}</p>
                        </div>
                     ))}
                  </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
