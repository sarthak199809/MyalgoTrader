import React, { useState, useEffect } from 'react';
import { formatISTTimeOnly } from '../utils/timeUtils';
import { TrendingUp, Activity, Play, Code, Wallet, FileText, RefreshCw, Radio } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, liveQuote, account, onOpenRefillModal }) {
  const [istTime, setIstTime] = useState(formatISTTimeOnly(Date.now()));

  useEffect(() => {
    const timer = setInterval(() => {
      setIstTime(formatISTTimeOnly(Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-dark-800 border-b border-dark-600 px-4 py-3 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Left Section: Branding & Live Ticker */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-gold-600 via-gold-400 to-amber-200 p-0.5 shadow-lg shadow-gold-600/20 flex items-center justify-center">
              <div className="w-full h-full bg-dark-900 rounded-[10px] flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-gold-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg tracking-wider text-white">XAU/USD</h1>
                <span className="bg-gold-600/20 text-gold-400 text-xs px-2 py-0.5 rounded font-mono font-medium border border-gold-600/30">
                  GOLD LAB
                </span>
              </div>
              <p className="text-xs text-slate-400">Swissquote & HistData Playground</p>
            </div>
          </div>

          <div className="h-8 w-px bg-dark-600 hidden md:block" />

          {/* Live Price Widget */}
          <div className="flex items-center gap-3 bg-dark-900/80 px-3 py-1.5 rounded-lg border border-dark-600 font-mono text-xs">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-slate-400">MID:</span>
              <span className="text-emerald-400 font-bold text-sm">
                ${liveQuote ? liveQuote.mid.toFixed(2) : '4,398.50'}
              </span>
            </div>
            <div className="text-slate-400 hidden sm:flex items-center gap-2">
              <span>BID: <strong className="text-slate-200">${liveQuote ? liveQuote.bid.toFixed(2) : '4398.25'}</strong></span>
              <span>ASK: <strong className="text-slate-200">${liveQuote ? liveQuote.ask.toFixed(2) : '4398.89'}</strong></span>
            </div>
          </div>
        </div>

        {/* Center/Right Section: IST Time & Account Balance & Navigation */}
        <div className="flex items-center gap-4 flex-wrap justify-between md:justify-end">
          
          {/* India Standard Time Badge */}
          <div className="flex items-center gap-2 text-xs font-mono bg-dark-900 px-3 py-1.5 rounded-lg border border-dark-600 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>{istTime}</span>
          </div>

          {/* Demo Account Balance Button */}
          <button
            onClick={onOpenRefillModal}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-950/80 to-emerald-900/60 hover:from-emerald-900 hover:to-emerald-800 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg transition-all shadow-md group"
          >
            <Wallet className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <div className="text-left font-mono leading-tight">
              <div className="text-[10px] text-emerald-400/80 uppercase">Demo Balance</div>
              <div className="text-xs font-bold text-emerald-200">
                ${account ? account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '10,000.00'}
              </div>
            </div>
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400 ml-1 group-hover:rotate-180 transition-transform" />
          </button>

        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto mt-3 pt-2 border-t border-dark-700/60 flex items-center gap-2 overflow-x-auto no-scrollbar text-xs font-medium">
        {[
          { id: 'chart', label: 'Interactive Chart', icon: Activity },
          { id: 'backtest', label: 'Strategy Backtester', icon: Play },
          { id: 'forward', label: 'Forward Testing Feed', icon: Radio },
          { id: 'editor', label: 'Strategy Code Lab', icon: Code },
          { id: 'ledger', label: 'Demo Account Ledger', icon: Wallet },
          { id: 'reports', label: 'Strategy Reports', icon: FileText }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-gold-600/20 text-gold-400 border border-gold-600/40 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700/50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-gold-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
