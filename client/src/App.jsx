import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import InteractiveChart from './components/InteractiveChart';
import BacktestPanel from './components/BacktestPanel';
import ForwardTestPanel from './components/ForwardTestPanel';
import StrategyEditor from './components/StrategyEditor';
import ReportsPanel from './components/ReportsPanel';
import DemoLedgerModal from './components/DemoLedgerModal';
import { API_BASE_URL } from './config';

export default function App() {
  const [activeTab, setActiveTab] = useState('chart');
  const [liveQuote, setLiveQuote] = useState(null);
  const [account, setAccount] = useState(null);
  const [tradeMarkers, setTradeMarkers] = useState([]);
  const [isRefillModalOpen, setIsRefillModalOpen] = useState(false);

  // Fetch initial account info
  const fetchAccount = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/demo/account`);
      const data = await res.json();
      setAccount(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAccount();

    // Subscribe to SSE live quotes
    const eventSource = new EventSource(`${API_BASE_URL}/api/live/stream`);
    
    eventSource.addEventListener('quote', (e) => {
      try {
        const quote = JSON.parse(e.data);
        setLiveQuote(quote);
      } catch (err) {
        console.error('SSE quote parse error:', err);
      }
    });

    eventSource.addEventListener('forwardEvent', (e) => {
      // Refresh demo balance whenever a trade closes
      fetchAccount();
    });

    return () => eventSource.close();
  }, []);

  const handleShowTradeMarkersOnChart = (trades) => {
    setTradeMarkers(trades || []);
    setActiveTab('chart');
  };

  return (
    <div className="min-h-screen bg-dark-900 text-slate-100 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        liveQuote={liveQuote}
        account={account}
        onOpenRefillModal={() => setIsRefillModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeTab === 'chart' && (
          <InteractiveChart
            liveQuote={liveQuote}
            tradeMarkers={tradeMarkers}
          />
        )}

        {activeTab === 'backtest' && (
          <BacktestPanel
            onShowTradeMarkersOnChart={handleShowTradeMarkersOnChart}
          />
        )}

        {activeTab === 'forward' && (
          <ForwardTestPanel
            liveQuote={liveQuote}
          />
        )}

        {activeTab === 'editor' && (
          <StrategyEditor />
        )}

        {activeTab === 'ledger' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Demo Account & Trade Ledger</h2>
              <button
                onClick={() => setIsRefillModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-xs font-mono"
              >
                + Refill Balance Station
              </button>
            </div>
            <DemoLedgerModal
              account={account}
              isOpen={true}
              onClose={() => setActiveTab('chart')}
              onRefreshAccount={fetchAccount}
            />
          </div>
        )}

        {activeTab === 'reports' && (
          <ReportsPanel />
        )}
      </main>

      <DemoLedgerModal
        account={account}
        isOpen={isRefillModalOpen}
        onClose={() => setIsRefillModalOpen(false)}
        onRefreshAccount={fetchAccount}
      />
    </div>
  );
}
