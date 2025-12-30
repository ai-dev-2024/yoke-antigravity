/**
 * Circuit Breaker - Unit Tests
 * Tests the circuit breaker pattern for loop protection
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Simulate circuit breaker logic
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerState {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number | null;
}

function createCircuitBreaker(options: { failureThreshold: number; successThreshold: number }) {
    const state: CircuitBreakerState = {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
    };

    return {
        getState: () => state.state,

        canExecute: () => state.state !== 'OPEN',

        recordSuccess: () => {
            if (state.state === 'HALF_OPEN') {
                state.successCount++;
                if (state.successCount >= options.successThreshold) {
                    state.state = 'CLOSED';
                    state.failureCount = 0;
                    state.successCount = 0;
                }
            } else if (state.state === 'CLOSED') {
                state.failureCount = 0;
            }
            return true;
        },

        recordFailure: () => {
            state.failureCount++;
            state.lastFailureTime = Date.now();

            if (state.failureCount >= options.failureThreshold) {
                state.state = 'OPEN';
                return false;
            }
            return true;
        },

        reset: () => {
            state.state = 'CLOSED';
            state.failureCount = 0;
            state.successCount = 0;
            state.lastFailureTime = null;
        },

        tryReset: () => {
            if (state.state === 'OPEN') {
                state.state = 'HALF_OPEN';
                state.successCount = 0;
            }
        },
    };
}

describe('CircuitBreaker', () => {
    let circuitBreaker: ReturnType<typeof createCircuitBreaker>;

    beforeEach(() => {
        circuitBreaker = createCircuitBreaker({
            failureThreshold: 3,
            successThreshold: 2,
        });
    });

    describe('State Transitions', () => {
        it('should start in CLOSED state', () => {
            expect(circuitBreaker.getState()).toBe('CLOSED');
            expect(circuitBreaker.canExecute()).toBe(true);
        });

        it('should open after reaching failure threshold', () => {
            circuitBreaker.recordFailure();
            circuitBreaker.recordFailure();
            expect(circuitBreaker.getState()).toBe('CLOSED');

            circuitBreaker.recordFailure(); // 3rd failure
            expect(circuitBreaker.getState()).toBe('OPEN');
            expect(circuitBreaker.canExecute()).toBe(false);
        });

        it('should transition to HALF_OPEN on tryReset', () => {
            // Open the circuit
            for (let i = 0; i < 3; i++) circuitBreaker.recordFailure();
            expect(circuitBreaker.getState()).toBe('OPEN');

            circuitBreaker.tryReset();
            expect(circuitBreaker.getState()).toBe('HALF_OPEN');
        });

        it('should close after enough successes in HALF_OPEN', () => {
            // Open then half-open
            for (let i = 0; i < 3; i++) circuitBreaker.recordFailure();
            circuitBreaker.tryReset();

            circuitBreaker.recordSuccess();
            expect(circuitBreaker.getState()).toBe('HALF_OPEN');

            circuitBreaker.recordSuccess(); // 2nd success
            expect(circuitBreaker.getState()).toBe('CLOSED');
        });
    });

    describe('Reset Functionality', () => {
        it('should reset to initial state', () => {
            // Make some failures
            circuitBreaker.recordFailure();
            circuitBreaker.recordFailure();

            circuitBreaker.reset();

            expect(circuitBreaker.getState()).toBe('CLOSED');
            expect(circuitBreaker.canExecute()).toBe(true);
        });

        it('should allow execution after reset from OPEN', () => {
            // Open the circuit
            for (let i = 0; i < 3; i++) circuitBreaker.recordFailure();
            expect(circuitBreaker.canExecute()).toBe(false);

            circuitBreaker.reset();
            expect(circuitBreaker.canExecute()).toBe(true);
        });
    });

    describe('Success Handling', () => {
        it('should reset failure count on success in CLOSED state', () => {
            circuitBreaker.recordFailure();
            circuitBreaker.recordFailure(); // 2 failures

            circuitBreaker.recordSuccess(); // Should reset

            // Now 3 more failures needed to open
            circuitBreaker.recordFailure();
            circuitBreaker.recordFailure();
            expect(circuitBreaker.getState()).toBe('CLOSED');
        });
    });
});
