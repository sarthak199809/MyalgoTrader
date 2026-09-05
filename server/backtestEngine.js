import db from './db.js';
import { aggregateCandles } from './timeframeAggregator.js';

export function runBacktest(options) {
  const {
    strategyCode,
    strategyParams = {},
    timeframe = '15m',
    startTs = null,
    endTs = null,
    initialBalance = 10000,
    qty = 10, // 10 troy ounces gold
    leverage = 100, // Leverage 1x to 500x
    spread = 0.30, // $0.30 spread
    commission = 0.0
  } = options;

  const leverageVal = Math.max(1, Math.min(500, parseFloat(leverage) || 100));

  // 1. Fetch 1m historical candles from DB
  let query = 'SELECT timestamp, open, high, low, close, volume FROM candles_1m';
  const conditions = [];
  const paramsList = [];

  if (startTs) {
    conditions.push('timestamp >= ?');
    paramsList.push(startTs);
  }
  if (endTs) {
    conditions.push('timestamp <= ?');
    paramsList.push(endTs);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY timestamp ASC';

  const candles1m = db.prepare(query).all(...paramsList);

  if (candles1m.length === 0) {
    throw new Error('No historical data found for the selected date range.');
  }

  // 2. Aggregate into target timeframe
  const candles = aggregateCandles(candles1m, timeframe);

  if (candles.length < 5) {
    throw new Error(`Insufficient candle bars (${candles.length}) for timeframe ${timeframe}. Please expand date range.`);
  }

  // 3. Prepare strategy function execution
  let strategyFn;
  try {
    const codeToEval = `
      ${strategyCode}
      if (typeof onCandle === 'function') {
        return onCandle;
      } else {
        throw new Error('Strategy must define an onCandle(candle, history, state, params) function.');
      }
    `;
    strategyFn = new Function(codeToEval)();
  } catch (err) {
    throw new Error(`Strategy Script Syntax Error: ${err.message}`);
  }

  // 4. Backtesting simulation loop
  let balance = initialBalance;
  let equity = initialBalance;
  let activePosition = null; // { id, side, entryTime, entryPrice, qty, slPrice, tpPrice, requiredMargin }
  const closedTrades = [];
  const equityCurve = [];
  const strategyState = {};

  let peakEquity = initialBalance;
  let maxDrawdownDollars = 0;
  let maxDrawdownPct = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const history = candles.slice(0, i + 1);

    // A. Check active position for SL / TP / Liquidation hit
    if (activePosition) {
      let exitPrice = null;
      let exitReason = null;

      // Calculate current unrealized PnL & equity
      const currentUnrealizedPnL = activePosition.side === 'BUY'
        ? (candle.close - activePosition.entryPrice) * activePosition.qty
        : (activePosition.entryPrice - candle.close) * activePosition.qty;
      
      const currentEquity = balance + currentUnrealizedPnL;

      // Check Liquidation / Margin Call condition (equity <= 10% of required margin or equity <= 0)
      if (currentEquity <= 0 || currentEquity < (activePosition.requiredMargin * 0.10)) {
        exitPrice = candle.close;
        exitReason = 'MARGIN_CALL_LIQUIDATION';
      } else if (activePosition.side === 'BUY') {
        if (activePosition.slPrice && candle.low <= activePosition.slPrice) {
          exitPrice = activePosition.slPrice;
          exitReason = 'STOP_LOSS';
        } else if (activePosition.tpPrice && candle.high >= activePosition.tpPrice) {
          exitPrice = activePosition.tpPrice;
          exitReason = 'TAKE_PROFIT';
        }
      } else if (activePosition.side === 'SELL') {
        if (activePosition.slPrice && candle.high >= activePosition.slPrice) {
          exitPrice = activePosition.slPrice;
          exitReason = 'STOP_LOSS';
        } else if (activePosition.tpPrice && candle.low <= activePosition.tpPrice) {
          exitPrice = activePosition.tpPrice;
          exitReason = 'TAKE_PROFIT';
        }
      }

      if (exitPrice !== null) {
        // Close position
        const pnlRaw = activePosition.side === 'BUY'
          ? (exitPrice - activePosition.entryPrice) * activePosition.qty
          : (activePosition.entryPrice - exitPrice) * activePosition.qty;
        
        const pnl = pnlRaw - (spread * activePosition.qty) - commission;
        balance += pnl;
        equity = balance;

        closedTrades.push({
          id: `trade_${closedTrades.length + 1}`,
          side: activePosition.side,
          entryTime: activePosition.entryTime,
          exitTime: candle.timestamp,
          entryPrice: activePosition.entryPrice,
          exitPrice,
          qty: activePosition.qty,
          leverage: leverageVal,
          pnl: parseFloat(pnl.toFixed(2)),
          pnlPct: parseFloat(((pnl / (activePosition.entryPrice * activePosition.qty)) * 100).toFixed(2)),
          exitReason
        });

        activePosition = null;
      }
    }

    // B. Calculate current unrealized equity
    let unrealizedPnL = 0;
    if (activePosition) {
      unrealizedPnL = activePosition.side === 'BUY'
        ? (candle.close - activePosition.entryPrice) * activePosition.qty
        : (activePosition.entryPrice - candle.close) * activePosition.qty;
    }
    equity = balance + unrealizedPnL;

    // Track Drawdown
    if (equity > peakEquity) {
      peakEquity = equity;
    }
    const ddDollars = peakEquity - equity;
    const ddPct = peakEquity > 0 ? (ddDollars / peakEquity) * 100 : 0;
    if (ddDollars > maxDrawdownDollars) maxDrawdownDollars = ddDollars;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

    // Record equity curve
    if (i % Math.max(1, Math.floor(candles.length / 500)) === 0 || i === candles.length - 1) {
      equityCurve.push({
        timestamp: candle.timestamp,
        balance: parseFloat(balance.toFixed(2)),
        equity: parseFloat(equity.toFixed(2)),
        drawdownPct: parseFloat(ddPct.toFixed(2))
      });
    }

    // C. Evaluate strategy function for signals
    if (i >= 5 && balance > 0) {
      try {
        const signal = strategyFn(candle, history, strategyState, strategyParams);

        if (signal && typeof signal === 'object' && signal.action) {
          const action = signal.action.toUpperCase();

          // Close active position if opposite signal or explicit CLOSE
          if (activePosition && (action === 'CLOSE' || (action === 'BUY' && activePosition.side === 'SELL') || (action === 'SELL' && activePosition.side === 'BUY'))) {
            const exitPrice = candle.close;
            const pnlRaw = activePosition.side === 'BUY'
              ? (exitPrice - activePosition.entryPrice) * activePosition.qty
              : (activePosition.entryPrice - exitPrice) * activePosition.qty;

            const pnl = pnlRaw - (spread * activePosition.qty) - commission;
            balance += pnl;
            equity = balance;

            closedTrades.push({
              id: `trade_${closedTrades.length + 1}`,
              side: activePosition.side,
              entryTime: activePosition.entryTime,
              exitTime: candle.timestamp,
              entryPrice: activePosition.entryPrice,
              exitPrice,
              qty: activePosition.qty,
              leverage: leverageVal,
              pnl: parseFloat(pnl.toFixed(2)),
              pnlPct: parseFloat(((pnl / (activePosition.entryPrice * activePosition.qty)) * 100).toFixed(2)),
              exitReason: action === 'CLOSE' ? 'SIGNAL_CLOSE' : 'SIGNAL_REVERSAL'
            });

            activePosition = null;
          }

          // Open new position if leverage margin allows
          if (!activePosition && (action === 'BUY' || action === 'SELL')) {
            const entryPrice = candle.close;
            const notionalValue = qty * entryPrice;
            const requiredMargin = notionalValue / leverageVal;

            // Check if available balance is sufficient for required margin
            if (balance >= requiredMargin) {
              let slPrice = null;
              let tpPrice = null;

              if (signal.slPrice) slPrice = signal.slPrice;
              else if (signal.slPct) {
                slPrice = action === 'BUY'
                  ? entryPrice * (1 - signal.slPct / 100)
                  : entryPrice * (1 + signal.slPct / 100);
              }

              if (signal.tpPrice) tpPrice = signal.tpPrice;
              else if (signal.tpPct) {
                tpPrice = action === 'BUY'
                  ? entryPrice * (1 + signal.tpPct / 100)
                  : entryPrice * (1 - signal.tpPct / 100);
              }

              activePosition = {
                id: `pos_${candle.timestamp}`,
                side: action,
                entryTime: candle.timestamp,
                entryPrice,
                qty,
                leverage: leverageVal,
                requiredMargin,
                slPrice: slPrice ? parseFloat(slPrice.toFixed(2)) : null,
                tpPrice: tpPrice ? parseFloat(tpPrice.toFixed(2)) : null
              };
            }
          }
        }
      } catch (err) {
        console.error(`Error executing strategy at candle ${candle.timestamp}:`, err.message);
      }
    }
  }

  // Close any position remaining open at backtest end
  if (activePosition) {
    const lastCandle = candles[candles.length - 1];
    const exitPrice = lastCandle.close;
    const pnlRaw = activePosition.side === 'BUY'
      ? (exitPrice - activePosition.entryPrice) * activePosition.qty
      : (activePosition.entryPrice - exitPrice) * activePosition.qty;
    const pnl = pnlRaw - (spread * activePosition.qty) - commission;
    balance += pnl;

    closedTrades.push({
      id: `trade_${closedTrades.length + 1}`,
      side: activePosition.side,
      entryTime: activePosition.entryTime,
      exitTime: lastCandle.timestamp,
      entryPrice: activePosition.entryPrice,
      exitPrice,
      qty: activePosition.qty,
      leverage: leverageVal,
      pnl: parseFloat(pnl.toFixed(2)),
      pnlPct: parseFloat(((pnl / (activePosition.entryPrice * activePosition.qty)) * 100).toFixed(2)),
      exitReason: 'END_OF_TEST'
    });
  }

  // 5. Calculate Comprehensive Performance Metrics
  const totalNetProfit = balance - initialBalance;
  const returnPct = (totalNetProfit / initialBalance) * 100;
  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter(t => t.pnl > 0);
  const losingTrades = closedTrades.filter(t => t.pnl < 0);

  const winRatePct = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
  const grossProfit = winningTrades.reduce((acc, t) => acc + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999.0 : 0.0;

  const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;
  const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

  const returns = closedTrades.map(t => t.pnl);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  const metrics = {
    initialBalance,
    finalBalance: parseFloat(balance.toFixed(2)),
    totalNetProfit: parseFloat(totalNetProfit.toFixed(2)),
    returnPct: parseFloat(returnPct.toFixed(2)),
    totalTrades,
    leverage: leverageVal,
    winTradesCount: winningTrades.length,
    lossTradesCount: losingTrades.length,
    winRatePct: parseFloat(winRatePct.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    grossProfit: parseFloat(grossProfit.toFixed(2)),
    grossLoss: parseFloat(grossLoss.toFixed(2)),
    maxDrawdownDollars: parseFloat(maxDrawdownDollars.toFixed(2)),
    maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2))
  };

  return {
    metrics,
    trades: closedTrades,
    equityCurve,
    candleCount: candles.length
  };
}
