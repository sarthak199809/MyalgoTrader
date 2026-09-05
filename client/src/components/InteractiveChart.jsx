import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { formatIST } from '../utils/timeUtils';
import { API_BASE_URL } from '../config';
import { Clock, RefreshCw, BarChart2, Layers } from 'lucide-react';

const TIMEFRAMES = [
  { id: '1m', label: '1 min' },
  { id: '2m', label: '2 min' },
  { id: '5m', label: '5 min' },
  { id: '10m', label: '10 min' },
  { id: '15m', label: '15 min' },
  { id: '30m', label: '30 min' },
  { id: '1h', label: '1 hour' },
  { id: '2h', label: '2 hours' },
  { id: '6h', label: '6 hours' },
  { id: '12h', label: '12 hours' },
  { id: '1d', label: '1 Day' },
  { id: '1w', label: '1 Week' }
];

export default function InteractiveChart({ liveQuote, tradeMarkers = [] }) {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const emaFastSeriesRef = useRef(null);
  const emaSlowSeriesRef = useRef(null);

  const [timeframe, setTimeframe] = useState('15m');
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEMA, setShowEMA] = useState(true);
  const [hoverData, setHoverData] = useState(null);

  // Fetch candle data from backend
  const fetchCandles = async (selectedTf) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/data/candles?timeframe=${selectedTf}&limit=800`);
      if (!res.ok) throw new Error('Failed to fetch candles');
      const data = await res.json();
      setCandles(data.candles || []);
    } catch (err) {
      console.error('Error loading candles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandles(timeframe);
  }, [timeframe]);

  // Create lightweight-charts instance
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0c0e12' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        mode: 1, // CrosshairMode.Normal
      },
      rightPriceScale: {
        borderColor: '#334155',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        timeFormatter: (time) => formatIST(time * 1000),
      },
    });

    chartInstanceRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candleSeriesRef.current = candleSeries;

    // Volume series
    const volumeSeries = chart.addHistogramSeries({
      color: '#3b82f6',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // EMA Fast (9)
    const emaFastSeries = chart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      title: 'EMA 9',
    });
    emaFastSeriesRef.current = emaFastSeries;

    // EMA Slow (21)
    const emaSlowSeries = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      title: 'EMA 21',
    });
    emaSlowSeriesRef.current = emaSlowSeries;

    // Crosshair hover tooltips
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesPrices) {
        setHoverData(null);
        return;
      }
      const candleData = param.seriesPrices.get(candleSeries);
      if (candleData) {
        setHoverData({
          time: param.time * 1000,
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
        });
      }
    });

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update chart data whenever `candles` changes
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const formattedCandles = [];
    const formattedVolume = [];
    const ema9Data = [];
    const ema21Data = [];

    const calcEMAArray = (prices, period) => {
      const k = 2 / (period + 1);
      const res = new Array(prices.length).fill(null);
      if (prices.length < period) return res;
      let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      res[period - 1] = ema;
      for (let i = period; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
        res[i] = ema;
      }
      return res;
    };

    const closes = candles.map((c) => c.close);
    const ema9Values = calcEMAArray(closes, 9);
    const ema21Values = calcEMAArray(closes, 21);

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const timeInSec = Math.floor(c.timestamp / 1000);

      formattedCandles.push({
        time: timeInSec,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      });

      formattedVolume.push({
        time: timeInSec,
        value: c.volume || 10,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
      });

      if (ema9Values[i] !== null) {
        ema9Data.push({ time: timeInSec, value: ema9Values[i] });
      }
      if (ema21Values[i] !== null) {
        ema21Data.push({ time: timeInSec, value: ema21Values[i] });
      }
    }

    candleSeriesRef.current.setData(formattedCandles);
    volumeSeriesRef.current.setData(formattedVolume);

    if (showEMA) {
      emaFastSeriesRef.current?.setData(ema9Data);
      emaSlowSeriesRef.current?.setData(ema21Data);
    } else {
      emaFastSeriesRef.current?.setData([]);
      emaSlowSeriesRef.current?.setData([]);
    }

    if (tradeMarkers.length > 0) {
      const markers = [];
      for (const t of tradeMarkers) {
        if (t.entryTime) {
          markers.push({
            time: Math.floor(t.entryTime / 1000),
            position: t.side === 'BUY' ? 'belowBar' : 'aboveBar',
            color: t.side === 'BUY' ? '#10b981' : '#ef4444',
            shape: t.side === 'BUY' ? 'arrowUp' : 'arrowDown',
            text: `${t.side} @ $${t.entryPrice}`,
          });
        }
        if (t.exitTime) {
          markers.push({
            time: Math.floor(t.exitTime / 1000),
            position: t.side === 'BUY' ? 'aboveBar' : 'belowBar',
            color: t.pnl >= 0 ? '#3b82f6' : '#f59e0b',
            shape: 'circle',
            text: `EXIT ($${t.pnl >= 0 ? '+' : ''}${t.pnl})`,
          });
        }
      }
      markers.sort((a, b) => a.time - b.time);
      candleSeriesRef.current.setMarkers(markers);
    } else {
      candleSeriesRef.current.setMarkers([]);
    }

    chartInstanceRef.current?.timeScale().fitContent();
  }, [candles, showEMA, tradeMarkers]);

  // Handle live tick update
  useEffect(() => {
    if (!liveQuote || !candleSeriesRef.current || candles.length === 0) return;
    const lastCandle = candles[candles.length - 1];

    if (lastCandle) {
      const updatedCandle = {
        time: Math.floor(lastCandle.timestamp / 1000),
        open: lastCandle.open,
        high: Math.max(lastCandle.high, liveQuote.mid),
        low: Math.min(lastCandle.low, liveQuote.mid),
        close: liveQuote.mid,
      };
      candleSeriesRef.current.update(updatedCandle);
    }
  }, [liveQuote]);

  const lastBar = hoverData || (candles.length > 0 ? candles[candles.length - 1] : null);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-dark-900 border border-dark-600 rounded-xl overflow-hidden shadow-2xl">
      
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-dark-800 border-b border-dark-600 flex-wrap gap-2">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-xs text-slate-400 font-mono mr-2 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-gold-400" /> TF:
          </span>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.id)}
              className={`px-2.5 py-1 text-xs rounded-md font-mono transition-all whitespace-nowrap ${
                timeframe === tf.id
                  ? 'bg-gold-600 text-black font-bold shadow-md'
                  : 'bg-dark-700/60 text-slate-300 hover:bg-dark-600 hover:text-white'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowEMA(!showEMA)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md font-mono border transition-all ${
              showEMA
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-dark-700 text-slate-400 border-dark-600 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>EMA (9,21)</span>
          </button>

          <button
            onClick={() => fetchCandles(timeframe)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-dark-700 hover:bg-dark-600 text-slate-300 rounded-md transition-all font-mono"
            title="Refresh Chart Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* OHLC & Indicator Status Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-dark-900/90 border-b border-dark-700 text-xs font-mono text-slate-300 flex-wrap gap-x-4 gap-y-1">
        <div className="flex items-center gap-3">
          <span className="text-gold-400 font-bold">XAU/USD ({timeframe.toUpperCase()})</span>
          {lastBar && (
            <div className="flex items-center gap-3">
              <span>O: <strong className="text-slate-100">{lastBar.open?.toFixed(2)}</strong></span>
              <span>H: <strong className="text-emerald-400">{lastBar.high?.toFixed(2)}</strong></span>
              <span>L: <strong className="text-rose-400">{lastBar.low?.toFixed(2)}</strong></span>
              <span>C: <strong className="text-slate-100">{lastBar.close?.toFixed(2)}</strong></span>
              {lastBar.open && lastBar.close && (
                <span className={lastBar.close >= lastBar.open ? 'text-emerald-400' : 'text-rose-400'}>
                  {lastBar.close >= lastBar.open ? '+' : ''}
                  {(lastBar.close - lastBar.open).toFixed(2)} (
                  {(((lastBar.close - lastBar.open) / lastBar.open) * 100).toFixed(2)}%)
                </span>
              )}
            </div>
          )}
        </div>

        <div className="text-slate-400 flex items-center gap-2 text-[11px]">
          <span>IST Timezone: </span>
          <span className="text-amber-300 font-semibold">{formatIST(lastBar ? lastBar.time : Date.now())}</span>
        </div>
      </div>

      {/* Main Lightweight Charts Canvas Container */}
      <div className="relative flex-1 w-full h-full">
        {loading && (
          <div className="absolute inset-0 bg-dark-900/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="flex items-center gap-3 bg-dark-800 border border-dark-600 px-4 py-2.5 rounded-lg shadow-xl text-gold-400 font-mono text-sm">
              <RefreshCw className="w-5 h-5 animate-spin text-gold-400" />
              <span>Aggregating {timeframe} Candle Bars...</span>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>

      {/* Chart Footer Info */}
      <div className="px-4 py-1.5 bg-dark-800/80 border-t border-dark-700 text-[11px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Up Candle
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> Down Candle
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-amber-500" /> EMA 9
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-blue-500" /> EMA 21
          </span>
        </div>
        <span className="font-mono">Loaded {candles.length} aggregated bars</span>
      </div>

    </div>
  );
}
