import React, { useState, useEffect } from 'react';
import { formatIST } from '../utils/timeUtils';
import { API_BASE_URL } from '../config';
import { Wallet, RefreshCw, RotateCcw, PlusCircle, ArrowUpRight, ArrowDownRight, DollarSign, X } from 'lucide-react';

export default function DemoLedgerModal({ account, isOpen, onClose, onRefreshAccount }) {
  const [refillAmount, setRefillAmount] = useState(10000);
  const [refillNotes, setRefillNotes] = useState('Manual Refill');
  const [ledgerRows, setLedgerRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLedger = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/demo/ledger?limit=100`);
      const data = await res.json();
      setLedgerRows(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLedger();
    }
  }, [isOpen]);

  const handleRefill = async (amountToRefill) => {
    const amt = amountToRefill || parseFloat(refillAmount);
    if (isNaN(amt) || amt <= 0) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/demo/refill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, notes: refillNotes })
      });
      if (!res.ok) throw new Error('Refill failed');
      await onRefreshAccount();
      await fetchLedger();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset Demo Account to initial $10,000 balance?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/demo/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialBalance: 10000 })
      });
      if (!res.ok) throw new Error('Reset failed');
      await onRefreshAccount();
      await fetchLedger();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl max-w-4xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-dark-600 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-500/40 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Demo Account Ledger & Refill Station</h2>
              <p className="text-xs text-slate-400">Manage virtual balance and track trade transaction ledger</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-dark-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-dark-900 border border-dark-600 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-400 font-medium">Current Balance</div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              ${account ? account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '10,000.00'}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">USD Paper Currency</div>
          </div>

          <div className="md:col-span-2 bg-dark-900 border border-dark-600 rounded-xl p-4 space-y-2">
            <div className="text-xs text-slate-400 font-medium">Instant Refill Quick Select</div>
            <div className="flex flex-wrap gap-2">
              {[1000, 5000, 10000, 50000, 100000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => handleRefill(amt)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-mono font-bold transition-all"
                >
                  +${amt.toLocaleString()}
                </button>
              ))}
              <button
                onClick={handleReset}
                disabled={loading}
                className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset $10k
              </button>
            </div>
          </div>
        </div>

        <div className="bg-dark-900/60 border border-dark-600 rounded-xl p-4 flex flex-col md:flex-row items-end gap-3">
          <div className="flex-1 space-y-1 w-full">
            <label className="text-xs text-slate-400">Custom Refill Amount ($)</label>
            <input
              type="number"
              value={refillAmount}
              onChange={(e) => setRefillAmount(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex-1 space-y-1 w-full">
            <label className="text-xs text-slate-400">Notes / Reason</label>
            <input
              type="text"
              value={refillNotes}
              onChange={(e) => setRefillNotes(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={() => handleRefill(null)}
            disabled={loading}
            className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-xs font-mono transition-all flex items-center justify-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Confirm Refill</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto border border-dark-600 rounded-xl bg-dark-900/80">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-dark-600 text-slate-400 font-mono bg-dark-900 sticky top-0">
                <th className="py-2.5 px-3">Date / Time (IST)</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Amount ($)</th>
                <th className="py-2.5 px-3">Balance After ($)</th>
                <th className="py-2.5 px-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/60 font-mono">
              {ledgerRows.map((r) => (
                <tr key={r.id} className="hover:bg-dark-700/40">
                  <td className="py-2 px-3 text-slate-300">{formatIST(r.timestamp)}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      r.type === 'REFILL' || r.type === 'DEPOSIT' || r.type === 'TRADE_PROFIT'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                    }`}>
                      {r.type}
                    </span>
                  </td>
                  <td className={`py-2 px-3 font-bold ${r.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {r.amount >= 0 ? '+' : ''}${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-3 text-slate-100">${r.balance_after.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-slate-400 text-[11px]">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
