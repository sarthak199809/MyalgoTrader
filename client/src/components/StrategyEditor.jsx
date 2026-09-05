import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { Code, Save, Plus, Trash2, Check, RefreshCw, FileText } from 'lucide-react';

export default function StrategyEditor() {
  const [strategies, setStrategies] = useState([]);
  const [activeStratId, setActiveStratId] = useState(null);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [params, setParams] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchStrategies = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/strategies`);
      const data = await res.json();
      setStrategies(data || []);
      if (data && data.length > 0 && !activeStratId) {
        selectStrategy(data[0]);
      }
    } catch (err) {
      console.error('Error fetching strategies:', err);
    }
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  const selectStrategy = (strat) => {
    setActiveStratId(strat.id);
    setName(strat.name);
    setDescription(strat.description || '');
    setCode(strat.code);
    setParams(typeof strat.params === 'string' ? strat.params : JSON.stringify(strat.params, null, 2));
  };

  const handleCreateNew = () => {
    setActiveStratId(null);
    setName('New Custom Strategy');
    setDescription('Custom strategy logic');
    setCode(`// Custom Gold Trading Strategy
function onCandle(candle, history, state, params) {
  if (history.length < 20) return null;
  const closes = history.map(c => c.close);
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;

  if (candle.close > ma20 * 1.002) {
    return { action: 'BUY', slPct: 0.4, tpPct: 0.8 };
  }
  if (candle.close < ma20 * 0.998) {
    return { action: 'SELL', slPct: 0.4, tpPct: 0.8 };
  }

  return null;
}`);
    setParams(JSON.stringify({ maPeriod: 20, slPct: 0.4, tpPct: 0.8 }, null, 2));
  };

  const handleSave = async () => {
    if (!name || !code) {
      setMessage({ type: 'error', text: 'Strategy Name and Code are required.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = { name, description, code, params };
      let res;
      if (activeStratId) {
        res = await fetch(`${API_BASE_URL}/api/strategies/${activeStratId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`${API_BASE_URL}/api/strategies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      setMessage({ type: 'success', text: 'Strategy saved successfully!' });
      await fetchStrategies();
      if (data.id) setActiveStratId(data.id);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this strategy script?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/strategies/${id}`, { method: 'DELETE' });
      await fetchStrategies();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6 pb-12">
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-gold-400" /> Saved Scripts
          </h3>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-1 text-xs bg-gold-600/20 text-gold-400 hover:bg-gold-600 hover:text-black font-semibold px-2.5 py-1 rounded-md transition-all font-mono"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {strategies.map((s) => (
            <div
              key={s.id}
              onClick={() => selectStrategy(s)}
              className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                activeStratId === s.id
                  ? 'bg-dark-700 border-gold-600/60 text-white shadow-md'
                  : 'bg-dark-900/60 border-dark-600 text-slate-300 hover:bg-dark-700/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-xs text-amber-300 truncate">{s.name}</div>
                {s.id !== 'ema_crossover' && s.id !== 'rsi_mean_reversion' && s.id !== 'macd_trend' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                    className="text-slate-500 hover:text-rose-400 p-1"
                    title="Delete Strategy"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{s.description || 'Custom strategy script'}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-3 bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-dark-600 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Code className="w-5 h-5 text-gold-400" /> Strategy Script Editor
            </h2>
            <p className="text-xs text-slate-400">Write custom JavaScript logic for Gold backtesting and forward trading</p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-md transition-all font-mono"
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Saving...' : 'Save Strategy Script'}</span>
          </button>
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300' : 'bg-rose-950/80 border border-rose-500/40 text-rose-300'}`}>
            <Check className="w-4 h-4" />
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Strategy Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-gold-600 font-semibold"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-gold-600"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>JavaScript Strategy Function: <code className="text-amber-300">onCandle(candle, history, state, params)</code></span>
            <span className="text-[11px] text-slate-500">Returns &#123; action: 'BUY'|'SELL'|'CLOSE', slPct, tpPct &#125;</span>
          </label>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={16}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-gold-600 leading-relaxed"
            spellCheck="false"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400 font-medium">Default Parameters (JSON Format)</label>
          <textarea
            value={params}
            onChange={(e) => setParams(e.target.value)}
            rows={3}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-xs font-mono text-amber-200 focus:outline-none focus:border-gold-600"
          />
        </div>
      </div>
    </div>
  );
}
