```typescript
import type { AgentReport, DebateTurn, OHLCV, Position, SymbolMeta, MacroSnapshot,
TradeProposal } from "./types";
import { computeTechnicals } from "./indicators";

// ============================================================================
// SYSTEM CONFIGURATION
// Moving hard-coded values here allows for easy tuning without breaking logic.
// ============================================================================
const CONFIG = {
  ACCOUNT_SIZE_PKR: 1_000_000,
  RISK_PER_TRADE_PCT: 1.0,
  SECTOR_BOOSTS: {
    Banking: 0.05, Fertilizer: 0.04, Energy: 0.02, Cement: -0.02,
    Technology: 0.06, Auto: 0.02, Textile: -0.02, FMCG: 0.01,
    Power: -0.01, Diversified: 0.02,
  },
  SECTOR_SENTIMENT: {
    Energy: 0.1, Banking: 0.05, Fertilizer: 0.08, Cement: -0.05,
    Technology: 0.15, Auto: 0.02, Textile: -0.03, FMCG: 0.0,
    Power: -0.02, Diversified: 0.05, Index: 0.0,
  }
};

export interface AgentCtx {
  symbol: string;
  meta: SymbolMeta;
  series: OHLCV[];
  macro: MacroSnapshot;
  portfolio: Position[];
  horizonDays: number;
}

function fmtPct(n: number | null | undefined, d = 2) {
  if (n == null || !isFinite(n as number)) return "n/a";
  return `${(n as number) >= 0 ? "+" : ""}${(n as number).toFixed(d)}%`;
}
function fmtNum(n: number | null | undefined, d = 2) {
  if (n == null || !isFinite(n as number)) return "n/a";
  return (n as number).toLocaleString("en-PK", { maximumFractionDigits: d,
minimumFractionDigits: d });
}

export function fundamentalsAgent(ctx: AgentCtx): AgentReport {
  const m = ctx.meta;
  const flags: string[] = [];
  let score = 0;

  // Safety Guard: Check for critical data
  if (!m.pe || !m.last_close) {
    return { agent: "fundamentals", symbol: ctx.symbol, summary_md: "Missing fundamental
data.", score: 0, confidence: 0.1, flags: ["data_missing"], data: {} };
  }

  if (m.pe < 4) { score += 0.35; flags.push("deep_value_pe"); }
  else if (m.pe < 6) { score += 0.2; }
  else if (m.pe < 14) { score -= 0.1; flags.push("elevated_pe"); }
  else { score -= 0.3; flags.push("expensive_pe"); }

  if (m.dividend_yield > 12) { score += 0.2; flags.push("high_yield"); }
  else if (m.dividend_yield < 2) { score -= 0.05; flags.push("low_yield"); }

  const pb = m.book_value > 0 ? m.last_close / m.book_value : 1;
  if (pb < 1) { score += 0.15; flags.push("below_book"); }
  else if (pb > 3) { score -= 0.1; flags.push("premium_to_book"); }

  score += CONFIG.SECTOR_BOOSTS[m.sector] ?? 0;

  const earningsYield = (1 / m.pe) * 100;
  const realRate = ctx.macro.pk_policy_rate - ctx.macro.pk_inflation_yoy;
  if (earningsYield > realRate + 4) { score += 0.1; flags.push("earnings_beat_real_rate");
}

  score = Math.max(-1, Math.min(1, score));

  return {
    agent: "fundamentals",
    symbol: ctx.symbol,
    summary_md: `### Fundamentals — ${m.symbol}\n**${m.name}** • Sector:
\`${m.sector}\`\nVerdict: ${score > 0.2 ? "Constructive" : score < -0.2 ? "Cautious" :
"Neutral"} (${score.toFixed(2)})`,
    score,
    confidence: 0.7,
    flags,
    data: { pe: m.pe, pb, earnings_yield: earningsYield },
  };
}

export function technicalsAgent(ctx: AgentCtx): AgentReport {
  const tech = computeTechnicals(ctx.series);
  if ("error" in tech) {
    return { agent: "technicals", symbol: ctx.symbol, summary_md: "Insufficient data.",
score: 0, confidence: 0.2, flags: ["insufficient_data"], data: {} };
  }
  const flags: string[] = [];
  let score = 0;
  let confidence = 0.55;

  if (tech.trend_hint === "bull") { score += 0.25; flags.push("uptrend"); }
  else { score -= 0.2; flags.push("downtrend"); }

  const r = tech.rsi14 as number;
  if (r >= 75) { score -= 0.25; flags.push("overbought"); }
  else if (r <= 25) { score += 0.2; flags.push("oversold"); }

  score = Math.max(-1, Math.min(1, score));
  return {
    agent: "technicals",
    symbol: ctx.symbol,
    summary_md: `### Technicals — ${ctx.symbol}\nTrend: **${tech.trend_hint}**\nVerdict:
${score > 0.2 ? "Constructive" : "Mixed"} (${score.toFixed(2)})`,
    score,
    confidence,
    flags,
    data: tech as Record<string, unknown>,
  };
}

export function sentimentAgent(ctx: AgentCtx): AgentReport {
  let score = CONFIG.SECTOR_SENTIMENT[ctx.meta.sector] ?? 0;
  const flags: string[] = [];

  const tech = computeTechnicals(ctx.series);
  if ((tech.momentum_20d_pct as number) > 5) { score += 0.05;
flags.push("positive_momentum"); }

  score = Math.max(-1, Math.min(1, score));
  return {
    agent: "sentiment",
    symbol: ctx.symbol,
    summary_md: `### Sentiment — ${ctx.symbol}\nVerdict: ${score > 0.1 ? "Positive" :
"Neutral"} (${score.toFixed(2)})`,
    score,
    confidence: 0.55,
    flags,
    data: { sector_sentiment: score },
  };
}

