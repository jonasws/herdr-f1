import { describe, expect, it } from 'vitest';
import {
  classicEarnedPace, classicEarnedPaceJitterHalfWidth,
  MultiplayerRules, RaceRules, seededPace, stableHash,
} from '../src/server/rules.js';
import { palette } from '../src/web/palette.js';

describe('RaceRules', () => {
  it('matches the Swift constants', () => {
    expect(RaceRules).toMatchObject({
      totalLaps: 58, baseLapDuration: 18, baseSpeed: 1 / 18,
      paceMin: 0.75, paceMax: 1.25, doneCooldownFactor: 0.25,
      maximumAcceptedStep: 1, podiumDuration: 8, newEntrantDeficit: 0.15,
      newStintDuration: 4, paletteSize: 11, maximumGridNumber: 99,
    });
  });

  // The server hands out colour slots against paletteSize while the colours
  // themselves live on the client. If the two drift, teams silently share a
  // livery (array longer) or wrap onto one (array shorter).
  it('paletteSize matches the number of constructor colours', () => {
    expect(RaceRules.paletteSize).toBe(palette.teamColors.length);
  });

  it('every constructor colour is a distinct opaque hex', () => {
    for (const colour of palette.teamColors) {
      expect(colour).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(new Set(palette.teamColors).size).toBe(palette.teamColors.length);
  });
});

describe('stableHash', () => {
  it('is 64-bit FNV-1a (known vectors)', () => {
    // Standard FNV-1a test vectors.
    expect(stableHash('')).toBe(14695981039346656037n);
    expect(stableHash('a')).toBe(0xaf63dc4c8601ec8cn);
    expect(stableHash('foobar')).toBe(0x85944171f73967e8n);
  });

  it('is stable across calls and encodes UTF-8', () => {
    expect(stableHash('터미널-1')).toBe(stableHash('터미널-1'));
    expect(stableHash('t1')).not.toBe(stableHash('t2'));
  });
});

describe('seededPace', () => {
  it('stays within the pace range', () => {
    for (let lap = 0; lap < 58; lap += 1) {
      const pace = seededPace(1, 'terminal-a', lap);
      expect(pace).toBeGreaterThanOrEqual(RaceRules.paceMin);
      expect(pace).toBeLessThanOrEqual(RaceRules.paceMax);
    }
  });

  it('is deterministic per (grandPrix, terminal, lap) and varies across laps', () => {
    expect(seededPace(1, 't1', 3)).toBe(seededPace(1, 't1', 3));
    const paces = new Set(Array.from({ length: 10 }, (_, lap) => seededPace(1, 't1', lap)));
    expect(paces.size).toBeGreaterThan(1);
    expect(seededPace(1, 't1', 3)).not.toBe(seededPace(2, 't1', 3));
  });
});

describe('classicEarnedPace', () => {
  it('narrows the seeded jitter to the earned half-width', () => {
    for (let lap = 0; lap < 58; lap += 1) {
      const pace = classicEarnedPace(1, 't1', lap);
      expect(pace).toBeGreaterThanOrEqual(1 - classicEarnedPaceJitterHalfWidth - 1e-9);
      expect(pace).toBeLessThanOrEqual(1 + classicEarnedPaceJitterHalfWidth + 1e-9);
    }
  });

  it('stays inside the uptime band so working always out-seats idle', () => {
    // A fully-working car (externalPace uptimeFloor+uptimeSpan) at its jitter
    // minimum must still beat a fully-idle car (uptimeFloor) at its maximum.
    const { uptimeFloor, uptimeSpan } = MultiplayerRules;
    const workingFloor = (uptimeFloor + uptimeSpan) * (1 - classicEarnedPaceJitterHalfWidth);
    const idleCeiling = uptimeFloor * (1 + classicEarnedPaceJitterHalfWidth);
    expect(workingFloor).toBeGreaterThan(idleCeiling);
  });
});
