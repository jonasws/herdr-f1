import { describe, expect, it } from 'vitest';
import { createClassicPaceTracker } from '../src/server/classic-pace.js';
import { MultiplayerRules } from '../src/server/rules.js';
import { agent, snap, team } from './helpers/session.js';

const { uptimeFloor, uptimeSpan, uptimeWindowSeconds } = MultiplayerRules;
const factorOf = (
  pace: ReturnType<typeof createClassicPaceTracker>,
  terminalID: string,
  now: number,
): number => pace.factors(now).find(f => f.terminalID === terminalID)!.factor;

describe('classic earned pace', () => {
  it('floors a never-worked car and rewards a full window of work', () => {
    const pace = createClassicPaceTracker();
    pace.observe(snap(team('ws', 'ws', [agent('t1', 'idle')])), 0);
    expect(factorOf(pace, 't1', 0)).toBeCloseTo(uptimeFloor, 6);

    pace.observe(snap(team('ws', 'ws', [agent('t1', 'working')])), 0);
    // A full window spent working reaches the top of the band.
    expect(factorOf(pace, 't1', uptimeWindowSeconds)).toBeCloseTo(uptimeFloor + uptimeSpan, 6);
  });

  it('sorts a busy car ahead of a stalled one', () => {
    const pace = createClassicPaceTracker();
    pace.observe(snap(team('ws', 'ws', [agent('busy', 'working'), agent('stalled', 'idle')])), 0);
    const now = uptimeWindowSeconds;
    expect(factorOf(pace, 'busy', now)).toBeGreaterThan(factorOf(pace, 'stalled', now));
  });

  it('decays a car that stops working back toward the floor', () => {
    const pace = createClassicPaceTracker();
    pace.observe(snap(team('ws', 'ws', [agent('t1', 'working')])), 0);
    const peak = factorOf(pace, 't1', uptimeWindowSeconds);
    pace.observe(snap(team('ws', 'ws', [agent('t1', 'idle')])), uptimeWindowSeconds);
    // Half a window later, half the earned tilt is gone.
    const halfway = factorOf(pace, 't1', uptimeWindowSeconds * 1.5);
    expect(halfway).toBeLessThan(peak);
    expect(halfway).toBeCloseTo(uptimeFloor + uptimeSpan * 0.5, 6);
  });

  it('decays a car that vanishes from the snapshot', () => {
    const pace = createClassicPaceTracker();
    pace.observe(snap(team('ws', 'ws', [agent('t1', 'working')])), 0);
    // Pane closed: t1 is gone from the next snapshot, so it stops earning.
    pace.observe(snap(team('ws', 'ws', [])), uptimeWindowSeconds);
    expect(factorOf(pace, 't1', uptimeWindowSeconds * 2)).toBeCloseTo(uptimeFloor, 6);
  });
});
