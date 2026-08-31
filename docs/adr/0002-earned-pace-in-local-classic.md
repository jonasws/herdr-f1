---
status: accepted
date: 2026-08-31
---

# Earn local classic car speed through uptime, keeping the seeded dice as flavour

Local classic racing now tilts each car's speed by the rolling uptime the agent
has earned, on top of the seeded per-lap jitter it already had. A car's position
becomes a reading of how much of the last 90 seconds that agent actually spent
working, while the dice keep the pack visibly alive.

## Context

Two pace algorithms existed, and their split turned out to be path-dependent
rather than a considered design of two contrasting modes:

- **Classic pace (`seededPace`)** is a verbatim port from the original native
  SpriteKit app (`rules.ts`: *"Values are the Swift RaceRules constants
  verbatim"*). That app was a single-session, decorative race view with no
  concept of earned rank. Its ±25% per-lap RNG was inherited into this package
  in the first commit and never revisited.
- **Uptime (`createUptimeTracker`, M4)** was introduced later, with the
  multiplayer rewrite, specifically because competing players need a *fair,
  earned* ranking — dice-decided standings between people are meaningless. There
  `seededPace` is squeezed to ±5% flavour and speed is earned via uptime.

The git history shows no decision to keep classic on RNG once uptime existed;
uptime simply rode in with multiplayer and classic's inherited dice were left
alone. The only documented principle — *competition needs an earned signal* —
explains multiplayer; it does not forbid the same signal locally.

Reframed, "single player" is misleading: a local session often runs several
agents that race each other. The watcher does care who leads. The stakes are not
*fairness* (there is no opponent, and you can already see the truth in Herdr) but
*legibility* — a truthful order lets you triage attention across your own fleet,
and that value grows with the number of agents. Under that goal, RNG is not just
flavour; a dice-decided lead is actively misleading, sending your eye to the
wrong agent.

We also considered seeding speed from inference throughput (tokens/second),
reachable via a Herdr pane scrape (`pane.output_matched`) or Claude Code's
OpenTelemetry `api_request` log. Rejected: measured throughput is near-constant
for a healthy model, so it clusters the field instead of spreading it; its only
real variance is generating-or-not, which is exactly the working/idle status the
uptime signal already captures. It is also agent-kind specific, whereas uptime
derives purely from the status enum Herdr reports for every kind it recognizes.

## Decision

- Local classic composes two independent factors of one speed, using the seam
  the race session already exposes: `speed = base × pace.multiplier (jitter) ×
  externalPace (earned)`. Multiplayer already drives `externalPace` from uptime;
  classic previously left it at 1.0. It no longer does.
- `createClassicPaceTracker` (`classic-pace.ts`) keeps a per-terminal
  `createUptimeTracker`, fed `working ? 1 : 0` from each Herdr snapshot, and
  yields `uptimeFloor + uptimeSpan × uptime` (0.75–1.25) per car. The classic
  dashboard injects these on a 250 ms cadence, mirroring the multiplayer host's
  momentum loop.
- The seeded jitter narrows to ±10% for classic (`classicEarnedPace`). The
  uptime band spans ±0.25 around 1.0, so any jitter under 0.25 keeps a
  fully-working car strictly ahead of a fully-idle one; ±10% clears the extremes
  by a wide margin (1.125 vs 0.825) while the pack still breathes.
- The feature is always on in local classic — it is the combined mode, not a
  toggle. Multiplayer classic and continuous are unchanged.

### Graceful degradation

The earned band is floored at `uptimeFloor`, so a car that has done no work
slows but keeps circulating rather than freezing. Combined with the retained
jitter, an agent whose harness Herdr classifies coarsely — or briefly mislabels
— still races, indistinguishable from classic's original decorative motion.
Every raced car already carries a known status (the projector filters unknown
ones out), so uptime is always computable; there is no per-harness metric
extraction to get right. Blocked cars keep their existing yellow-flag / Safety
Car stop, which is owned elsewhere and left untouched.

## Consequences

- Local classic shifts in character from ambient decoration toward a fleet
  productivity monitor. When every agent works steadily the field stays a tight,
  breathing pack (nothing to triage); it spreads exactly when an agent stalls.
- `seededPace`'s reproducible-across-launches property no longer holds for the
  live local view, because motion now reflects live activity. `seededPace`
  itself is unchanged and still used by multiplayer and the fixtures.
- If a mode that is purely the ported decoration is ever wanted, it can be
  reintroduced behind a flag; it was omitted here because the request was for the
  combined behaviour.

## Alternatives rejected

- **Seed speed from tokens/second** (pane scrape or OTel): near-constant signal
  clusters the field; only real variance is generating-or-not, already covered
  by status; agent-kind specific.
- **Replace RNG entirely with uptime:** discards the jitter that keeps the pack
  visually alive and the extremes readable; at the ±10% chosen, order already
  reads while motion stays lively.
- **A separate opt-in monitor mode:** more surface for a behaviour that degrades
  gracefully to the old look on its own; no configuration earned its keep.