export function macroAgent(ctx: AgentCtx): AgentReport {
  const m = ctx.macro;
  let score = 0;
  const flags: string[] = [];

  if (m.pk_inflation_yoy < 7) { score += 0.15; flags.push("inflation_easing"); }
  if (m.pk_usd_pkr > 290) { score -= 0.15; flags.push("fx_pressure"); }

  score = Math.max(-1, Math.min(1, score));
  return {
    agent: "macro",
    symbol: ctx.symbol,
    summary_md: `### Macro — Pakistan\nVerdict: ${score > 0 ? "Supportive" :
"Restrictive"} (${score.toFixed(2)})`,
    score,
    confidence: 0.6,
    flags,
    data: { fx: m.pk_usd_pkr },
  };
}

export function bullCase(ctx: AgentCtx, fundamentals: AgentReport, technicals:
AgentReport, macro: AgentReport): DebateTurn {
  const points: string[] = [];
  if (fundamentals.score > 0) points.push(`Fundamentals positive
(${fundamentals.score.toFixed(2)})`);
  if (technicals.score > 0) points.push(`Technical tailwind
(${technicals.score.toFixed(2)})`);

  const score = (fundamentals.score + technicals.score + macro.score) / 3 + 0.05;
  return { agent: "bull", text: `**Bull case for ${ctx.symbol}**\n- ${points.join("\n-
")}`, score, confidence: 0.6 };
}

export function bearCase(ctx: AgentCtx, fundamentals: AgentReport, technicals:
AgentReport, macro: AgentReport): DebateTurn {
  const points: string[] = [];
  if (fundamentals.score < 0) points.push(`Fundamentals negative
(${fundamentals.score.toFixed(2)})`);
  if (technicals.score < 0) points.push(`Technical headwind
(${technicals.score.toFixed(2)})`);

  const score = (fundamentals.score + technicals.score + macro.score) / 3 - 0.05;
  return { agent: "bear", text: `**Bear case for ${ctx.symbol}**\n- ${points.join("\n-
")}`, score, confidence: 0.6 };
}

export function moderateDebate(ctx: AgentCtx, bull: DebateTurn, bear: DebateTurn,
fundamentals: AgentReport, technicals: AgentReport): DebateTurn {
  const blended = (bull.score + bear.score) / 2;
  let side: Side = "HOLD";
  if (blended > 0.15) side = "BUY"; else if (blended < -0.15) side = "SELL";
  return { agent: "moderator", text: `Synthesis for ${ctx.symbol}: Proposed **${side}**`,
score: blended, confidence: 0.6 };
}

export function traderAgent(ctx: AgentCtx, fundamentals: AgentReport, technicals:
AgentReport, macro: AgentReport, decision: DebateTurn): { report: AgentReport; proposal:
TradeProposal | null } {
  const tech = computeTechnicals(ctx.series);
  const blended = (fundamentals.score + technicals.score + macro.score + decision.score) /
4;

  let side: Side = "HOLD";
  if (blended > 0.18) side = "BUY"; else if (blended < -0.18) side = "SELL";

  if (side === "HOLD") {
    return {
      report: { agent: "trader", symbol: ctx.symbol, summary_md: "HOLD — no edge.", score:
blended, confidence: 0.4, flags: ["no_edge"], data: {} },
      proposal: null
    };
  }

  const last = ctx.meta.last_close;
  const atrV = (tech.atr14 as number) ?? last * 0.02;
  const stop = side === "BUY" ? +(last - 1.5 * atrV).toFixed(2) : +(last + 1.5 *
atrV).toFixed(2);
  const tp1 = side === "BUY" ? +(last + 1.5 * atrV).toFixed(2) : +(last - 1.5 *
atrV).toFixed(2);

  const riskPerShare = Math.abs(last - stop);
  const riskBudget = CONFIG.ACCOUNT_SIZE_PKR * (CONFIG.RISK_PER_TRADE_PCT / 100);
  const qty = riskPerShare > 0 ? Math.max(1, Math.floor(riskBudget / riskPerShare)) : 0;

  const proposal: TradeProposal = {
    symbol: ctx.symbol, side, entry_zone: [+(last * 0.99).toFixed(2), +(last *
1.01).toFixed(2)],
    stop_loss: stop, take_profit: [tp1], horizon_days: ctx.horizonDays,
    confidence: 0.7, rationale_md: `Blended score ${blended.toFixed(2)}. 1% risk used.`,
risk_pct: CONFIG.RISK_PER_TRADE_PCT,
  };

  return {
    report: { agent: "trader", symbol: ctx.symbol, summary_md: `Action: **${side}**\nStop:
${stop}\nQty: ${qty}`, score: blended, confidence: 0.7, flags: [side.toLowerCase()], data:
{ qty } },
    proposal,
  };
}

export function riskAgent(ctx: AgentCtx, proposal: TradeProposal | null, portfolio:
Position[]): AgentReport {
  let score = 0;
  const flags: string[] = [];
  if (ctx.meta.avg_volume_3m < 50000) { score -= 0.2; flags.push("liquidity_risk"); }

  return {
    agent: "risk",
    symbol: ctx.symbol,
    summary_md: `Risk verdict: ${score < 0 ? "High Risk" : "Acceptable"}
(${score.toFixed(2)})`,
    score: Math.max(-1, Math.min(1, score)),
    confidence: 0.7,
    flags,
    data: {},
  };
}





























































































