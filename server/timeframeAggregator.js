// Timeframe duration in milliseconds
export const TIMEFRAME_MAP = {
  '1m': 60 * 1000,
  '2m': 2 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

export function aggregateCandles(candles1m, timeframeStr = '1m') {
  const tfLower = timeframeStr.toLowerCase();
  if (tfLower === '1m' || !TIMEFRAME_MAP[tfLower]) {
    return candles1m;
  }

  const intervalMs = TIMEFRAME_MAP[tfLower];
  const aggregated = [];
  let currentBucket = null;

  for (let i = 0; i < candles1m.length; i++) {
    const c = candles1m[i];
    // Calculate bucket start time aligned to intervalMs
    const bucketTs = Math.floor(c.timestamp / intervalMs) * intervalMs;

    if (!currentBucket || currentBucket.timestamp !== bucketTs) {
      if (currentBucket) {
        aggregated.push(currentBucket);
      }
      currentBucket = {
        timestamp: bucketTs,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
      };
    } else {
      currentBucket.high = Math.max(currentBucket.high, c.high);
      currentBucket.low = Math.min(currentBucket.low, c.low);
      currentBucket.close = c.close;
      currentBucket.volume += (c.volume || 0);
    }
  }

  if (currentBucket) {
    aggregated.push(currentBucket);
  }

  return aggregated;
}
