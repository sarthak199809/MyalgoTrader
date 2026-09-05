import db from './db.js';
import { registerForwardEngine } from './swissquoteFeed.js';
import { recordTradeLedger, getDemoAccount } from './demoAccount.js';
import { aggregateCandles } from './timeframeAggregator.js';

// In-memory active forward execution instances: Map<execId, ExecutionObject>
const activeExecutionsMap = new Map();
const forwardEventsListeners = new Set();
let totalTicksProcessed = 0;

export function addForwardEventListener(listener) {
  forwardEventsListeners.add(listener);
}

export function removeForwardEventListener(listener) {
  forwardEventsListeners.delete(listener);
}

function broadcastForwardEvent(type, payload) {
  for (const listener of forwardEventsListeners) {
    try {
      listener({ type, payload, timestamp: Date.now() });
    } catch (e) {
      console.error('Forward event error:', e);
    }
  }
}

// Load existing running/paused executions from DB on startup
export function initForwardEngineFromDb() {
  const rows = db.prepare("SELECT * FROM forward_executions WHERE status != 'STOPPED'").all();
  for (const row of rows) {
    try {
      const strat = db.prepare('SELECT * FROM strategies WHERE id = ?').get(row.strategy_id);
      const cachedFetch = async (url, fetchOptions = {}) => {
        const response = await fetch(url, fetchOptions);
        return response.json();
      };
      const codeToEval = `
        ${strat.code}
        if (typeof onCandle === 'function') return onCandle;
        throw new Error('No onCandle function defined');
      `;
      const strategyFn = new Function('cachedFetch', codeToEval)(cachedFetch);

      activeExecutionsMap.set(row.id, {
        id: row.id,
        strategyId: row.strategy_id,
        strategyName: row.strategy_name,
        strategyCode: strat.code,
        strategyFn,
        params: JSON.parse(strat.params || '{}'),
        timeframe: row.timeframe,
        leverage: row.leverage,
        qty: row.qty,
        allocatedBudget: row.allocated_budget || 10000.0,
        slPct: row.sl_pct,
        tpPct: row.tp_pct,
        status: row.status,
        startedAt: row.started_at,
        pausedAt: row.paused_at,
        closedTradesCount: row.closed_trades_count || 0,
        totalPnl: row.total_pnl || 0.0,
        activePosition: null,
        state: { cachedFetch },
        evaluationsCount: 0,
        lastEvaluatedAt: null,
        lastSignal: 'LISTENING (Hold)',
        lastError: null
      });
    } catch (err) {
      console.error(`Failed to reload forward execution ${row.id}:`, err.message);
    }
  }
  console.log(`Loaded ${activeExecutionsMap.size} forward executions from DB.`);
}

export function getForwardExecutions() {
  const account = getDemoAccount();
  const dbRows = db.prepare("SELECT * FROM forward_executions WHERE status != 'STOPPED' ORDER BY started_at DESC").all();

  const formattedExecutions = dbRows.map(row => {
    const memoryExec = activeExecutionsMap.get(row.id);
    const allocatedBudget = row.allocated_budget || 10000.0;
    const totalPnl = row.total_pnl || 0.0;
    const currentEquity = parseFloat((allocatedBudget + totalPnl).toFixed(2));

    return {
      id: row.id,
      strategyId: row.strategy_id,
      strategyName: row.strategy_name,
      timeframe: row.timeframe,
      leverage: row.leverage,
      qty: row.qty,
      allocatedBudget,
      allocatedEquity: currentEquity,
      slPct: row.sl_pct,
      tpPct: row.tp_pct,
      status: row.status,
      startedAt: row.started_at,
      pausedAt: row.paused_at,
      closedTradesCount: row.closed_trades_count || 0,
      totalPnl,
      activePosition: memoryExec ? memoryExec.activePosition : null,
      evaluationsCount: memoryExec ? memoryExec.evaluationsCount : 0,
      lastEvaluatedAt: memoryExec ? memoryExec.lastEvaluatedAt : null,
      lastSignal: memoryExec ? memoryExec.lastSignal : 'LISTENING',
      lastError: memoryExec ? memoryExec.lastError : null
    };
  });

  return {
    executions: formattedExecutions,
    totalTicksProcessed,
    account
  };
}

export function getExecutionTrades(execId) {
  const trades = db.prepare('SELECT * FROM trade_history WHERE forward_exec_id = ? ORDER BY exit_time DESC').all(execId);
  return trades;
}

