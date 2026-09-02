import { describe, expect, it } from 'vitest';
import { computeDelay, shouldGiveUp, DEFAULT_BACKOFF, type BackoffConfig } from './backoff';

const cfg: BackoffConfig = { baseMs: 1000, factor: 2, capMs: 30_000, maxAttempts: 3 };

describe('computeDelay', () => {
    it('returns 0 when attempt < 1', () => {
        expect(computeDelay(0, cfg, () => 1)).toBe(0);
        expect(computeDelay(-5, cfg, () => 1)).toBe(0);
    });

    it('never exceeds capMs', () => {
        for (let attempt = 1; attempt <= 20; attempt++) {
            expect(computeDelay(attempt, cfg, () => 1)).toBeLessThanOrEqual(cfg.capMs);
        }
    });

    it('is always non-negative', () => {
        for (let attempt = 1; attempt <= 10; attempt++) {
            expect(computeDelay(attempt, cfg, () => 0)).toBeGreaterThanOrEqual(0);
            expect(computeDelay(attempt, cfg, () => 0.5)).toBeGreaterThanOrEqual(0);
            expect(computeDelay(attempt, cfg, () => 1)).toBeGreaterThanOrEqual(0);
        }
    });

    it('applies full jitter (multiplies by random in [0,1])', () => {
        expect(computeDelay(1, cfg, () => 0)).toBe(0);
        expect(computeDelay(1, cfg, () => 1)).toBe(1000);
        expect(computeDelay(2, cfg, () => 1)).toBe(2000);
        expect(computeDelay(3, cfg, () => 1)).toBe(4000);
    });

    it('grows exponentially before the cap', () => {
        const random = () => 1;
        const d1 = computeDelay(1, cfg, random);
        const d2 = computeDelay(2, cfg, random);
        const d3 = computeDelay(3, cfg, random);
        expect(d2).toBeGreaterThan(d1);
        expect(d3).toBeGreaterThan(d2);
    });

    it('caps at capMs when exponential grows past it', () => {
        expect(computeDelay(10, cfg, () => 1)).toBe(cfg.capMs);
        expect(computeDelay(100, cfg, () => 1)).toBe(cfg.capMs);
    });
});

describe('shouldGiveUp', () => {
    it('returns false while attempts remain', () => {
        expect(shouldGiveUp(1, cfg)).toBe(false);
        expect(shouldGiveUp(2, cfg)).toBe(false);
    });

    it('returns true once maxAttempts is reached', () => {
        expect(shouldGiveUp(3, cfg)).toBe(true);
        expect(shouldGiveUp(4, cfg)).toBe(true);
    });
});

describe('DEFAULT_BACKOFF', () => {
    it('matches the agreed policy (3 attempts, 1s base, 30s cap)', () => {
        expect(DEFAULT_BACKOFF.maxAttempts).toBe(3);
        expect(DEFAULT_BACKOFF.baseMs).toBe(1_000);
        expect(DEFAULT_BACKOFF.capMs).toBe(30_000);
        expect(DEFAULT_BACKOFF.factor).toBe(2);
    });

    it('is frozen (cannot be mutated by consumers)', () => {
        expect(Object.isFrozen(DEFAULT_BACKOFF)).toBe(true);
    });
});
