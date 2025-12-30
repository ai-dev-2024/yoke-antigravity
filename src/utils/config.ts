/**
 * Yoke Antigravity - Configuration Manager
 * @module config
 */

import * as vscode from 'vscode';
import { YokeConfig, DEFAULT_CONFIG, ModelIdType } from './constants';

class ConfigurationManager {
    private static instance: ConfigurationManager;

    private constructor() { }

    static getInstance(): ConfigurationManager {
        if (!ConfigurationManager.instance) {
            ConfigurationManager.instance = new ConfigurationManager();
        }
        return ConfigurationManager.instance;
    }

    private getConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('yoke');
    }

    get<K extends keyof YokeConfig>(key: K): YokeConfig[K] {
        const config = this.getConfig();
        return config.get(key, DEFAULT_CONFIG[key]);
    }

    async set<K extends keyof YokeConfig>(key: K, value: YokeConfig[K]): Promise<void> {
        const config = this.getConfig();
        await config.update(key, value, vscode.ConfigurationTarget.Global);
    }

    getAll(): YokeConfig {
        return {
            autoAllEnabled: this.get('autoAllEnabled'),
            multiTabEnabled: this.get('multiTabEnabled'),
            yokeModeEnabled: this.get('yokeModeEnabled'),
            autoSwitchModels: this.get('autoSwitchModels'),
            autoGitCommit: this.get('autoGitCommit'),
            loopInterval: this.get('loopInterval'),
            maxLoopsPerSession: this.get('maxLoopsPerSession'),
            pollFrequency: this.get('pollFrequency'),
            bannedCommands: this.get('bannedCommands'),
            preferredModelForReasoning: this.get('preferredModelForReasoning'),
            preferredModelForFrontend: this.get('preferredModelForFrontend'),
            preferredModelForQuick: this.get('preferredModelForQuick'),
            executionTimeout: this.get('executionTimeout'),
            maxCallsPerHour: this.get('maxCallsPerHour'),
            maxConsecutiveTestLoops: this.get('maxConsecutiveTestLoops'),
        };
    }

    async setMultiple(updates: Partial<YokeConfig>): Promise<void> {
        for (const [key, value] of Object.entries(updates)) {
            await this.set(key as keyof YokeConfig, value as YokeConfig[keyof YokeConfig]);
        }
    }

    getModelForTaskType(taskType: 'reasoning' | 'frontend' | 'quick'): ModelIdType {
        switch (taskType) {
            case 'reasoning':
                return this.get('preferredModelForReasoning');
            case 'frontend':
                return this.get('preferredModelForFrontend');
            case 'quick':
                return this.get('preferredModelForQuick');
            default:
                return this.get('preferredModelForReasoning');
        }
    }
}

export const config = ConfigurationManager.getInstance();
