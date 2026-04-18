# Workflow Principles — Trading, Guardrails, Session Flow

Companion to all other `draft_*.md` planning docs. This is the "why" doc — read before implementing any phase.

---

## 1. Target workflow

One linear operator path:

```
[1] Pack Editor      →  [2] Sandbox Run     →  [3] Pack Grader     →  [4] Session Launcher
    edit filters/        run vs. live tape      review winners,       apply to LIVE or DRY,
    exits + adaptive     capture eval trace     mark TP/FP,           start/pause/revert,
    axes + enrichment    no real capital        auto-suggest tuning   watch live health
```

One job per page. No shortcut from Editor to LIVE — a pack must graduate via Sandbox → Grader → Session.

## 2. Trading principles (non-negotiable)

1. **Protect capital first.** Every change that touches the execution path must name the new failure modes and verification steps before it merges.
2. **Pack is the contract.** Filters, exits, sort column, capital modifier, adaptive axes — all live on the `StrategyPack` row. No hidden constants. No scattered `settings.*.threshold`.
3. **Adaptive mutates down, not up.** Sizing multipliers compose to **≤1** in negative regimes; in positive regimes they multiply upward only within `RiskEngine.canOpenPosition` bounds. The risk engine remains authoritative.
4. **One session, one pack.** `TradingSession` stores `previousPackVersion` so revert is a one-call operation. Multiple concurrent live packs require separate sessions and separate risk budgets.
5. **Manual entries are first-class risk surfaces.** They honor the same reserve, sizing, cooldown, and capital constraints as automated entries.
6. **Provider-heavy logic reuses shared services.** Birdeye, Helius, Rugcheck, Trench etc. go through the budget-aware clients so cache, batching, and purpose stay visible.
7. **Evidence before behavior change.** Every threshold or rejection-reason change persists an audit row (`AdaptiveThresholdLog`, `ConfigSnapshot`, `StrategyPackVersion`).

## 3. Guardrails (what must not break)

1. **No live-capital code path changes in phases 1–3.** Reads, writes-behind-flag, and dual-write verification only.
2. **Pack publish to LIVE is two explicit steps:** `publish(pack → TESTING)` then `startSession(pack, mode=LIVE)` with operator confirmation. No silent promotion.
3. **Rollback is always one call.** `TradingSession.previousPackVersion` → `revert` re-applies to runtime-config.
4. **Every metadata→column promotion is dual-write ≥7 days** before the blob read path is removed.
5. **Exit-engine live mutators** ship behind `settings.exits.liveMutators.enabled`, paper-verified on 30 exits per mutator before touching live capital.
6. **Webhook churn ceiling:** Helius webhooks capped at 5 per active position + 60 smart-wallet. Exceeding cap = dashboard warning, never silent failure.
7. **Pack grade propagation:** `status=LIVE` requires `grade ∈ {A, B}`. Enforced at the API layer, not trusted to UI.
8. **Capital brake owns the last word.** `RiskEngine.canOpenPosition` stays authoritative; adaptive sizing only multiplies downward within its bounds.
9. **No backtest-only fitness.** A pack promotes to `GRADED` only if sandbox live-tape run matches backtest outcome within tolerance (see `PackGradingService`).
10. **No quota-blind enrichment.** New providers must declare TTL and budget class; `ProviderBudgetService` gates every fetch.

## 4. Session flow (operator's day)

1. Open `Overview` — lane status green, capital free > threshold.
2. Open `Sessions` — confirm the LIVE pack + version, check last session's realized PnL + grade.
3. If tuning: `Packs` → clone LIVE → `Editor` → adjust → `Sandbox` (≥30 min) → `Grader` → accept tuning deltas → publish `DRAFT → TESTING`.
4. If promoting: TESTING pack → 48 h sandbox ≥10 triggered candidates → `GRADED`.
5. Start `TradingSession(mode=LIVE)` — `previousPackVersion` stored automatically. 2FA + IP gate on mode=LIVE.
6. Watch `Live Session Health` (Grafana). Pause on symptoms, never on hunches.
7. At end-of-day: `Grader` review of today's winners/losers, optional Notion/Obsidian recap.

## 5. Strategy packs — design principles

1. **4 filters + grad + time.** Keep the filter set tight (see [draft_strategy_packs_v2.md](draft_strategy_packs_v2.md)). More filters = brittle, backtest-flattering, live-poor.
2. **Sort column is part of the pack.** The Birdeye meme-list query changes by pack; sort column determines which tokens surface first under budget.
3. **Capital modifier is per-pack.** Runners 1.3–1.5×, scalps 0.55–1.1×. No global scalar; packs own their risk appetite inside `RiskEngine` bounds.
4. **Adaptive axes mutate baseline, never override sort or filter identity.** If a pack's sort column is `volume_24h_usd`, the adaptive engine cannot change that — only filter thresholds and exit deltas.
5. **Runners and scalps do not share exit tables.** Runners use MC-tiered base with wide TP2. Scalps use tight SL / TP1.
6. **Graduation-age taper is non-optional.** Every pack's exits taper with minutes-since-graduation (see v2 doc §C).

## 6. Documentation responsibilities

- Strategy contract changes → update [notes/reference/strategy.md](notes/reference/strategy.md) in the same pass.
- New providers → update market-stats doc + add TTL/budget in `TokenEnrichmentService`.
- Pack changes → update the pack's DB row; `StrategyPackVersion` captures history. No loose markdown as source of truth.
- Planning docs (`draft_*.md`) are transient. Once a phase lands, migrate its content into `notes/reference/*` and delete the draft.
