/**
 * Yoke Antigravity - Status Bar Manager
 * Manages all status bar items
 * @module ui/status-bar
 */

import * as vscode from 'vscode';
import { config } from '../utils/config';
import { createLogger } from '../utils/logger';
import { SessionStats } from '../utils/constants';

const log = createLogger('StatusBar');

export interface StatusBarState {
    autoAllEnabled: boolean;
    multiTabEnabled: boolean;
    yokeModeEnabled: boolean;
    loopCount: number;
}

export class StatusBarManager {
    private statusAutoAll: vscode.StatusBarItem;
    private statusMultiTab: vscode.StatusBarItem;
    private statusYoke: vscode.StatusBarItem;
    private statusSettings: vscode.StatusBarItem;
    private disposed = false;

    constructor(context: vscode.ExtensionContext) {
        // Auto-All (leftmost)
        this.statusAutoAll = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            103
        );
        this.statusAutoAll.command = 'yoke.toggleAutoAll';
        context.subscriptions.push(this.statusAutoAll);

        // Multi-Tab
        this.statusMultiTab = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            102
        );
        this.statusMultiTab.command = 'yoke.toggleMultiTab';
        context.subscriptions.push(this.statusMultiTab);

        // Yoke Mode
        this.statusYoke = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            101
        );
        this.statusYoke.command = 'yoke.toggleYokeMode';
        context.subscriptions.push(this.statusYoke);

        // Settings Gear
        this.statusSettings = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusSettings.command = 'yoke.openSettings';
        this.statusSettings.text = '$(gear) Yoke';
        this.statusSettings.tooltip = 'Open Yoke Dashboard';
        context.subscriptions.push(this.statusSettings);

        // Show initial state
        this.statusAutoAll.show();
        this.statusYoke.show();
        this.statusSettings.show();

        log.info('Status bar initialized');
    }

    update(state: StatusBarState): void {
        if (this.disposed) return;

        // Auto-All
        if (state.autoAllEnabled) {
            this.statusAutoAll.text = '$(check) Auto-All';
            this.statusAutoAll.tooltip = 'Auto-accept ON - Click to toggle';
            this.statusAutoAll.backgroundColor = undefined;
        } else {
            this.statusAutoAll.text = '$(circle-slash) Auto-All';
            this.statusAutoAll.tooltip = 'Auto-accept OFF - Click to toggle';
            this.statusAutoAll.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
        }

        // Multi-Tab (only show when Auto-All is on)
        if (state.autoAllEnabled) {
            this.statusMultiTab.show();
            if (state.multiTabEnabled) {
                this.statusMultiTab.text = '$(check-all) Multi-Tab';
                this.statusMultiTab.tooltip = 'All tabs - Click to toggle';
            } else {
                this.statusMultiTab.text = '$(browser) Single-Tab';
                this.statusMultiTab.tooltip = 'Single tab - Click to toggle';
            }
        } else {
            this.statusMultiTab.hide();
        }

        // Yoke Mode
        if (state.yokeModeEnabled) {
            this.statusYoke.text = `$(sync~spin) Yoke #${state.loopCount}`;
            this.statusYoke.tooltip = `Autonomous loop running - Click to stop`;
            this.statusYoke.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.prominentBackground'
            );
        } else {
            this.statusYoke.text = '$(debug-pause) Yoke';
            this.statusYoke.tooltip = 'Start autonomous loop';
            this.statusYoke.backgroundColor = undefined;
        }
    }

    dispose(): void {
        this.disposed = true;
        this.statusAutoAll.dispose();
        this.statusMultiTab.dispose();
        this.statusYoke.dispose();
        this.statusSettings.dispose();
    }
}
