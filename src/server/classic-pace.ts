import { allAgents, type SourceSnapshot } from './herdr/types.js';
import { createUptimeTracker, type UptimeTracker } from './multiplayer/uptime.js';
import { MultiplayerRules } from './rules.js';

/**
 * Classic-mode earned pace: the same rolling-uptime tilt multiplayer earns
 * (M4), brought to a single local Herdr session. Each car's externalPace
 * reflects how much of the last 90 seconds that agent actually spent working,
 * so position reads as productivity — a stalled agent drifts back, a busy one
 * pulls ahead. The seeded jitter stays on untouched as decoration; this only
 * drives externalPace, so the two compose (truthful seat + lively wiggle).
 *
 * The band is floored at MultiplayerRules.uptimeFloor, so a car that has done
 * no work slows but keeps circulating rather than freezing. That is the
 * graceful-degradation property: an agent whose harness Herdr classifies
 * coarsely (or briefly mislabels) still races on the floor plus its jitter,
 * indistinguishable from classic's original decorative motion.
 */
export function createClassicPaceTracker() {
  const trackers = new Map<string, UptimeTracker>();

  function track(terminalID: string): UptimeTracker {
    let tracker = trackers.get(terminalID);
    if (!tracker) {
      tracker = createUptimeTracker(MultiplayerRules.uptimeWindowSeconds);
      trackers.set(terminalID, tracker);
    }
    return tracker;
  }

  /** Records each agent's instantaneous working power from one snapshot. */
  function observe(snapshot: SourceSnapshot, now: number): void {
    const present = new Set<string>();
    for (const agent of allAgents(snapshot)) {
      if (agent.terminalID === '') continue;
      present.add(agent.terminalID);
      track(agent.terminalID).setPower(now, agent.status === 'working' ? 1 : 0);
    }
    // An agent that left the snapshot (pane closed, agent exited) stops
    // earning: its car decays to the floor instead of holding its last speed.
    for (const [terminalID, tracker] of trackers) {
      if (!present.has(terminalID)) tracker.setPower(now, 0);
    }
  }

  /** The externalPace factor for every tracked car, for the dashboard to inject
   *  each tick (mirrors the multiplayer host's momentum loop). */
  function factors(now: number): Array<{ terminalID: string; factor: number }> {
    const result: Array<{ terminalID: string; factor: number }> = [];
    for (const [terminalID, tracker] of trackers) {
      result.push({
        terminalID,
        factor: MultiplayerRules.uptimeFloor + MultiplayerRules.uptimeSpan * tracker.uptime(now),
      });
    }
    return result;
  }

  return { observe, factors };
}
