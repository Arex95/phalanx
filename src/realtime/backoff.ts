export interface BackoffConfig {
    /** Delay before the first retry, doubled from there. */
    baseMs: number;
    factor: number;
    /** Ceiling, so a long outage does not push the delay to hours. */
    capMs: number;
    /** Attempts before the connection gives up and waits for the user. */
    maxAttempts: number;
}

export const DEFAULT_BACKOFF: BackoffConfig = Object.freeze({
    baseMs: 1_000,
    factor: 2,
    capMs: 30_000,
    maxAttempts: 3
});

/**
 * Delay before attempt `n`, exponential and capped, then multiplied by a random
 * factor.
 *
 * The randomness is the point: without it every client that lost the same
 * outage reconnects on the same tick and the recovering server takes the whole
 * fleet at once.
 */
export function computeDelay(
    attempt: number,
    config: BackoffConfig = DEFAULT_BACKOFF,
    random: () => number = Math.random
): number {
    if (attempt < 1) return 0;
    const exponential = config.baseMs * Math.pow(config.factor, attempt - 1);
    const capped = Math.min(config.capMs, exponential);
    return Math.floor(capped * random());
}

export function shouldGiveUp(attempt: number, config: BackoffConfig = DEFAULT_BACKOFF): boolean {
    return attempt >= config.maxAttempts;
}
