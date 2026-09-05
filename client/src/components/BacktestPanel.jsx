import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { formatIST } from '../utils/timeUtils';
import { API_BASE_URL } from '../config';
import BenchmarkTable from './BenchmarkTable';
import { Play, TrendingUp, TrendingDown, DollarSign, Award, Percent, BarChart, FileCheck, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, Zap, Calendar } from 'lucide-react';

const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 50, 100, 200, 400, 500];

const MONTHS = [
  { label: 'All Months', value: '' },
  { label: 'January (01)', value: '0' },
  { label: 'February (02)', value: '1' },
  { label: 'March (03)', value: '2' },
  { label: 'April (04)', value: '3' },
  { label: 'May (05)', value: '4' },
  { label: 'June (06)', value: '5' },
  { label: 'July (07)', value: '6' },
  { label: 'August (08)', value: '7' },
  { label: 'September (09)', value: '8' },
  { label: 'October (10)', value: '9' },
  { label: 'November (11)', value: '10' },
  { label: 'December (12)', value: '11' }
];

export default function BacktestPanel({ onShowTradeMarkersOnChart }) {
  const [strategies, setStrategies] = useState([]);
  const [selectedStratId, setSelectedStratId] = useState('ema_crossover');
  const [timeframe, setTimeframe] = useState('15m');
  const [initialBalance, setInitialBalance] = useState(10000);
  const [qty, setQty] = useState(10);
  const [leverage, setLeverage] = useState(100);
  const [spread, setSpread] = useState(0.30);
  const [slPct, setSlPct] = useState(0.5);
  const [tpPct, setTpPct] = useState(1.0);

  // Date Filtering Controls
  const [availableYears, setAvailableYears] = useState([2023, 2024, 2025, 2026]);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [dataInfo, setDataInfo] = useState(null);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [reportSaved, setReportSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/strategies`)
      .then(res => res.json())
      .then(data => {
        setStrategies(data || []);
        if (data && data.length > 0) setSelectedStratId(data[0].id);
      })
      .catch(console.error);

    fetch(`${API_BASE_URL}/api/data/info`)
      .then(res => res.json())
      .then(data => {
        setDataInfo(data);
        if (data.availableYears && data.availableYears.length > 0) {
          setAvailableYears(data.availableYears);
        }
      })
      .catch(console.error);
  }, []);

  const computeTimestamps = () => {
    let startTs = null;
    let endTs = null;

    if (customStartDate && customEndDate) {
      startTs = new Date(`${customStartDate}T00:00:00Z`).getTime();
      endTs = new Date(`${customEndDate}T23:59:59Z`).getTime();
      return { startTs, endTs };
    }

    if (selectedYear) {
      const yearInt = parseInt(selectedYear, 10);
      if (selectedMonth !== '') {
        const monthInt = parseInt(selectedMonth, 10);
        startTs = new Date(Date.UTC(yearInt, monthInt, 1, 0, 0, 0)).getTime();
        // Last day of month
        endTs = new Date(Date.UTC(yearInt, monthInt + 1, 0, 23, 59, 59)).getTime();
      } else {
        startTs = new Date(Date.UTC(yearInt, 0, 1, 0, 0, 0)).getTime();
        endTs = new Date(Date.UTC(yearInt, 11, 31, 23, 59, 59)).getTime();
      }
    }

    return { startTs, endTs };
  };

  const handleRunBacktest = async () => {
    setRunning(true);
    setError(null);
    setReportSaved(false);

    try {
      const selectedStrat = strategies.find(s => s.id === selectedStratId);
      if (!selectedStrat) throw new Error('Selected strategy not found.');

      const { startTs, endTs } = computeTimestamps();

      const payload = {
        strategyName: selectedStrat.name,
        strategyCode: selectedStrat.code,
        strategyParams: {
          ...JSON.parse(selectedStrat.params || '{}'),
          slPct: parseFloat(slPct),
          tpPct: parseFloat(tpPct)
        },
        timeframe,
        initialBalance: parseFloat(initialBalance),
        qty: parseFloat(qty),
        leverage: parseFloat(leverage),
        spread: parseFloat(spread),
        startTs,
        endTs,
        saveReport: true
      };

      const res = await fetch(`${API_BASE_URL}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Backtest execution failed');

      setResult(data);
      if (data.reportId) setReportSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const selectedStratObj = strategies.find(s => s.id === selectedStratId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 px-2 sm:px-4">
      
      {/* Dataset Summary Banner */}
      {dataInfo && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 sm:p-4 shadow-xl flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gold-400" />
            <span className="text-slate-300 font-bold">Historical Gold Dataset:</span>
            <span className="text-emerald-400 font-bold">{dataInfo.totalCandles1m.toLocaleString()} 1-minute bars</span>
            <span className="text-slate-400">({availableYears.join(', ')})</span>
          </div>
          <div className="text-slate-400 text-[11px]">
            Data Range: <strong className="text-slate-200">{formatIST(dataInfo.minTimestamp)}</strong> to <strong className="text-slate-200">{formatIST(dataInfo.maxTimestamp)}</strong>
          </div>
        </div>
      )}

      {/* Control Configuration Header Panel */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 sm:p-5 shadow-xl space-y-4">
        <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
          <Play className="w-5 h-5 text-gold-400" /> Strategy Backtesting Setup
        </h2>

        {/* Date Filter & Selection Row */}
        <div className="p-3 bg-dark-900 border border-dark-600 rounded-xl space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-mono font-bold text-slate-300">
            <span className="flex items-center gap-1.5 text-gold-400">
              <Calendar className="w-4 h-4" /> Multi-Year & Month Data Selection
            </span>
            <span className="text-[11px] text-slate-400 font-normal">Choose specific year, month, or custom date window</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
            <div>
              <label className="text-[11px] text-slate-400 mb-1 block">Filter By Year</label>
              <select
                value={selectedYear}
                onChange={(e) => { setSelectedYear(e.target.value); setCustomStartDate(''); setCustomEndDate(''); }}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-bold"
              >
                <option value="">All Available Years (2023 - 2026)</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>Year {y}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 mb-1 block">Filter By Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(e.target.value); setCustomStartDate(''); setCustomEndDate(''); }}
                disabled={!selectedYear}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              >
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 mb-1 block">Custom Start Date</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => { setCustomStartDate(e.target.value); setSelectedYear(''); setSelectedMonth(''); }}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-2 py-1 text-xs text-slate-200"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 mb-1 block">Custom End Date</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => { setCustomEndDate(e.target.value); setSelectedYear(''); setSelectedMonth(''); }}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-2 py-1 text-xs text-slate-200"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Select Strategy Script</label>
            <select
              value={selectedStratId}
              onChange={(e) => setSelectedStratId(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-gold-600"
            >
              {strategies.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {selectedStratObj && (
              <p className="text-[11px] text-slate-400 truncate">{selectedStratObj.description}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Bar Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-gold-600 font-mono"
            >
              {['1m', '2m', '5m', '10m', '15m', '30m', '1h', '2h', '6h', '12h', '1d', '1w'].map(tf => (
                <option key={tf} value={tf}>{tf.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Initial Balance ($)</label>
            <input
              type="number"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-gold-600 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium flex items-center justify-between">
              <span>Account Leverage</span>
              <span className="text-amber-400 font-mono font-bold flex items-center gap-0.5">
                <Zap className="w-3 h-3" /> {leverage}x
              </span>
            </label>
            <select
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-amber-300 font-mono font-bold focus:outline-none focus:border-gold-600"
            >
              {LEVERAGE_OPTIONS.map(lev => (
                <option key={lev} value={lev}>1:{lev} Leverage ({lev}x)</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Position Size (Oz Gold)</label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-gold-600 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Stop Loss (%)</label>
            <input
              type="number"
              step="0.1"
              value={slPct}
              onChange={(e) => setSlPct(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-gold-600 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Take Profit (%)</label>
            <input
              type="number"
              step="0.1"
              value={tpPct}
              onChange={(e) => setTpPct(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-gold-600 font-mono"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleRunBacktest}
              disabled={running}
              className="w-full bg-gradient-to-r from-gold-600 via-amber-500 to-yellow-400 hover:from-gold-500 hover:to-yellow-300 text-black font-bold py-2.5 px-4 rounded-lg shadow-lg shadow-gold-600/20 transition-all flex items-center justify-center gap-2 text-sm font-mono"
            >
              <Play className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
              <span>{running ? 'Simulating Backtest...' : 'Execute Backtest'}</span>
            </button>
          </div>

        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-950/60 border border-rose-500/40 rounded-lg flex items-center gap-3 text-rose-300 text-sm font-mono">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-6">
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 sm:p-4 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Net Profit</span>
                {result.metrics.totalNetProfit >= 0 ? (
                  <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-rose-400" />
                )}
              </div>
              <div className={`text-lg sm:text-xl font-bold font-mono ${result.metrics.totalNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${result.metrics.totalNetProfit.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                {result.metrics.returnPct >= 0 ? '+' : ''}{result.metrics.returnPct}% Return
              </div>
            </div>

            <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 sm:p-4 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Win Rate</span>
                <Award className="w-4 h-4 text-gold-400" />
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-gold-400">
                {result.metrics.winRatePct}%
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                {result.metrics.winTradesCount} / {result.metrics.totalTrades} Won
              </div>
            </div>

            <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 sm:p-4 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Profit Factor</span>
                <Percent className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-blue-400">
                {result.metrics.profitFactor}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                Gross: ${result.metrics.grossProfit}
              </div>
            </div>

            <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 sm:p-4 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Max Drawdown</span>
                <TrendingDown className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-rose-400">
                -{result.metrics.maxDrawdownPct}%
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                -${result.metrics.maxDrawdownDollars}
              </div>
            </div>

            <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 sm:p-4 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Leverage</span>
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-amber-300">
                1:{result.metrics.leverage || leverage}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                Sharpe: {result.metrics.sharpeRatio}
              </div>
            </div>

            <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 sm:p-4 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Total Trades</span>
                <FileCheck className="w-4 h-4 text-teal-400" />
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-white">
                {result.metrics.totalTrades}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                Bars: {result.candleCount}
              </div>
            </div>
          </div>

          {/* Institutional Benchmarking Reference Table */}
          <BenchmarkTable />

          <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 sm:p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-md font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Equity Curve ({leverage}x Leverage)
              </h3>
              {reportSaved && (
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-md flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Saved to Reports
                  </span>
                  <button
                    onClick={() => onShowTradeMarkersOnChart && onShowTradeMarkersOnChart(result.trades)}
                    className="text-xs bg-gold-600/20 text-gold-400 border border-gold-600/40 hover:bg-gold-600 hover:text-black font-semibold px-3 py-1 rounded-md transition-all font-mono"
                  >
                    Overlay Trades on Chart
                  </button>
                </div>
              )}
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result.equityCurve}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: '2-digit' })}
                    stroke="#64748b"
                    fontSize={11}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0c0e12', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
                    labelFormatter={(ts) => formatIST(ts)}
                    formatter={(val) => [`$${val}`, 'Account Equity']}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#equityGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 sm:p-5 shadow-xl">
            <h3 className="text-md font-bold text-white mb-4 flex items-center justify-between">
              <span>Executed Trades Ledger ({result.trades.length} Trades)</span>
              <span className="text-xs text-slate-400 font-mono font-normal">All times rendered in India Standard Time (IST)</span>
            </h3>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-dark-600 text-slate-400 font-mono bg-dark-900/60 sticky top-0">
                    <th className="py-2.5 px-3">Trade ID</th>
                    <th className="py-2.5 px-3">Side</th>
                    <th className="py-2.5 px-3">Entry Time (IST)</th>
                    <th className="py-2.5 px-3">Exit Time (IST)</th>
                    <th className="py-2.5 px-3">Entry Price</th>
                    <th className="py-2.5 px-3">Exit Price</th>
                    <th className="py-2.5 px-3">Leverage</th>
                    <th className="py-2.5 px-3">P&L ($)</th>
                    <th className="py-2.5 px-3">P&L (%)</th>
                    <th className="py-2.5 px-3">Exit Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700/60 font-mono">
                  {result.trades.map((t) => (
                    <tr key={t.id} className="hover:bg-dark-700/40 transition-colors">
                      <td className="py-2 px-3 text-slate-400">{t.id}</td>
                      <td className="py-2 px-3 font-bold">
                        <span className={`px-2 py-0.5 rounded ${t.side === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950 text-rose-400 border border-rose-500/30'}`}>
                          {t.side}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-300">{formatIST(t.entryTime)}</td>
                      <td className="py-2 px-3 text-slate-300">{formatIST(t.exitTime)}</td>
                      <td className="py-2 px-3 text-slate-200">${t.entryPrice.toFixed(2)}</td>
                      <td className="py-2 px-3 text-slate-200">${t.exitPrice.toFixed(2)}</td>
                      <td className="py-2 px-3 text-amber-400">{t.leverage || leverage}x</td>
                      <td className={`py-2 px-3 font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.pnl >= 0 ? '+' : ''}${t.pnl}
                      </td>
                      <td className={`py-2 px-3 ${t.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct}%
                      </td>
                      <td className="py-2 px-3 text-slate-400">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${t.exitReason === 'MARGIN_CALL_LIQUIDATION' ? 'bg-rose-950 text-rose-400 border border-rose-500/50 font-bold' : 'bg-dark-900 border border-dark-600'}`}>
                          {t.exitReason}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
