import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import db, { initDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Helper to parse EST timestamp (UTC-5) to UTC epoch milliseconds
export function parseEstTimestamp(dateStr, timeStr) {
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);

  const hour = timeStr.slice(0, 2);
  const min = timeStr.slice(2, 4);
  const sec = timeStr.slice(4, 6);

  const isoStr = `${year}-${month}-${day}T${hour}:${min}:${sec}-05:00`;
  return Date.parse(isoStr);
}

export async function ingestAllCsvFiles() {
  initDb();

  const csvFilePaths = [];

  // 1. Scan for standalone CSV files in rootDir (e.g. DAT_ASCII_XAUUSD_M1_2023.csv)
  const rootFiles = fs.readdirSync(rootDir);
  for (const file of rootFiles) {
    if (file.toLowerCase().endsWith('.csv') && (file.startsWith('DAT_') || file.startsWith('HISTDATA_'))) {
      csvFilePaths.push(path.join(rootDir, file));
    }
  }

  // 2. Scan for subdirectories in rootDir (e.g. HISTDATA_COM_ASCII_XAUUSD_M1202601)
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const histFolders = entries
    .filter(e => e.isDirectory() && e.name.startsWith('HISTDATA_COM_ASCII_XAUUSD_M1'))
    .map(e => e.name);

  for (const folder of histFolders) {
    const folderPath = path.join(rootDir, folder);
    const files = fs.readdirSync(folderPath);
    const csvFile = files.find(f => f.toLowerCase().endsWith('.csv'));
    if (csvFile) {
      csvFilePaths.push(path.join(folderPath, csvFile));
    }
  }

  // Sort by filename for sequential log feedback
  csvFilePaths.sort();
  console.log(`Found ${csvFilePaths.length} CSV data files to ingest:`, csvFilePaths.map(p => path.basename(p)));

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO candles_1m (timestamp, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let totalInserted = 0;
  const startTime = Date.now();

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insertStmt.run(row.ts, row.open, row.high, row.low, row.close, row.vol);
    }
  });

  for (const csvPath of csvFilePaths) {
    console.log(`Ingesting ${path.basename(csvPath)}...`);

    const fileStream = fs.createReadStream(csvPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const batch = [];
    let countInFile = 0;

    for await (const line of rl) {
      if (!line || !line.includes(';')) continue;
      const parts = line.trim().split(';');
      if (parts.length < 5) continue;

      const [datetime, openStr, highStr, lowStr, closeStr, volStr] = parts;
      const [datePart, timePart] = datetime.split(' ');

      if (!datePart || !timePart) continue;

      const ts = parseEstTimestamp(datePart, timePart);
      const open = parseFloat(openStr);
      const high = parseFloat(highStr);
      const low = parseFloat(lowStr);
      const close = parseFloat(closeStr);
      const vol = parseFloat(volStr || '0');

      if (isNaN(ts) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;

      batch.push({ ts, open, high, low, close, vol });
      countInFile++;

      if (batch.length >= 10000) {
        insertMany(batch);
        batch.length = 0;
      }
    }

    if (batch.length > 0) {
      insertMany(batch);
    }

    totalInserted += countInFile;
    console.log(`Ingested ${countInFile} rows from ${path.basename(csvPath)}`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Done! Ingested total ${totalInserted} 1-minute candles into SQLite in ${duration}s.`);
}

if (process.argv[1] && process.argv[1].endsWith('csvIngestor.js')) {
  ingestAllCsvFiles().catch(console.error);
}
