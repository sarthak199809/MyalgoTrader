import db from './db.js';

let isPolling = false;
let pollIntervalTimer = null;
const listeners = new Set();
let latestQuote = null;
let forwardEngineCallback = null;

export function registerForwardEngine(callback) {
  forwardEngineCallback = callback;
}

export function addQuoteListener(listener) {
  listeners.add(listener);
}

export function removeQuoteListener(listener) {
  listeners.delete(listener);
}

export function getLatestQuote() {
  return latestQuote;
}

export async function fetchSwissquoteQuote() {
  try {
    const response = await fetch('https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`Swissquote HTTP status ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    let bid = null;
    let ask = null;
    let ts = Date.now();

    for (const item of data) {
      if (item.ts) ts = item.ts;
      if (item.spreadProfilePrices && Array.isArray(item.spreadProfilePrices)) {
        const prime = item.spreadProfilePrices.find(p => p.spreadProfile === 'prime') || item.spreadProfilePrices[0];
        if (prime && prime.bid && prime.ask) {
          bid = prime.bid;
          ask = prime.ask;
          break;
        }
      }
    }

    if (!bid || !ask) return null;

    const mid = parseFloat(((bid + ask) / 2).toFixed(3));
    const quote = {
      timestamp: ts,
      bid,
      ask,
      mid,
      spread: parseFloat((ask - bid).toFixed(3))
    };

    latestQuote = quote;

    // Save to SQLite live_ticks table
    try {
      db.prepare(`
        INSERT INTO live_ticks (timestamp, bid, ask, mid)
        VALUES (?, ?, ?, ?)
      `).run(ts, bid, ask, mid);

      // Save / Update live 1-minute candle in candles_1m table
      const minuteTs = Math.floor(ts / 60000) * 60000;
      const existingCandle = db.prepare('SELECT * FROM candles_1m WHERE timestamp = ?').get(minuteTs);

      if (existingCandle) {
        const newHigh = Math.max(existingCandle.high, mid);
        const newLow = Math.min(existingCandle.low, mid);
        db.prepare(`
          UPDATE candles_1m
          SET high = ?, low = ?, close = ?, volume = volume + 1
          WHERE timestamp = ?
        `).run(newHigh, newLow, mid, minuteTs);
      } else {
        db.prepare(`
          INSERT INTO candles_1m (timestamp, open, high, low, close, volume)
          VALUES (?, ?, ?, ?, ?, 1)
        `).run(minuteTs, mid, mid, mid, mid);
      }
    } catch (dbErr) {
      console.error('Error saving tick to DB:', dbErr);
    }

    // Notify UI listeners (SSE)
    for (const listener of listeners) {
      try {
        listener(quote);
      } catch (err) {
        console.error('SSE listener error:', err);
      }
    }

    // Notify Forward Engine if active
    if (forwardEngineCallback) {
      try {
        forwardEngineCallback(quote);
      } catch (err) {
        console.error('Forward Engine callback error:', err);
      }
    }

    return quote;
  } catch (err) {
    console.error('Fetch Swissquote Quote failed:', err.message);
    return null;
  }
}

export function startSwissquotePolling(intervalMs = 2000) {
  if (isPolling) return;
  isPolling = true;
  console.log(`Starting Swissquote Live Feed polling every ${intervalMs}ms...`);
  
  fetchSwissquoteQuote();

  pollIntervalTimer = setInterval(() => {
    fetchSwissquoteQuote();
  }, intervalMs);
}

export function stopSwissquotePolling() {
  if (pollIntervalTimer) {
    clearInterval(pollIntervalTimer);
    pollIntervalTimer = null;
  }
  isPolling = false;
  console.log('Stopped Swissquote Live Feed polling.');
}

export function getPollingStatus() {
  return { isPolling, latestQuote };
}
