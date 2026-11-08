```typescript
// Shared types for AHSAN'S TRADE HUB

export type Side = "BUY" | "SELL" | "HOLD";

export interface Position {
  symbol: string;
  qty: number;
  avg_price: number;
}

export interface TradeProposal {
  symbol: string;
  side: Side;
  entry_zone: [number, number];
  stop_loss: number | null;
  take_profit: number[];
  horizon_days: number;
  confidence: number; // 0..1
  rationale_md: string;
  risk_pct: number;
}

export interface AgentReport {
  agent: string;
  symbol?: string | null;
  summary_md: string;
  score: number; // -1..+1
  confidence: number; // 0..1
  flags: string[];
  data: Record<string, unknown>;
}

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolMeta {
  symbol: string;
  name: string;
  sector: string;
  market_cap: number;
  pe: number;
  eps: number;
  dividend_yield: number;
  book_value: number;
  last_close: number;
  week_52_high: number;
  week_52_low: number;
  avg_volume_3m: number;
}

export interface RunRequest {
  symbols: string[];
  horizon_days: number;
  portfolio: Position[];
  max_positions: number;
  max_portfolio_dd_pct: number;
  max_risk_per_trade_pct: number;
}

export interface DebateTurn {
  agent: "bull" | "bear" | "trader" | "moderator";
  text: string;
  score: number;
  confidence: number;
}

export interface MacroSnapshot {
  pk_inflation_yoy: number;
  pk_policy_rate: number;
  pk_usd_pkr: number;
  pk_reserves_usd_b: number;
  oil_brent: number;
  global_risk: "risk-on" | "neutral" | "risk-off";
}

export interface RunEvent {
  ts: number;
  type:
    | "run_started"
    | "step_started"
    | "step_finished"
    | "agent_log"
    | "warning"
    | "error"
    | "run_finished"
    | "debate_turn";
  step?: string | null;
  payload?: Record<string, unknown>;
}
