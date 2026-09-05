import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'gold_trader.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS candles_1m (
      timestamp INTEGER PRIMARY KEY,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS live_ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      bid REAL NOT NULL,
      ask REAL NOT NULL,
      mid REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_live_ticks_ts ON live_ticks(timestamp);

    CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      code TEXT NOT NULL,
      params TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS demo_account (
      id TEXT PRIMARY KEY,
      balance REAL NOT NULL,
      initial_balance REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_after REAL NOT NULL,
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_ts ON ledger(timestamp);

    CREATE TABLE IF NOT EXISTS trade_history (
      id TEXT PRIMARY KEY,
      strategy_id TEXT,
      strategy_name TEXT,
      forward_exec_id TEXT,
      mode TEXT NOT NULL,
      symbol TEXT NOT NULL DEFAULT 'XAU/USD',
      side TEXT NOT NULL,
      entry_time INTEGER NOT NULL,
      exit_time INTEGER,
      entry_price REAL NOT NULL,
      exit_price REAL,
      qty REAL NOT NULL,
      leverage REAL DEFAULT 100,
      pnl REAL,
      pnl_pct REAL,
      exit_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS backtest_reports (
      id TEXT PRIMARY KEY,
      strategy_name TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      metrics TEXT NOT NULL,
      trades_json TEXT NOT NULL,
      equity_curve_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS forward_executions (
      id TEXT PRIMARY KEY,
      strategy_id TEXT NOT NULL,
      strategy_name TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      leverage REAL NOT NULL DEFAULT 100,
      qty REAL NOT NULL DEFAULT 10,
      allocated_budget REAL NOT NULL DEFAULT 10000.0,
      sl_pct REAL,
      tp_pct REAL,
      status TEXT NOT NULL, -- 'RUNNING', 'PAUSED', 'STOPPED'
      started_at INTEGER NOT NULL,
      paused_at INTEGER,
      closed_trades_count INTEGER DEFAULT 0,
      total_pnl REAL DEFAULT 0.0
    );
  `);

  // Safe migrations for existing DB
  try {
    db.exec(`ALTER TABLE trade_history ADD COLUMN forward_exec_id TEXT`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE trade_history ADD COLUMN leverage REAL DEFAULT 100`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE forward_executions ADD COLUMN allocated_budget REAL DEFAULT 10000.0`);
  } catch (e) {}

  // Ensure default demo account exists
  const row = db.prepare('SELECT * FROM demo_account WHERE id = ?').get('default');
  if (!row) {
    const now = new Date().toISOString();
    const defaultBalance = 10000.00;
    db.prepare(`
      INSERT INTO demo_account (id, balance, initial_balance, currency, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('default', defaultBalance, defaultBalance, 'USD', now);

    db.prepare(`
      INSERT INTO ledger (id, timestamp, type, amount, balance_after, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('ledger_init_' + Date.now(), Date.now(), 'DEPOSIT', defaultBalance, defaultBalance, 'Initial Demo Account Deposit');
  }

  // Insert or update market sentiment strategy
  const netlifySentimentStrat = {
    id: 'basic_stier_market_sentiment',
    name: 'Basic - S tier + Market Sentiment',
    description: 'Technical Trend & Breakout Strategy with Market Sentiment API Filter (Optimized API Execution)',
    code: `/**
 * Momentum + Trend Strategy with Market Sentiment Filter (Optimized Execution)
 *
 * Execution Logic:
 * 1. Calculate Technical Indicators (EMA 50/200, Bollinger Bands 20,2, RSI 14, ATR 14).
 * 2. Evaluate Technical Setup (canBuy / canSell).
 * 3. ONLY if technical setup triggers, query Market Sentiment API as final check (SAVES 99% API CALLS!).
 */
async function fetchMarketScore(timestampMs, apiBaseUrl) {
  const d = new Date(timestampMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hour = String(d.getUTCHours()).padStart(2, '0');
  const cacheKey = \`\${year}-\${month}-\${day}T\${hour}:00:00Z\`;

  const baseUrl = apiBaseUrl || "https://clinquant-tulumba-c7b230.netlify.app/api/score/timestamp/";
  const url = baseUrl.endsWith('/') ? \`\${baseUrl}\${cacheKey}\` : \`\${baseUrl}/\${cacheKey}\`;

  try {
    if (typeof cachedFetch === 'function') {
      const res = await cachedFetch(url);
      if (res && res.data && typeof res.data.market_score === 'number') {
        return { score: res.data.market_score, signal: res.data.signal || 'Neutral' };
      }
    }
  } catch (err) {
    console.error('Sentiment API fetch error:', err.message);
  }
  return { score: 0.50, signal: 'Neutral' };
}

async function onCandle(candle, history, state, params) {
  // --- Parameters ---
  const emaFast         = params.emaFast         || 50;
  const emaSlow         = params.emaSlow         || 200;
  const rsiPeriod       = params.rsiPeriod       || 14;
  const bbPeriod        = params.bbPeriod        || 20;
  const bbStd           = params.bbStd           || 2.0;
  const atrPeriod       = params.atrPeriod       || 14;
  const slMultiplier    = params.slMultiplier    || 1.5;
  const tpMultiplier    = params.tpMultiplier    || 3.0;

  const useSentiment    = params.useSentiment !== undefined ? params.useSentiment : true;
  const minScoreForBuy  = params.minScoreForBuy  || 0.40;  // Below this, don't BUY
  const maxScoreForSell = params.maxScoreForSell || 0.60;  // Above this, don't SELL
  const apiBaseUrl      = params.apiBaseUrl || "https://clinquant-tulumba-c7b230.netlify.app/api/score/timestamp/";

  // Ensure sufficient history for indicators
  const minRequired = Math.max(emaSlow, bbPeriod, rsiPeriod, atrPeriod) + 2;
  if (history.length < minRequired) return null;

  const closes = history.map(c => c.close);
  const highs  = history.map(c => c.high);
  const lows   = history.map(c => c.low);

  // 1. Calculate EMAs
  function calcEMA(prices, period) {
    if (prices.length < period) return null;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] * k) + (ema * (1 - k));
    }
    return ema;
  }

  const emaFastVal = calcEMA(closes, emaFast);
  const emaSlowVal = calcEMA(closes, emaSlow);
  if (emaFastVal === null || emaSlowVal === null) return null;

  // 2. Calculate Bollinger Bands
  function calcBB(prices, period, stdDev) {
    const slice = prices.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, p) => sum + (p - sma) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    return { upper: sma + stdDev * std, lower: sma - stdDev * std, mid: sma };
  }

  const bb = calcBB(closes, bbPeriod, bbStd);
  const currentClose = candle.close;
  const prevClose = history[history.length - 2]?.close || currentClose;

  // 3. Calculate RSI
  function calcRSI(prices, period) {
    if (prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    const start = prices.length - period;
    for (let i = start; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  const rsi = calcRSI(closes, rsiPeriod);

  // 4. Calculate ATR for stop/target
  function calcATR(highs, lows, closes, period) {
    if (highs.length < period + 1) return null;
    let trSum = 0;
    for (let i = highs.length - period; i < highs.length; i++) {
      const pClose = closes[i - 1];
      const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - pClose), Math.abs(lows[i] - pClose));
      trSum += tr;
    }
    return trSum / period;
  }

  const atr = calcATR(highs, lows, closes, atrPeriod);
  if (!atr) return null;

  // 5. Technical Conditions
  const isUptrend   = emaFastVal > emaSlowVal && currentClose > emaSlowVal;
  const isDowntrend = emaFastVal < emaSlowVal && currentClose < emaSlowVal;

  const crossedAboveUpper = prevClose <= bb.upper && currentClose > bb.upper;
  const crossedBelowLower = prevClose >= bb.lower && currentClose < bb.lower;

  const canBuy  = isUptrend && rsi > 50 && rsi < 70 && crossedAboveUpper;
  const canSell = isDowntrend && rsi < 50 && rsi > 30 && crossedBelowLower;

  // --- OPTIMIZATION SHORTCUT ---
  // If technical conditions aren't met, return null immediately (SAVES 99% API CALLS!)
  if (!canBuy && !canSell) return null;

  // 6. FINAL CHECK: Fetch market sentiment ONLY when technical setup triggers
  let marketScore = 0.50;
  let signalLabel = 'Neutral';

  if (useSentiment) {
    const sentiment = await fetchMarketScore(candle.timestamp, apiBaseUrl);
    marketScore = sentiment.score;
    signalLabel = sentiment.signal;
  }

  // --- BUY Execution ---
  if (canBuy && marketScore >= minScoreForBuy) {
    const slPrice = currentClose - slMultiplier * atr;
    const tpPrice = currentClose + tpMultiplier * atr;
    state._lastTrade = { type: 'BUY', sentiment: { score: marketScore, signal: signalLabel }, timestamp: candle.timestamp };
    return { action: 'BUY', slPrice, tpPrice };
  }

  // --- SELL Execution ---
  if (canSell && marketScore <= maxScoreForSell) {
    const slPrice = currentClose + slMultiplier * atr;
    const tpPrice = currentClose - tpMultiplier * atr;
    state._lastTrade = { type: 'SELL', sentiment: { score: marketScore, signal: signalLabel }, timestamp: candle.timestamp };
    return { action: 'SELL', slPrice, tpPrice };
  }

  return null;
}`,
    params: JSON.stringify({
      emaFast: 50,
      emaSlow: 200,
      rsiPeriod: 14,
      bbPeriod: 20,
      bbStd: 2.0,
      atrPeriod: 14,
      slMultiplier: 1.5,
      tpMultiplier: 3.0,
      useSentiment: true,
      minScoreForBuy: 0.40,
      maxScoreForSell: 0.60,
      apiBaseUrl: "https://clinquant-tulumba-c7b230.netlify.app/api/score/timestamp/"
    }),
    created_at: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO strategies (id, name, description, code, params, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      description=excluded.description,
      code=excluded.code,
      params=excluded.params
  `).run(netlifySentimentStrat.id, netlifySentimentStrat.name, netlifySentimentStrat.description, netlifySentimentStrat.code, netlifySentimentStrat.params, netlifySentimentStrat.created_at);

  const stratCount = db.prepare('SELECT COUNT(*) as count FROM strategies').get().count;
  if (stratCount === 0) {
    seedDefaultStrategies();
  }
}

function seedDefaultStrategies() {
  const defaultStrats = [
    {
      id: 'ema_crossover',
      name: 'EMA Crossover Strategy',
      description: 'Golden cross strategy buying when Fast EMA crosses above Slow EMA, selling when Fast EMA crosses below Slow EMA.',
      code: `// EMA Crossover Strategy
function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] * k) + (ema * (1 - k));
  }
  return ema;
}

function onCandle(candle, history, state, params) {
  const fastPeriod = params.fastPeriod || 9;
  const slowPeriod = params.slowPeriod || 21;

  if (history.length < slowPeriod + 1) return null;

  const closes = history.map(c => c.close);
  const prevCloses = closes.slice(0, closes.length - 1);

  const currFast = calculateEMA(closes, fastPeriod);
  const currSlow = calculateEMA(closes, slowPeriod);
  const prevFast = calculateEMA(prevCloses, fastPeriod);
  const prevSlow = calculateEMA(prevCloses, slowPeriod);

  if (!currFast || !currSlow || !prevFast || !prevSlow) return null;

  if (prevFast <= prevSlow && currFast > currSlow) {
    return { action: 'BUY', slPct: params.slPct || 0.5, tpPct: params.tpPct || 1.0 };
  }

  if (prevFast >= prevSlow && currFast < currSlow) {
    return { action: 'SELL', slPct: params.slPct || 0.5, tpPct: params.tpPct || 1.0 };
  }

  return null;
}`,
      params: JSON.stringify({ fastPeriod: 9, slowPeriod: 21, slPct: 0.5, tpPct: 1.0 }),
      created_at: new Date().toISOString()
    },
    {
      id: 'rsi_mean_reversion',
      name: 'RSI Overbought/Oversold Reversal',
      description: 'Buys when RSI drops below oversold threshold (30) and turns up; sells when RSI rises above overbought (70) and turns down.',
      code: `// RSI Reversal Strategy
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function onCandle(candle, history, state, params) {
  const period = params.rsiPeriod || 14;
  const oversold = params.oversold || 30;
  const overbought = params.overbought || 70;

  if (history.length < period + 2) return null;
  const closes = history.map(c => c.close);
  const currRSI = calculateRSI(closes, period);
  const prevRSI = calculateRSI(closes.slice(0, closes.length - 1), period);

  if (prevRSI <= oversold && currRSI > oversold) {
    return { action: 'BUY', slPct: params.slPct || 0.4, tpPct: params.tpPct || 0.8 };
  }
  if (prevRSI >= overbought && currRSI < overbought) {
    return { action: 'SELL', slPct: params.slPct || 0.4, tpPct: params.tpPct || 0.8 };
  }
  return null;}`,
      params: JSON.stringify({ rsiPeriod: 14, oversold: 30, overbought: 70, slPct: 0.4, tpPct: 0.8 }),
      created_at: new Date().toISOString()
    },
    {
      id: 'external_sentiment_api',
      name: 'Async Market Sentiment API Strategy',
      description: 'Demonstrates calling external 3rd-party Market Sentiment API with async/await and automatic caching.',
      code: `// Async 3rd-Party Market Sentiment API Strategy
async function fetchMarketSentiment(timestamp, apiUrl) {
  // Use cachedFetch helper provided by the engine to prevent duplicate HTTP calls
  if (typeof cachedFetch === 'function') {
    try {
      const url = \`\${apiUrl}?ts=\${timestamp}\`;
      const data = await cachedFetch(url);
      return data.score; // Expects API score between 0.0 (Bearish) and 1.0 (Bullish)
    } catch (e) {
      // Fallback or mock sentiment if API is offline
      return 0.5;
    }
  }
  return 0.5;
}

async function onCandle(candle, history, state, params) {
  const apiUrl = params.sentimentApiUrl || 'https://api.example.com/sentiment';
  
  // 1. Fetch async market sentiment score for this candle timestamp
  const sentimentScore = await fetchMarketSentiment(candle.timestamp, apiUrl);

  // 2. Combine price momentum with market sentiment
  if (history.length < 5) return null;
  const lastClose = candle.close;
  const prevClose = history[history.length - 2].close;
  const priceUp = lastClose > prevClose;

  // Bullish signal: Price moving up AND sentiment score > 0.65
  if (priceUp && sentimentScore > 0.65) {
    return { action: 'BUY', slPct: params.slPct || 0.5, tpPct: params.tpPct || 1.0 };
  }

  // Bearish signal: Price moving down AND sentiment score < 0.35
  if (!priceUp && sentimentScore < 0.35) {
    return { action: 'SELL', slPct: params.slPct || 0.5, tpPct: params.tpPct || 1.0 };
  }

  return null;
}`,
      params: JSON.stringify({ sentimentApiUrl: 'https://api.example.com/sentiment', slPct: 0.5, tpPct: 1.0 }),
      created_at: new Date().toISOString()
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO strategies (id, name, description, code, params, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const s of defaultStrats) {
    stmt.run(s.id, s.name, s.description, s.code, s.params, s.created_at);
  }
}

export default db;
