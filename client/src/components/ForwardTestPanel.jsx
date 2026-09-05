import React, { useState, useEffect } from 'react';
import { formatIST } from '../utils/timeUtils';
import { API_BASE_URL } from '../config';
import { Radio, Play, Pause, Trash2, Plus, Activity, ShieldCheck, DollarSign, Clock, AlertCircle, Zap, Layers, RefreshCw, ChevronRight, ListFilter, FileText, CheckCircle2, ShieldAlert, Wallet } from 'lucide-react';

const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 50, 100, 200, 400, 500];

export default function ForwardTestPanel({ liveQuote }) {
  const [strategies, setStrategies] = useState([]);
  const [selectedStratId, setSelectedStratId] = useState('');
  const [timeframe, setTimeframe] = useState('1m');
  const [qty, setQty] = useState(10);
  const [allocatedBudget, setAllocatedBudget] = useState(10000);
  const [leverage, setLeverage] = useState(100);
  const [slPct, setSlPct] = useState(0.5);
  const [tpPct, setTpPct] = useState(1.0);

  const [executions, setExecutions] = useState([]);
  const [totalTicksProcessed, setTotalTicksProcessed] = useState(0);
  const [selectedExecId, setSelectedExecId] = useState(null);
  const [selectedExecTrades, setSelectedExecTrades] = useState([]);
  const [eventsLog, setEventsLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleFetchError = (err) => {
    const isNetworkError = err.message === 'Failed to fetch' || err.name === 'TypeError';
    setErrorMsg(
      isNetworkError
        ? `Failed to connect to backend server at ${API_BASE_URL}. Please ensure the backend server is running (npm run server).`
        : err.message
    );
  };

  const fetchExecutions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/forward/executions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load forward executions`);
      const data = await res.json();
      const list = data.executions || [];
      setExecutions(list);
      if (data.totalTicksProcessed) setTotalTicksProcessed(data.totalTicksProcessed);
      if (list.length > 0 && !selectedExecId) {
        selectExecution(list[0].id);
      }
      setErrorMsg(null);
    } catch (err) {
      console.error('Error fetching forward executions:', err);
      handleFetchError(err);
    }
  };

  const fetchExecTrades = async (execId) => {
    if (!execId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/forward/executions/${execId}/trades`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load trades`);
      const trades = await res.json();
      setSelectedExecTrades(Array.isArray(trades) ? trades : []);
    } catch (err) {
      console.error('Error fetching execution trades:', err);
    }
  };

  const selectExecution = (execId) => {
    setSelectedExecId(execId);
    fetchExecTrades(execId);
  };

  const loadData = async () => {
    try {
      const stratRes = await fetch(`${API_BASE_URL}/api/strategies`);
      if (stratRes.ok) {
        const stratData = await stratRes.json();
        setStrategies(stratData || []);
        if (stratData && stratData.length > 0) {
          setSelectedStratId(prev => prev || stratData[0].id);
        }
      }
      await fetchExecutions();
    } catch (err) {
      handleFetchError(err);
    }
  };

  useEffect(() => {
    loadData();

    const eventSource = new EventSource(`${API_BASE_URL}/api/live/stream`);

    eventSource.addEventListener('forwardEvent', (e) => {
      try {
        const parsed = JSON.parse(e.data);
        setEventsLog(prev => [parsed, ...prev.slice(0, 50)]);
        fetchExecutions();
        if (selectedExecId) fetchExecTrades(selectedExecId);
      } catch (err) {
        console.error(err);
      }
    });

    eventSource.onerror = (err) => {
      console.warn('SSE stream connection warning:', err);
    };

    return () => eventSource.close();
  }, []);

  useEffect(() => {
    if (selectedExecId) {
      fetchExecTrades(selectedExecId);
    }
  }, [selectedExecId]);

  const handleStartForwardExecution = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const stratToUse = selectedStratId || (strategies.length > 0 ? strategies[0].id : null);
    if (!stratToUse) {
      setErrorMsg('Please select a valid strategy script before starting forward execution.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        strategyId: stratToUse,
        timeframe,
        qty: parseFloat(qty) || 10,
        allocatedBudget: parseFloat(allocatedBudget) || 10000,
        leverage: parseFloat(leverage) || 100,
        slPct: parseFloat(slPct) || 0.5,
        tpPct: parseFloat(tpPct) || 1.0
      };

      const res = await fetch(`${API_BASE_URL}/api/forward/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start forward execution');

      setSuccessMsg('Live Forward Execution started with dedicated strategy budget!');
      await fetchExecutions();
      
      const newExecId = data.execution ? data.execution.id : (data.status && data.status.config ? data.status.config.id : null);
      if (newExecId) {
        selectExecution(newExecId);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePauseExecution = async (e, id) => {
    e.stopPropagation();
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/forward/pause/${id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to pause instance');
      await fetchExecutions();
      setSuccessMsg('Execution paused.');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleResumeExecution = async (e, id) => {
    e.stopPropagation();
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/forward/resume/${id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resume instance');
      await fetchExecutions();
      setSuccessMsg('Execution resumed.');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleDeleteExecution = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this forward testing execution?')) return;
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/forward/executions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete instance');
      if (selectedExecId === id) {
        setSelectedExecId(null);
        setSelectedExecTrades([]);
      }
      await fetchExecutions();
      setSuccessMsg('Execution instance stopped & deleted.');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const selectedExecObj = executions.find(ex => ex.id === selectedExecId);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 px-2 sm:px-4">
      
      {/* Live Swissquote API Monitor Banner */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <Radio className="w-6 h-6 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-white">Multi-Strategy Forward Testing Engine</h2>
              <span className="bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-xs px-2 py-0.5 rounded font-mono flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400 animate-pulse" /> 24/7 Engine Active
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Dedicated capital per strategy • Swissquote live tick feed ({totalTicksProcessed.toLocaleString()} quotes processed)
            </p>
          </div>
        </div>

        {/* Realtime Live Prices */}
        <div className="flex items-center gap-4 sm:gap-6 font-mono text-xs bg-dark-900 px-4 py-2.5 rounded-lg border border-dark-600 w-full md:w-auto justify-between">
          <div>
            <div className="text-slate-400 text-[10px]">MID PRICE</div>
            <div className="text-emerald-400 text-base sm:text-lg font-bold">
              ${liveQuote ? liveQuote.mid.toFixed(2) : '4,398.50'}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px]">BID / ASK</div>
            <div className="text-slate-200 font-semibold">
              ${liveQuote ? liveQuote.bid.toFixed(2) : '4398.25'} / ${liveQuote ? liveQuote.ask.toFixed(2) : '4398.89'}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px]">IST TIME</div>
            <div className="text-amber-300 font-semibold">
              {liveQuote ? formatIST(liveQuote.timestamp, true) : '--'}
            </div>
          </div>
        </div>
      </div>

      {/* Global Error / Success Callout Banners */}
      {errorMsg && (
        <div className="p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl flex items-center justify-between text-rose-300 text-xs font-mono">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadData}
              className="bg-rose-900/80 hover:bg-rose-800 text-white px-2.5 py-1 rounded text-[11px] font-bold border border-rose-500/40 flex items-center gap-1 transition-all"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white font-bold ml-1">✕</button>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl flex items-center justify-between text-emerald-300 text-xs font-mono">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white font-bold ml-2">✕</button>
        </div>
      )}

      {/* Main Grid: Launch Form & Executions List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Launch New Forward Execution Form */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 sm:p-5 space-y-4 shadow-xl">
          <h3 className="font-bold text-white text-sm flex items-center justify-between">
            <span>Launch Forward Instance</span>
            <span className="text-xs text-gold-400 font-mono flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Dedicated Budget
            </span>
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400">Strategy Script</label>
              <select
                value={selectedStratId}
                onChange={(e) => setSelectedStratId(e.target.value)}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-gold-600 font-medium"
              >
                {strategies.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400">Timeframe</label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                >
                  {['1m', '2m', '5m', '10m', '15m', '30m', '1h', '2h', '6h', '12h', '1d', '1w'].map(tf => (
                    <option key={tf} value={tf}>{tf.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400">Leverage</label>
                <select
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-mono font-bold"
                >
                  {LEVERAGE_OPTIONS.map(lev => (
                    <option key={lev} value={lev}>{lev}x</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 flex items-center justify-between">
                <span>Dedicated Allocated Budget ($)</span>
                <span className="text-emerald-400 font-mono flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> Isolated
                </span>
              </label>
              <input
                type="number"
                value={allocatedBudget}
                onChange={(e) => setAllocatedBudget(e.target.value)}
                placeholder="10000"
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs text-emerald-300 font-mono font-bold focus:outline-none focus:border-gold-600"
              />
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">Isolated capital assigned solely to this strategy instance.</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-400">Position Oz</label>
                <input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Stop Loss %</label>
                <input
                  type="number"
                  step="0.1"
                  value={slPct}
                  onChange={(e) => setSlPct(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Take Profit %</label>
                <input
                  type="number"
                  step="0.1"
                  value={tpPct}
                  onChange={(e) => setTpPct(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>

            <button
              onClick={handleStartForwardExecution}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 text-xs font-mono"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
              <span>{loading ? 'Starting Instance...' : 'Start Live Forward Execution'}</span>
            </button>
          </div>
        </div>

        {/* Right: Parallel Forward Executions Cards & Interactive Trade Logs */}
        <div className="lg:col-span-2 space-y-4">
          
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-gold-400" /> Active Forward Instances ({executions.length})
            </h3>
            <button
              onClick={fetchExecutions}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh List
            </button>
          </div>

          {/* Executions List Cards */}
          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {executions.length === 0 ? (
              <div className="p-8 bg-dark-800 border border-dark-600 rounded-xl text-center text-xs text-slate-400 font-mono">
                No active forward instances running. Launch one on the left to start live paper testing!
              </div>
            ) : (
              executions.map((exec) => {
                const isSelected = selectedExecId === exec.id;
                const allocatedBudgetVal = exec.allocatedBudget || exec.allocated_budget || 10000;
                const totalPnlVal = exec.totalPnl || exec.total_pnl || 0;
                const equityVal = exec.allocatedEquity || (allocatedBudgetVal + totalPnlVal);

                return (
                  <div
                    key={exec.id}
                    onClick={() => selectExecution(exec.id)}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all space-y-3 ${
                      isSelected
                        ? 'bg-dark-700 border-gold-600/80 text-white shadow-xl ring-1 ring-gold-600/40'
                        : 'bg-dark-800 border-dark-600 text-slate-300 hover:bg-dark-700/60'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-amber-300">{exec.strategyName || exec.strategy_name}</span>
                        <span className="bg-gold-600/20 text-gold-400 border border-gold-600/30 text-[11px] px-2 py-0.5 rounded font-mono font-bold">
                          {exec.timeframe.toUpperCase()} @ {exec.leverage}x
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          exec.status === 'RUNNING' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' :
                          exec.status === 'PAUSED' ? 'bg-amber-950 text-amber-300 border border-amber-500/40' :
                          'bg-dark-900 text-slate-400'
                        }`}>
                          {exec.status}
                        </span>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2">
                        {exec.status === 'RUNNING' && (
                          <button
                            onClick={(e) => handlePauseExecution(e, exec.id)}
                            className="p-1.5 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-500/40 rounded-md text-xs transition-all flex items-center gap-1 font-mono"
                            title="Pause Strategy Signals"
                          >
                            <Pause className="w-3.5 h-3.5 fill-amber-300" /> Pause
                          </button>
                        )}

                        {exec.status === 'PAUSED' && (
                          <button
                            onClick={(e) => handleResumeExecution(e, exec.id)}
                            className="p-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 rounded-md text-xs transition-all flex items-center gap-1 font-mono"
                            title="Resume Live Strategy"
                          >
                            <Play className="w-3.5 h-3.5 fill-emerald-300" /> Resume
                          </button>
                        )}

                        <button
                          onClick={(e) => handleDeleteExecution(e, exec.id)}
                          className="p-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/40 rounded-md text-xs transition-all flex items-center gap-1 font-mono"
                          title="Stop & Delete Execution Instance"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </div>

                    {/* Realtime Live Engine Signal Diagnostics Banner */}
                    <div className="p-2 bg-dark-900 border border-dark-600 rounded-lg flex items-center justify-between text-[11px] font-mono gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                        <span className="text-slate-400">Signal Monitor:</span>
                        <span className="text-amber-300 font-semibold">{exec.lastSignal || 'LISTENING (No Signal)'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <span>Checks: <strong className="text-slate-200">{exec.evaluationsCount || 0}</strong></span>
                        {exec.lastError ? (
                          <span className="text-rose-400 flex items-center gap-1 font-bold">
                            <ShieldAlert className="w-3 h-3" /> Error: {exec.lastError}
                          </span>
                        ) : (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Script Healthy
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
                      <div>Dedicated Budget: <strong className="text-emerald-400">${allocatedBudgetVal.toLocaleString()}</strong></div>
                      <div>Current Equity: <strong className="text-blue-400">${equityVal.toLocaleString()}</strong></div>
                      <div>Closed Trades: <strong className="text-teal-400">{exec.closedTradesCount || exec.closed_trades_count || 0}</strong></div>
                      <div>Total PnL: <strong className={totalPnlVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}>${totalPnlVal}</strong></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Selected Execution Trade Log Details */}
          {selectedExecObj ? (
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 sm:p-5 space-y-3 shadow-xl">
              <div className="flex items-center justify-between border-b border-dark-600 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gold-400" />
                  <h4 className="font-bold text-white text-xs font-mono">
                    Trade History Log for <span className="text-amber-300">{selectedExecObj.strategyName || selectedExecObj.strategy_name}</span> ({selectedExecTrades.length} Trades)
                  </h4>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">All timestamps in IST</span>
              </div>

              <div className="overflow-x-auto max-h-64 border border-dark-600 rounded-xl bg-dark-900">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-dark-600 text-slate-400 bg-dark-900 sticky top-0">
                      <th className="py-2 px-3">Side</th>
                      <th className="py-2 px-3">Entry Time (IST)</th>
                      <th className="py-2 px-3">Exit Time (IST)</th>
                      <th className="py-2 px-3">Entry</th>
                      <th className="py-2 px-3">Exit</th>
                      <th className="py-2 px-3">Leverage</th>
                      <th className="py-2 px-3">PnL ($)</th>
                      <th className="py-2 px-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-700/60">
                    {selectedExecTrades.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500">
                          No closed trades for this forward testing instance yet. Evaluating signals on candle bar completion...
                        </td>
                      </tr>
                    ) : (
                      selectedExecTrades.map((t) => (
                        <tr key={t.id} className="hover:bg-dark-700/40">
                          <td className="py-1.5 px-3 font-bold">
                            <span className={t.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{t.side}</span>
                          </td>
                          <td className="py-1.5 px-3 text-slate-300">{formatIST(t.entry_time || t.entryTime)}</td>
                          <td className="py-1.5 px-3 text-slate-300">{formatIST(t.exit_time || t.exitTime)}</td>
                          <td className="py-1.5 px-3 text-slate-200">${(t.entry_price || t.entryPrice).toFixed(2)}</td>
                          <td className="py-1.5 px-3 text-slate-200">${(t.exit_price || t.exitPrice).toFixed(2)}</td>
                          <td className="py-1.5 px-3 text-amber-400">{t.leverage}x</td>
                          <td className={`py-1.5 px-3 font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.pnl >= 0 ? '+' : ''}${t.pnl}
                          </td>
                          <td className="py-1.5 px-3 text-slate-400 text-[11px]">{t.exit_reason || t.exitReason}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

        </div>

      </div>

    </div>
  );
}
