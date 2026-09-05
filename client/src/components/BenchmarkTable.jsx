import React from 'react';
import { Award, ShieldAlert, CheckCircle2, Info } from 'lucide-react';

export const BENCHMARKS_DATA = [
  { metric: 'Annual Return (CAGR)', pro: '15% – 30%', retail: '10% – 25%', redFlag: '> 80%+ consistently without extreme leverage' },
  { metric: 'Win Rate (Trend/Momentum)', pro: '35% – 45%', retail: '30% – 40%', redFlag: '> 55%' },
  { metric: 'Win Rate (Mean Reversion)', pro: '55% – 65%', retail: '50% – 60%', redFlag: '> 75%' },
  { metric: 'Sharpe Ratio', pro: '1.2 – 2.0', retail: '0.8 – 1.5', redFlag: '> 3.0 (almost always a backtest artifact)' },
  { metric: 'Profit Factor', pro: '1.3 – 1.8', retail: '1.2 – 1.5', redFlag: '> 2.5 over large trade sample' },
  { metric: 'Max Drawdown (MDD)', pro: '10% – 20%', retail: '15% – 30%', redFlag: '< 5% over multi-year cycles' }
];

export default function BenchmarkTable() {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 sm:p-5 space-y-3 shadow-xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 font-mono">
          <Award className="w-4 h-4 text-gold-400" /> Realistic Live Performance Benchmarks
        </h3>
        <span className="text-[11px] text-slate-400 font-mono">Compare your backtest metrics against quant standards</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse font-mono">
          <thead>
            <tr className="border-b border-dark-600 text-slate-400 bg-dark-900/60">
              <th className="py-2.5 px-3">Metric</th>
              <th className="py-2.5 px-3 text-emerald-400">Realistic (Institutional / Pro)</th>
              <th className="py-2.5 px-3 text-blue-400">Realistic (Independent Retail Quant)</th>
              <th className="py-2.5 px-3 text-rose-400">Red Flag / Overfitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-700/60 text-[11px]">
            {BENCHMARKS_DATA.map((b, idx) => (
              <tr key={idx} className="hover:bg-dark-700/40">
                <td className="py-2 px-3 font-semibold text-slate-200">{b.metric}</td>
                <td className="py-2 px-3 text-emerald-300 font-bold bg-emerald-950/20">{b.pro}</td>
                <td className="py-2 px-3 text-blue-300 font-bold bg-blue-950/20">{b.retail}</td>
                <td className="py-2 px-3 text-rose-400 font-bold bg-rose-950/20">{b.redFlag}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