export function startForwardExecution(options) {
  const { strategyId, timeframe = '1m', qty = 10, leverage = 100, allocatedBudget = 10000, slPct = 0.5, tpPct = 1.0 } = options;

  const strat = db.prepare('SELECT * FROM strategies WHERE id = ?').get(strategyId);
  if (!strat) {
    throw new Error(`Strategy ID ${strategyId} not found.`);
  }

  let strategyFn;
  const cachedFetch = async (url, fetchOptions = {}) => {
    const response = await fetch(url, fetchOptions);
    return response.json();
  };
  try {
    const codeToEval = `
      ${strat.code}
      if (typeof onCandle === 'function') return onCandle;
      throw new Error('No onCandle function defined');
    `;
    strategyFn = new Function('cachedFetch', codeToEval)(cachedFetch);
  } catch (err) {
    throw new Error(`Invalid strategy code: ${err.message}`);
  }

  const leverageVal = Math.max(1, Math.min(500, parseFloat(leverage) || 100));
  const budgetVal = Math.max(100, parseFloat(allocatedBudget) || 10000.0);
  const execId = `fwd_exec_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const startedAt = Date.now();

  db.prepare(`
    INSERT INTO forward_executions (id, strategy_id, strategy_name, timeframe, leverage, qty, allocated_budget, sl_pct, tp_pct, status, started_at, closed_trades_count, total_pnl)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RUNNING', ?, 0, 0.0)
  `).run(execId, strategyId, strat.name, timeframe, leverageVal, parseFloat(qty), budgetVal, parseFloat(slPct), parseFloat(tpPct), startedAt);

  const execObj = {
    id: execId,
    strategyId,
    strategyName: strat.name,
    strategyCode: strat.code,
    strategyFn,
    params: JSON.parse(strat.params || '{}'),
    timeframe,
    leverage: leverageVal,
    qty: parseFloat(qty),
    allocatedBudget: budgetVal,
    slPct: parseFloat(slPct),
    tpPct: parseFloat(tpPct),
    status: 'RUNNING',
    startedAt,
    pausedAt: null,
    closedTradesCount: 0,
    totalPnl: 0.0,
    activePosition: null,
    state: { cachedFetch },
    evaluationsCount: 0,
    lastEvaluatedAt: null,
    lastSignal: 'LISTENING (Hold)',
    lastError: null
  };

  activeExecutionsMap.set(execId, execObj);

  broadcastForwardEvent('FORWARD_STARTED', execObj);
  console.log(`Forward Execution ${execId} started for ${strat.name} (Budget: $${budgetVal}, ${timeframe}, ${leverageVal}x)`);
  return execObj;
}

export function pauseForwardExecution(execId) {
  const exec = activeExecutionsMap.get(execId);
  const now = Date.now();

  if (exec) {
    exec.status = 'PAUSED';
    exec.pausedAt = now;
  }

  db.prepare(`
    UPDATE forward_executions
    SET status = 'PAUSED', paused_at = ?
    WHERE id = ?
  `).run(now, execId);

  broadcastForwardEvent('FORWARD_PAUSED', { id: execId });
  return getForwardExecutions();
}

export function resumeForwardExecution(execId) {
  const exec = activeExecutionsMap.get(execId);

  if (exec) {
    exec.status = 'RUNNING';
    exec.pausedAt = null;
  } else {
    const row = db.prepare('SELECT * FROM forward_executions WHERE id = ?').get(execId);
    if (row) {
      const strat = db.prepare('SELECT * FROM strategies WHERE id = ?').get(row.strategy_id);
      if (strat) {
        const cachedFetch = async (url, fetchOptions = {}) => {
          const response = await fetch(url, fetchOptions);
          return response.json();
        };
        const codeToEval = `
          ${strat.code}
          if (typeof onCandle === 'function') return onCandle;
          throw new Error('No onCandle function defined');
        `;
        const strategyFn = new Function('cachedFetch', codeToEval)(cachedFetch);

        activeExecutionsMap.set(row.id, {
          id: row.id,
          strategyId: row.strategy_id,
          strategyName: row.strategy_name,
          strategyCode: strat.code,
          strategyFn,
          params: JSON.parse(strat.params || '{}'),
          timeframe: row.timeframe,
          leverage: row.leverage,
          qty: row.qty,
          allocatedBudget: row.allocated_budget || 10000.0,
          slPct: row.sl_pct,
          tpPct: row.tp_pct,
          status: 'RUNNING',
          startedAt: row.started_at,
          pausedAt: null,
          closedTradesCount: row.closed_trades_count || 0,
          totalPnl: row.total_pnl || 0.0,
          activePosition: null,
          state: { cachedFetch },
          evaluationsCount: 0,
          lastEvaluatedAt: null,
          lastSignal: 'LISTENING (Hold)',
          lastError: null
        });
      }
    }
  }

  db.prepare(`
    UPDATE forward_executions
    SET status = 'RUNNING', paused_at = NULL
    WHERE id = ?
  `).run(execId);

  broadcastForwardEvent('FORWARD_RESUMED', { id: execId });
  return getForwardExecutions();
}

export function stopAndDeleteForwardExecution(execId) {
  activeExecutionsMap.delete(execId);

  db.prepare(`
    UPDATE forward_executions
    SET status = 'STOPPED'
    WHERE id = ?
  `).run(execId);

  broadcastForwardEvent('FORWARD_STOPPED', { id: execId });
  return getForwardExecutions();
}

// Global Swissquote Tick Handler for ALL Active Parallel Forward Executions
registerForwardEngine((quote) => {
  totalTicksProcessed++;
  if (activeExecutionsMap.size === 0) return;

  const currentPrice = quote.mid;
  const ts = quote.timestamp;

  const candles1m = db.prepare('SELECT timestamp, open, high, low, close, volume FROM candles_1m ORDER BY timestamp DESC LIMIT 300').all().reverse();
  if (candles1m.length < 5) return;

  for (const exec of activeExecutionsMap.values()) {
    if (exec.status !== 'RUNNING') continue;

    exec.evaluationsCount = (exec.evaluationsCount || 0) + 1;
    exec.lastEvaluatedAt = ts;

    // Dedicated budget equity per strategy instance
    const instanceEquity = (exec.allocatedBudget || 10000.0) + (exec.totalPnl || 0.0);

    // A. Check open position SL / TP / Liquidation
    if (exec.activePosition) {
      let exitReason = null;
      let exitPrice = currentPrice;

      const currentUnrealizedPnL = exec.activePosition.side === 'BUY'
        ? (currentPrice - exec.activePosition.entryPrice) * exec.activePosition.qty
        : (exec.activePosition.entryPrice - currentPrice) * exec.activePosition.qty;

      const currentPositionEquity = instanceEquity + currentUnrealizedPnL;

      if (currentPositionEquity <= 0 || currentPositionEquity < (exec.activePosition.requiredMargin * 0.10)) {
        exitReason = 'MARGIN_CALL_LIQUIDATION';
        exitPrice = currentPrice;
      } else if (exec.activePosition.side === 'BUY') {
        if (exec.activePosition.slPrice && currentPrice <= exec.activePosition.slPrice) {
          exitReason = 'STOP_LOSS';
          exitPrice = exec.activePosition.slPrice;
        } else if (exec.activePosition.tpPrice && currentPrice >= exec.activePosition.tpPrice) {
          exitReason = 'TAKE_PROFIT';
          exitPrice = exec.activePosition.tpPrice;
        }
      } else if (exec.activePosition.side === 'SELL') {
        if (exec.activePosition.slPrice && currentPrice >= exec.activePosition.slPrice) {
          exitReason = 'STOP_LOSS';
          exitPrice = exec.activePosition.slPrice;
        } else if (exec.activePosition.tpPrice && currentPrice <= exec.activePosition.tpPrice) {
          exitReason = 'TAKE_PROFIT';
          exitPrice = exec.activePosition.tpPrice;
        }
      }

      if (exitReason) {
        closeActivePosition(exec, exitPrice, exitReason, ts);
      }
    }

    // B. Evaluate Strategy Signal
    const candles = aggregateCandles(candles1m, exec.timeframe);
    if (candles.length < 5) {
      exec.lastSignal = `Building Candles (${candles.length}/5 required)`;
      continue;
    }

    const lastCandle = candles[candles.length - 1];

    try {
      const signal = await exec.strategyFn(lastCandle, candles, exec.state, exec.params);
      exec.lastError = null;

      if (signal && typeof signal === 'object' && signal.action) {
        const action = signal.action.toUpperCase();
        exec.lastSignal = `SIGNAL: ${action} @ $${currentPrice}`;

        if (action === 'BUY' || action === 'SELL') {
          
          // Signal Reversal: If an opposite position is currently open, close it first!
          if (exec.activePosition && exec.activePosition.side !== action) {
            closeActivePosition(exec, currentPrice, 'SIGNAL_REVERSAL', ts);
          }

          // Open new position if no active position currently open
          if (!exec.activePosition) {
            const entryPrice = currentPrice;
            const notionalValue = exec.qty * entryPrice;
            const requiredMargin = notionalValue / exec.leverage;

            // Enforce dedicated allocated strategy budget check!
            if (instanceEquity >= requiredMargin) {
              let slPrice = null;
              let tpPrice = null;

              const slPct = exec.slPct || 0.5;
              const tpPct = exec.tpPct || 1.0;

              if (signal.slPrice) slPrice = signal.slPrice;
              else if (signal.slPct) slPrice = action === 'BUY' ? entryPrice * (1 - signal.slPct / 100) : entryPrice * (1 + signal.slPct / 100);
              else slPrice = action === 'BUY' ? entryPrice * (1 - slPct / 100) : entryPrice * (1 + slPct / 100);

              if (signal.tpPrice) tpPrice = signal.tpPrice;
              else if (signal.tpPct) tpPrice = action === 'BUY' ? entryPrice * (1 + signal.tpPct / 100) : entryPrice * (1 - signal.tpPct / 100);
              else tpPrice = action === 'BUY' ? entryPrice * (1 + tpPct / 100) : entryPrice * (1 - tpPct / 100);

              exec.activePosition = {
                id: `fwd_${Date.now()}_${Math.floor(Math.random() * 100)}`,
                side: action,
                entryTime: ts,
                entryPrice,
                qty: exec.qty,
                leverage: exec.leverage,
                requiredMargin,
                slPrice: parseFloat(slPrice.toFixed(2)),
                tpPrice: parseFloat(tpPrice.toFixed(2))
              };

              broadcastForwardEvent('TRADE_OPENED', { execId: exec.id, position: exec.activePosition });
            } else {
              exec.lastError = `Dedicated Strategy Budget ($${instanceEquity.toFixed(2)}) insufficient for required margin ($${requiredMargin.toFixed(2)})`;
            }
          }
        }
      } else {
        exec.lastSignal = 'LISTENING (No Signal)';
      }
    } catch (err) {
      exec.lastError = err.message;
      exec.lastSignal = 'STRATEGY SCRIPT ERROR';
      console.error(`Forward Strategy Eval Error for ${exec.id}:`, err.message);
    }
  }
});

function closeActivePosition(exec, exitPrice, exitReason, ts) {
  if (!exec.activePosition) return;

  const pnlRaw = exec.activePosition.side === 'BUY'
    ? (exitPrice - exec.activePosition.entryPrice) * exec.activePosition.qty
    : (exec.activePosition.entryPrice - exitPrice) * exec.activePosition.qty;

  const pnl = parseFloat((pnlRaw - 0.30 * exec.activePosition.qty).toFixed(2));
  const pnlPct = parseFloat(((pnl / (exec.activePosition.entryPrice * exec.activePosition.qty)) * 100).toFixed(2));

  const closedTrade = {
    id: exec.activePosition.id,
    strategyId: exec.strategyId,
    strategyName: exec.strategyName,
    forwardExecId: exec.id,
    mode: 'FORWARD',
    symbol: 'XAU/USD',
    side: exec.activePosition.side,
    entryTime: exec.activePosition.entryTime,
    exitTime: ts,
    entryPrice: exec.activePosition.entryPrice,
    exitPrice,
    qty: exec.activePosition.qty,
    leverage: exec.leverage,
    pnl,
    pnlPct,
    exitReason
  };

  db.prepare(`
    INSERT INTO trade_history (id, strategy_id, strategy_name, forward_exec_id, mode, symbol, side, entry_time, exit_time, entry_price, exit_price, qty, leverage, pnl, pnl_pct, exit_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    closedTrade.id, closedTrade.strategyId, closedTrade.strategyName, closedTrade.forwardExecId, closedTrade.mode, closedTrade.symbol,
    closedTrade.side, closedTrade.entryTime, closedTrade.exitTime, closedTrade.entryPrice, closedTrade.exitPrice,
    closedTrade.qty, closedTrade.leverage, closedTrade.pnl, closedTrade.pnlPct, closedTrade.exitReason
  );

  recordTradeLedger(closedTrade);

  exec.closedTradesCount = (exec.closedTradesCount || 0) + 1;
  exec.totalPnl = parseFloat(((exec.totalPnl || 0) + pnl).toFixed(2));

  db.prepare(`
    UPDATE forward_executions
    SET closed_trades_count = ?, total_pnl = ?
    WHERE id = ?
  `).run(exec.closedTradesCount, exec.totalPnl, exec.id);

  broadcastForwardEvent('TRADE_CLOSED', { execId: exec.id, trade: closedTrade });
  exec.activePosition = null;
  exec.lastSignal = `POSITION CLOSED (${exitReason})`;
}
