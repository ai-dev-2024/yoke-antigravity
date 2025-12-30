/**
 * Yoke - Rate Limiter
 * Tracks API usage per model and manages rate limits
 */

import * as fs from 'fs';
import * as path from 'path';
import { ModelId } from './model-selector';

const STATE_FILE = '.yoke-rate-limits.json';

export interface ModelUsage {
    callCount: number;
    lastReset: number; // timestamp
    isLimited: boolean;
}

export interface RateLimitState {
    models: Record<ModelId, ModelUsage>;
    globalCalls: number;
    sessionStart: number;
}

// Default rate limit configuration (calls per 5-hour window)
const DEFAULT_LIMITS: Record<ModelId, number> = {
    'claude-opus-4.5-thinking': 50,
    'claude-sonnet-4.5-thinking': 100,
    'claude-sonnet-4.5': 150,
    'gemini-3-pro-high': 100,
    'gemini-3-pro-low': 200,
    'gemini-3-flash': 300,
    'gpt-oss-120b': 200
};

const RESET_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours

export class RateLimiter {
    private state: RateLimitState;
    private stateFile: string;
    private limits: Record<ModelId, number>;

    constructor(projectDir: string, customLimits?: Partial<Record<ModelId, number>>) {
        this.stateFile = path.join(projectDir, STATE_FILE);
        this.limits = { ...DEFAULT_LIMITS, ...customLimits };
        this.state = this.loadState();
        this.checkResetPeriod();
    }

    private loadState(): RateLimitState {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = fs.readFileSync(this.stateFile, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.warn('Failed to load rate limit state, initializing new state');
        }

        return this.initializeState();
    }

    private initializeState(): RateLimitState {
        const models: Record<string, ModelUsage> = {};

        for (const modelId of Object.keys(DEFAULT_LIMITS)) {
            models[modelId] = {
                callCount: 0,
                lastReset: Date.now(),
                isLimited: false
            };
        }

        return {
            models: models as Record<ModelId, ModelUsage>,
            globalCalls: 0,
            sessionStart: Date.now()
        };
    }

    private saveState(): void {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
        } catch (error) {
            console.warn('Failed to save rate limit state');
        }
    }

    private checkResetPeriod(): void {
        const now = Date.now();

        for (const [modelId, usage] of Object.entries(this.state.models)) {
            if (now - usage.lastReset >= RESET_INTERVAL_MS) {
                this.state.models[modelId as ModelId] = {
                    callCount: 0,
                    lastReset: now,
                    isLimited: false
                };
            }
        }

        this.saveState();
    }

    /**
     * Check if a model is available (not rate limited)
     */
    isModelAvailable(modelId: ModelId): boolean {
        const usage = this.state.models[modelId];
        if (!usage) return true;

        this.checkResetPeriod();
        return usage.callCount < this.limits[modelId];
    }

    /**
     * Record a call to a specific model
     */
    recordCall(modelId: ModelId): void {
        if (!this.state.models[modelId]) {
            this.state.models[modelId] = {
                callCount: 0,
                lastReset: Date.now(),
                isLimited: false
            };
        }

        this.state.models[modelId].callCount++;
        this.state.globalCalls++;

        // Check if this model is now limited
        if (this.state.models[modelId].callCount >= this.limits[modelId]) {
            this.state.models[modelId].isLimited = true;
        }

        this.saveState();
    }

    /**
     * Get list of unavailable (rate-limited) models
     */
    getUnavailableModels(): ModelId[] {
        this.checkResetPeriod();

        return Object.entries(this.state.models)
            .filter(([_, usage]) => usage.isLimited || usage.callCount >= this.limits[_ as ModelId])
            .map(([modelId]) => modelId as ModelId);
    }

    /**
     * Get usage statistics for all models
     */
    getStats(): { modelId: ModelId; used: number; limit: number; available: boolean }[] {
        this.checkResetPeriod();

        return Object.entries(this.limits).map(([modelId, limit]) => {
            const usage = this.state.models[modelId as ModelId];
            return {
                modelId: modelId as ModelId,
                used: usage?.callCount || 0,
                limit,
                available: this.isModelAvailable(modelId as ModelId)
            };
        });
    }

    /**
     * Get time until next reset for a model
     */
    getTimeUntilReset(modelId: ModelId): number {
        const usage = this.state.models[modelId];
        if (!usage) return 0;

        const elapsed = Date.now() - usage.lastReset;
        return Math.max(0, RESET_INTERVAL_MS - elapsed);
    }

    /**
     * Get global call count across all models
     */
    getGlobalCalls(): number {
        return this.state.globalCalls;
    }

    /**
     * Reset all rate limits (for testing/admin)
     */
    resetAll(): void {
        this.state = this.initializeState();
        this.saveState();
    }
}
