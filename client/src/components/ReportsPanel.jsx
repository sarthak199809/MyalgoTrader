import React, { useState, useEffect } from 'react';
import { formatIST } from '../utils/timeUtils';
import { API_BASE_URL } from '../config';
import { FileText, Download, Trash2, Eye, Award, TrendingUp, TrendingDown, Percent, BarChart, FileCheck, CheckCircle } from 'lucide-react';

export default function ReportsPanel() {
  const [reports, setReports] = useState([]);
  const [activeReport, setActiveReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports`);
      const data = await res.json();
      setReports(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleViewReport = async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports/${id}`);
      const data = await res.json();
      setActiveReport(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (id) => {
    if (!window.confirm('Delete this report?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/reports/${id}`, { method: 'DELETE' });
      if (activeReport && activeReport.id === id) setActiveReport(null);
      await fetchReports();
    } catch (err) {
      console.error(err);
    }
  };

  const exportReportCsv = (report) => {
    if (!report || !report.trades) return;
    const headers = ['Trade ID', 'Side', 'Entry Time (IST)', 'Exit Time (IST)', 'Entry Price', 'Exit Price', 'PnL ($)', 'PnL (%)', 'Exit Reason'];
    const rows = report.trades.map(t => [
      t.id,
      t.side,
      `"${formatIST(t.entryTime)}"`,
      `"${formatIST(t.exitTime)}"`,
      t.entryPrice,
      t.exitPrice,
      t.pnl,
      t.pnlPct,
      t.exitReason
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${report.strategy_name}_${report.timeframe}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 shadow-xl flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-gold-400" /> Strategy Performance Reports
          </h2>
          <p className="text-xs text-slate-400">View, analyze, and export historical backtesting strategy reports</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 space-y-3">
          <h3 className="font-bold text-white text-xs font-mono uppercase tracking-wider">
            Saved Reports ({reports.length})
          </h3>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {reports.length === 0 ? (
              <div className="text-xs text-slate-500 py-6 text-center">No backtest reports saved yet. Execute a backtest to generate reports!</div>
            ) : (
              reports.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleViewReport(r.id)}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                    activeReport && activeReport.id === r.id
                      ? 'bg-dark-700 border-gold-600/60 text-white shadow-md'
                      : 'bg-dark-900/60 border-dark-600 text-slate-300 hover:bg-dark-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-amber-300 truncate">{r.strategy_name}</span>
                    <span className="bg-gold-600/20 text-gold-400 border border-gold-600/30 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                      {r.timeframe.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2 font-mono text-[11px]">
                    <div>Profit: <strong className={r.metrics.totalNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>${r.metrics.totalNetProfit}</strong></div>
                    <div>Win Rate: <strong className="text-gold-400">{r.metrics.winRatePct}%</strong></div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 font-mono border-t border-dark-700 pt-1.5">
                    <span>{formatIST(r.created_at)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteReport(r.id); }}
                      className="text-slate-500 hover:text-rose-400 p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-6 shadow-xl">
          {activeReport ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-dark-600 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white">{activeReport.strategy_name}</h2>
                    <span className="bg-gold-600/20 text-gold-400 border border-gold-600/30 text-xs px-2.5 py-0.5 rounded font-mono font-bold">
                      {activeReport.timeframe.toUpperCase()} Timeframe
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">Generated: {formatIST(activeReport.created_at)}</p>
                </div>

                <button
                  onClick={() => exportReportCsv(activeReport)}
                  className="flex items-center gap-2 bg-gradient-to-r from-gold-600 to-amber-500 text-black font-bold text-xs px-3.5 py-2 rounded-lg shadow-md hover:from-gold-500 hover:to-amber-400 transition-all font-mono"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Trades CSV</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-dark-900 border border-dark-600 rounded-xl p-3">
                  <div className="text-[11px] text-slate-400">Total Net Profit</div>
                  <div className={`text-lg font-bold font-mono ${activeReport.metrics.totalNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${activeReport.metrics.totalNetProfit}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Return: {activeReport.metrics.returnPct}%</div>
                </div>

                <div className="bg-dark-900 border border-dark-600 rounded-xl p-3">
                  <div className="text-[11px] text-slate-400">Win Rate %</div>
                  <div className="text-lg font-bold font-mono text-gold-400">
                    {activeReport.metrics.winRatePct}%
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">{activeReport.metrics.winTradesCount} / {activeReport.metrics.totalTrades} Won</div>
                </div>

                <div className="bg-dark-900 border border-dark-600 rounded-xl p-3">
                  <div className="text-[11px] text-slate-400">Profit Factor</div>
                  <div className="text-lg font-bold font-mono text-blue-400">
                    {activeReport.metrics.profitFactor}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Gross: ${activeReport.metrics.grossProfit}</div>
                </div>

                <div className="bg-dark-900 border border-dark-600 rounded-xl p-3">
                  <div className="text-[11px] text-slate-400">Max Drawdown</div>
                  <div className="text-lg font-bold font-mono text-rose-400">
                    -{activeReport.metrics.maxDrawdownPct}%
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">-${activeReport.metrics.maxDrawdownDollars}</div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-white font-mono">Executed Trades Log ({activeReport.trades.length})</h3>
                <div className="overflow-x-auto max-h-80 border border-dark-600 rounded-xl bg-dark-900">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-dark-600 text-slate-400 font-mono bg-dark-900 sticky top-0">
                        <th className="py-2 px-3">Side</th>
                        <th className="py-2 px-3">Entry Time (IST)</th>
                        <th className="py-2 px-3">Exit Time (IST)</th>
                        <th className="py-2 px-3">Entry</th>
                        <th className="py-2 px-3">Exit</th>
                        <th className="py-2 px-3">PnL ($)</th>
                        <th className="py-2 px-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-700/60 font-mono">
                      {activeReport.trades.map((t) => (
                        <tr key={t.id} className="hover:bg-dark-700/40">
                          <td className="py-1.5 px-3 font-bold">
                            <span className={t.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{t.side}</span>
                          </td>
                          <td className="py-1.5 px-3 text-slate-300">{formatIST(t.entryTime)}</td>
                          <td className="py-1.5 px-3 text-slate-300">{formatIST(t.exitTime)}</td>
                          <td className="py-1.5 px-3 text-slate-200">${t.entryPrice}</td>
                          <td className="py-1.5 px-3 text-slate-200">${t.exitPrice}</td>
                          <td className={`py-1.5 px-3 font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.pnl >= 0 ? '+' : ''}${t.pnl}
                          </td>
                          <td className="py-1.5 px-3 text-slate-400 text-[11px]">{t.exitReason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center text-slate-500 text-sm font-mono space-y-2">
              <Eye className="w-8 h-8 mx-auto text-slate-600" />
              <p>Select a report from the list on the left to view metrics & export trades.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
