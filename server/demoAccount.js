import db from './db.js';

export function getDemoAccount() {
  const row = db.prepare('SELECT * FROM demo_account WHERE id = ?').get('default');
  return row;
}

export function refillDemoAccount(amount, notes = 'User Refill') {
  const current = getDemoAccount();
  const newBalance = (current ? current.balance : 0) + amount;
  const nowStr = new Date().toISOString();

  if (current) {
    db.prepare(`
      UPDATE demo_account
      SET balance = ?, updated_at = ?
      WHERE id = 'default'
    `).run(newBalance, nowStr);
  } else {
    db.prepare(`
      INSERT INTO demo_account (id, balance, initial_balance, currency, updated_at)
      VALUES ('default', ?, ?, 'USD', ?)
    `).run(newBalance, amount, nowStr);
  }

  // Insert ledger record
  const ledgerId = 'ledger_refill_' + Date.now();
  db.prepare(`
    INSERT INTO ledger (id, timestamp, type, amount, balance_after, notes)
    VALUES (?, ?, 'REFILL', ?, ?, ?)
  `).run(ledgerId, Date.now(), amount, newBalance, notes);

  return { balance: newBalance, added: amount };
}

export function resetDemoAccount(initialBalance = 10000.00) {
  const nowStr = new Date().toISOString();
  db.prepare(`
    UPDATE demo_account
    SET balance = ?, initial_balance = ?, updated_at = ?
    WHERE id = 'default'
  `).run(initialBalance, initialBalance, nowStr);

  const ledgerId = 'ledger_reset_' + Date.now();
  db.prepare(`
    INSERT INTO ledger (id, timestamp, type, amount, balance_after, notes)
    VALUES (?, ?, 'RESET', ?, ?, ?)
  `).run(ledgerId, Date.now(), initialBalance, initialBalance, 'Demo Account Reset to Initial Balance');

  return { balance: initialBalance };
}

export function recordTradeLedger(trade) {
  const account = getDemoAccount();
  const newBalance = account.balance + trade.pnl;
  const nowStr = new Date().toISOString();

  db.prepare(`
    UPDATE demo_account
    SET balance = ?, updated_at = ?
    WHERE id = 'default'
  `).run(newBalance, nowStr);

  const type = trade.pnl >= 0 ? 'TRADE_PROFIT' : 'TRADE_LOSS';
  const ledgerId = 'ledger_trade_' + trade.id;
  db.prepare(`
    INSERT INTO ledger (id, timestamp, type, amount, balance_after, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    ledgerId,
    trade.exitTime || Date.now(),
    type,
    trade.pnl,
    newBalance,
    `${trade.side} ${trade.qty} Oz Gold @ ${trade.entryPrice} -> Exit @ ${trade.exitPrice} (${trade.exitReason})`
  );

  return newBalance;
}

export function getLedgerHistory(limit = 100) {
  return db.prepare('SELECT * FROM ledger ORDER BY timestamp DESC LIMIT ?').all(limit);
}
