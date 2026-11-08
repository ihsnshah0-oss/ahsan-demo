import type { OHLCV } from "./types";

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += values[j];
      prev = s / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  let gain = 0;
  let loss = 0;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const diff = values[i] - values[i - 1];
    if (i <= period) {
      if (diff >= 0) gain += diff;
      else loss -= diff;
      if (i === period) {
        const avgG = gain / period;
        const avgL = loss / period;
        const rs = avgL === 0 ? 100 : avgG / avgL;
        out.push(100 - 100 / (1 + rs));
      } else {
        out.push(null);
      }
      continue;
    }
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    const rs = loss === 0 ? 100 : gain / loss;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) => {
    if (fastEma[i] == null || slowEma[i] == null) return null;
    return (fastEma[i] as number) - (slowEma[i] as number);
  });
  const validMacd = macdLine.map((v) => (v == null ? 0 : v));
  const signalLine = ema(validMacd, signal);
  const sigFixed = signalLine.map((v, i) => (macdLine[i] == null ? null : v));
  const histogram = macdLine.map((m, i) =>
    m == null || sigFixed[i] == null ? null : (m as number) - (sigFixed[i] as number)
  );
  return { macd: macdLine, signal: sigFixed, histogram };
}

export function atr(series: OHLCV[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  const trs: number[] = [];
  for (let i = 0; i < series.length; i++) {
    if (i === 0) {
      trs.push(series[i].high - series[i].low);
      out.push(null);
      continue;
    }
    const tr = Math.max(
      series[i].high - series[i].low,
      Math.abs(series[i].high - series[i - 1].close),
      Math.abs(series[i].low - series[i - 1].close)
    );
    trs.push(tr);
    if (i < period) {
      out.push(null);
      continue;
    }
    if (i === period) {
      let s = 0;
      for (let j = 0; j <= period; j++) s += trs[j];
      out.push(s / period);
      continue;
    }
    const prev = out[out.length - 1] as number;
    out.push((prev * (period - 1) + tr) / period);
  }
  return out;
}

export function realizedVol(values: number[], period = 20): (number | null)[] {
  const out: (number | null)[] = [];
  const rets: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      rets.push(0);
      out.push(null);
      continue;
    }
    rets.push(Math.log(values[i] / values[i - 1]));
    if (i < period) {
      out.push(null);
      continue;
    }
    const slice = rets.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    out.push(Math.sqrt(variance) * Math.sqrt(252));
  }
  return out;
}

export function maxDrawdown(values: number[]): { dd: number; peakIdx: number; troughIdx:
number } {
  let peak = values[0];
  let peakIdx = 0;
  let troughIdx = 0;
  let dd = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
      peakIdx = i;
    }
    const cur = (peak - values[i]) / peak;
    if (cur > dd) {
      dd = cur;
      troughIdx = i;
    }
  }
  return { dd, peakIdx, troughIdx };
}

export function computeTechnicals(series: OHLCV[]) {
  const closes = series.map((s) => s.close);
  const volumes = series.map((s) => s.volume);
  const last = closes[closes.length - 1];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema20 = ema(closes, 20);
  const rsi14 = rsi(closes, 14);
  const macdRes = macd(closes);
  const atr14 = atr(series, 14);
  const vol20 = realizedVol(closes, 20);
  const mdd = maxDrawdown(closes);

  const vSma20 = sma(volumes, 20);
  const lastVolRatio = vSma20[vSma20.length - 1]
    ? volumes[volumes.length - 1] / (vSma20[vSma20.length - 1] as number)
    : 1;

  const mom20 = closes.length >= 21 ? (closes[closes.length - 1] / closes[closes.length -
21] - 1) * 100 : 0;
  const pickLast = (arr: (number | null)[]) => arr[arr.length - 1];

  return {
    n: closes.length,
    last_close: last,
    sma20: pickLast(sma20),
    sma50: pickLast(sma50),
    sma200: pickLast(sma200),
    ema20: pickLast(ema20),
    rsi14: pickLast(rsi14),
    macd_line: pickLast(macdRes.macd),
    macd_signal: pickLast(macdRes.signal),
    macd_hist: pickLast(macdRes.histogram),
    atr14: pickLast(atr14),
    realized_vol_annualized: pickLast(vol20),
    max_drawdown_180d: mdd.dd * 100,
    momentum_20d_pct: mom20,
    volume_ratio_vs_20d: lastVolRatio,
    trend_hint: pickLast(sma50) != null && pickLast(sma20) != null
      ? (pickLast(sma20) as number) > (pickLast(sma50) as number) ? "bull" : "bear"
      : "mixed",
    golden_cross_recent:
      sma50[sma50.length - 2] != null &&
      sma20[sma20.length - 2] != null &&
      sma50[sma50.length - 1] != null &&
      sma20[sma20.length - 1] != null &&
      (sma20[sma20.length - 2] as number) <= (sma50[sma50.length - 2] as number) &&
      (sma20[sma20.length - 1] as number) > (sma50[sma50.length - 1] as number),
  };
}
