import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import db, { initDb } from './db.js';
import { aggregateCandles, TIMEFRAME_MAP } from './timeframeAggregator.js';
import { startSwissquotePolling, addQuoteListener, removeQuoteListener, getLatestQuote } from './swissquoteFeed.js';
import { runBacktest } from './backtestEngine.js';
import { getDemoAccount, refillDemoAccount, resetDemoAccount, getLedgerHistory } from './demoAccount.js';
import {
  initForwardEngineFromDb,
  startForwardExecution,
  pauseForwardExecution,
  resumeForwardExecution,
  stopAndDeleteForwardExecution,
  getForwardExecutions,
  getExecutionTrades,
  addForwardEventListener,
  removeForwardEventListener
} from './forwardEngine.js';

dotenv.config();
initDb();
initForwardEngineFromDb();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;

// 1. DATA ENDPOINTS
app.get('/api/data/info', (req, res) => {
  try {
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM candles_1m').get();
    const minMaxRow = db.prepare('SELECT MIN(timestamp) as minTs, MAX(timestamp) as maxTs FROM candles_1m').get();
    const liveTicksCount = db.prepare('SELECT COUNT(*) as count FROM live_ticks').get().count;

    // Available years in dataset
    const yearsRows = db.prepare("SELECT DISTINCT strftime('%Y', datetime(timestamp/1000, 'unixepoch')) as year FROM candles_1m ORDER BY year ASC").all();
    const availableYears = yearsRows.map(r => parseInt(r.year, 10)).filter(y => !isNaN(y));

    res.json({
      totalCandles1m: totalRow ? totalRow.count : 0,
      minTimestamp: minMaxRow ? minMaxRow.minTs : null,
      maxTimestamp: minMaxRow ? minMaxRow.maxTs : null,
      startDateIso: minMaxRow && minMaxRow.minTs ? new Date(minMaxRow.minTs).toISOString() : null,
      endDateIso: minMaxRow && minMaxRow.maxTs ? new Date(minMaxRow.maxTs).toISOString() : null,
      availableYears,
      liveTicksCount,
      timeframes: Object.keys(TIMEFRAME_MAP)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/data/candles', (req, res) => {
  try {
    const timeframe = (req.query.timeframe || '15m').toLowerCase();
    const limit = parseInt(req.query.limit || '1000', 10);
    const startTs = req.query.start ? parseInt(req.query.start, 10) : null;
    const endTs = req.query.end ? parseInt(req.query.end, 10) : null;

    let query = 'SELECT timestamp, open, high, low, close, volume FROM candles_1m';
    const conditions = [];
    const params = [];

    if (startTs) {
      conditions.push('timestamp >= ?');
      params.push(startTs);
    }
    if (endTs) {
      conditions.push('timestamp <= ?');
      params.push(endTs);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY timestamp ASC';

    if (!startTs && !endTs) {
      const factor = timeframe === '1w' ? 10000 : timeframe === '1d' ? 1440 : 60;
      query = `SELECT * FROM (SELECT timestamp, open, high, low, close, volume FROM candles_1m ORDER BY timestamp DESC LIMIT ${Math.min(limit * factor, 250000)}) ORDER BY timestamp ASC`;
    }

    const rows = db.prepare(query).all(...params);
    const aggregated = aggregateCandles(rows, timeframe);
    const finalResult = aggregated.length > limit ? aggregated.slice(aggregated.length - limit) : aggregated;

    res.json({
      timeframe,
      count: finalResult.length,
      candles: finalResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. STRATEGY ENDPOINTS
app.get('/api/strategies', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM strategies ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/strategies', (req, res) => {
  try {
    const { name, description, code, params } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'Name and Code are required.' });
    }

    const id = 'strat_' + Date.now();
    const createdAt = new Date().toISOString();
    const paramsStr = typeof params === 'object' ? JSON.stringify(params) : (params || '{}');

    db.prepare(`
      INSERT INTO strategies (id, name, description, code, params, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, description || '', code, paramsStr, createdAt);

    res.json({ id, name, description, code, params: paramsStr, created_at: createdAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/strategies/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, code, params } = req.body;

    const paramsStr = typeof params === 'object' ? JSON.stringify(params) : (params || '{}');
    db.prepare(`
      UPDATE strategies
      SET name = ?, description = ?, code = ?, params = ?
      WHERE id = ?
    `).run(name, description || '', code, paramsStr, id);

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/strategies/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM strategies WHERE id = ?').run(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. BACKTEST ENDPOINTS
app.post('/api/backtest/run', (req, res) => {
  try {
    const result = runBacktest(req.body);

    if (req.body.saveReport) {
      const reportId = 'report_' + Date.now();
      const createdAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO backtest_reports (id, strategy_name, timeframe, start_date, end_date, metrics, trades_json, equity_curve_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reportId,
        req.body.strategyName || 'Custom Strategy',
        req.body.timeframe || '15m',
        req.body.startTs ? new Date(req.body.startTs).toISOString() : 'Full Range',
        req.body.endTs ? new Date(req.body.endTs).toISOString() : 'Full Range',
        JSON.stringify(result.metrics),
        JSON.stringify(result.trades),
        JSON.stringify(result.equityCurve),
        createdAt
      );
      result.reportId = reportId;
    }

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. DEMO ACCOUNT & LEDGER
app.get('/api/demo/account', (req, res) => {
  try {
    const account = getDemoAccount();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/demo/refill', (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid positive amount required.' });
    }
    const result = refillDemoAccount(amount, req.body.notes || 'User Refill');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/demo/reset', (req, res) => {
  try {
    const initialBalance = parseFloat(req.body.initialBalance || 10000);
    const result = resetDemoAccount(initialBalance);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demo/ledger', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const rows = getLedgerHistory(limit);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. MULTI-STRATEGY FORWARD TESTING CONTROL
app.get('/api/forward/executions', (req, res) => {
  res.json(getForwardExecutions());
});

app.get('/api/forward/executions/:id/trades', (req, res) => {
  try {
    const trades = getExecutionTrades(req.params.id);
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/forward/start', (req, res) => {
  try {
    const execObj = startForwardExecution(req.body);
    res.json({ success: true, execution: execObj, status: getForwardExecutions() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/forward/pause/:id', (req, res) => {
  try {
    const execObj = pauseForwardExecution(req.params.id);
    res.json({ success: true, execution: execObj, status: getForwardExecutions() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/forward/resume/:id', (req, res) => {
  try {
    const execObj = resumeForwardExecution(req.params.id);
    res.json({ success: true, execution: execObj, status: getForwardExecutions() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/forward/executions/:id', (req, res) => {
  try {
    stopAndDeleteForwardExecution(req.params.id);
    res.json({ success: true, status: getForwardExecutions() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. REPORTS ENDPOINTS
app.get('/api/reports', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, strategy_name, timeframe, start_date, end_date, metrics, created_at FROM backtest_reports ORDER BY created_at DESC').all();
    const formatted = rows.map(r => ({
      ...r,
      metrics: JSON.parse(r.metrics)
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM backtest_reports WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found' });
    res.json({
      ...row,
      metrics: JSON.parse(row.metrics),
      trades: JSON.parse(row.trades_json),
      equityCurve: JSON.parse(row.equity_curve_json)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reports/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM backtest_reports WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. REALTIME LIVE STREAM (SSE)
app.get('/api/live/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const currentQuote = getLatestQuote();
  if (currentQuote) {
    sendEvent('quote', currentQuote);
  }

  const quoteHandler = (quote) => {
    sendEvent('quote', quote);
  };

  const forwardEventHandler = (fwdEvent) => {
    sendEvent('forwardEvent', fwdEvent);
  };

  addQuoteListener(quoteHandler);
  addForwardEventListener(forwardEventHandler);

  req.on('close', () => {
    removeQuoteListener(quoteHandler);
    removeForwardEventListener(forwardEventHandler);
  });
});

startSwissquotePolling(2000);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
