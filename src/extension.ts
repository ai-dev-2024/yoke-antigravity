/**
 * Yoke Antigravity - Main Extension Entry Point
 * Replicates AUTO-ALL-Antigravity's working flow + adds Yoke features
 * @module extension
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { StatusBarManager } from './ui/status-bar';
import { DashboardPanel } from './ui/dashboard';
import { config } from './utils/config';
import { createLogger } from './utils/logger';
import { autonomousLoop } from './core/autonomous-loop';
import { circuitBreaker } from './core/circuit-breaker';
import { progressTracker } from './core/progress-tracker';

const log = createLogger('Extension');

// ============ State (matches old extension) ============
let statusBar: StatusBarManager;
let cdpHandler: any = null;
let relauncher: any = null;
let pollTimer: NodeJS.Timeout | null = null;
let currentIDE = 'Antigravity';
let globalContext: vscode.ExtensionContext;

// ============ Activation (matches old extension flow) ============
export function activate(context: vscode.ExtensionContext): void {
    globalContext = context;
    log.info('Yoke Antigravity activating...');

    // Detect IDE
    const appName = vscode.env.appName || '';
    if (appName.toLowerCase().includes('cursor')) currentIDE = 'Cursor';
    else if (appName.toLowerCase().includes('antigravity')) currentIDE = 'Antigravity';
    log.info(`Detected IDE: ${currentIDE}`);

    // Initialize CDP handler from main_scripts (SAME AS OLD EXTENSION)
    try {
        const cdpHandlerPath = path.join(context.extensionPath, 'main_scripts', 'cdp-handler.js');
        const relauncherPath = path.join(context.extensionPath, 'main_scripts', 'relauncher.js');

        const { CDPHandler } = require(cdpHandlerPath);
        const { Relauncher, BASE_CDP_PORT } = require(relauncherPath);

        cdpHandler = new CDPHandler(BASE_CDP_PORT, BASE_CDP_PORT + 10, log.info.bind(log));

        // CRITICAL: Set Pro status like old extension (enables all features)
        if (cdpHandler.setProStatus) {
            cdpHandler.setProStatus(true);
        }

        // Set log file like old extension
        try {
            const logPath = path.join(context.extensionPath, 'yoke-cdp.log');
            cdpHandler.setLogFile(logPath);
        } catch { }

        relauncher = new Relauncher(log.info.bind(log));
        log.info('CDP handler and relauncher initialized with Pro status');
    } catch (err) {
        log.warn(`Failed to load CDP modules: ${(err as Error).message}`);
    }

    // Initialize status bar
    statusBar = new StatusBarManager(context);
    updateStatusBar();

    // Register commands
    registerCommands(context);

    // Set up autonomous loop status callback
    autonomousLoop.setStatusCallback((status) => {
        updateStatusBar();
        if (!status.running) {
            config.set('yokeModeEnabled', false);
        }
    });

    // Check environment and start (SAME AS OLD EXTENSION)
    checkEnvironmentAndStart().catch(err => {
        log.warn(`Environment check error: ${(err as Error).message}`);
    });

    log.info('Yoke Antigravity activated!');
}

// ============ Environment Check (SAME AS OLD EXTENSION) ============
async function checkEnvironmentAndStart(): Promise<void> {
    if (config.get('autoAllEnabled')) {
        log.info('Initializing Yoke Auto-All environment...');
        await ensureCDPOrPrompt(false); // Silent on startup
        await startPolling();
    }
    updateStatusBar();
}

async function ensureCDPOrPrompt(showPrompt: boolean): Promise<void> {
    if (!cdpHandler) return;

    log.info('Checking for active CDP session...');
    const cdpAvailable = await cdpHandler.isCDPAvailable();
    log.info(`CDP Available = ${cdpAvailable}`);

    if (cdpAvailable) {
        log.info('CDP is active and available.');
    } else {
        log.info('CDP not found on expected ports (9000-9030).');

        if (showPrompt && relauncher) {
            log.info('Prompting user for relaunch...');
            await relauncher.showRelaunchPrompt();
        } else {
            log.info('Skipping relaunch prompt. User can click status bar to trigger.');
        }
    }
}

// ============ Polling (SAME AS OLD EXTENSION) ============
async function startPolling(): Promise<void> {
    if (pollTimer) clearInterval(pollTimer);
    log.info('Yoke: Starting CDP polling...');

    await syncCDPSession();

    pollTimer = setInterval(async () => {
        if (!config.get('autoAllEnabled')) {
            await stopPolling();
            return;
        }
        await syncCDPSession();
    }, 5000);
}

async function syncCDPSession(): Promise<void> {
    if (!cdpHandler) return;

    try {
        await cdpHandler.start({
            isPro: true,
            isBackgroundMode: config.get('multiTabEnabled'),
            pollInterval: config.get('pollFrequency'),
            ide: currentIDE,
            bannedCommands: []
        });
    } catch (err) {
        log.warn(`CDP sync error: ${(err as Error).message}`);
    }
}

async function stopPolling(): Promise<void> {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (cdpHandler) {
        try {
            await cdpHandler.stop();
        } catch { }
    }
    log.info('Yoke: Polling stopped');
}

// ============ Commands ============
function registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('yoke.toggleAutoAll', toggleAutoAll),
        vscode.commands.registerCommand('yoke.toggleMultiTab', toggleMultiTab),
        vscode.commands.registerCommand('yoke.toggleYokeMode', toggleYokeMode),
        vscode.commands.registerCommand('yoke.openSettings', () => openDashboard(context)),
        vscode.commands.registerCommand('yoke.resetCircuitBreaker', resetCircuitBreaker)
    );
}

// ============ Toggle Functions (SAME FLOW AS OLD EXTENSION) ============
async function toggleAutoAll(): Promise<void> {
    const current = config.get('autoAllEnabled');
    await config.set('autoAllEnabled', !current);

    log.info(`Auto-All toggled: ${!current}`);
    updateStatusBar();

    if (!current) {
        // Enabling - same as old extension
        log.info('Yoke Auto-All: Enabled');
        vscode.window.showInformationMessage('✅ Yoke Auto-All: ON');
        ensureCDPOrPrompt(true).then(() => startPolling());
    } else {
        // Disabling
        log.info('Yoke Auto-All: Disabled');
        vscode.window.showInformationMessage('⏸️ Yoke Auto-All: OFF');
        await stopPolling();
    }
}

async function toggleMultiTab(): Promise<void> {
    if (!config.get('autoAllEnabled')) {
        vscode.window.showWarningMessage('Enable Auto-All first to use Multi-Tab');
        return;
    }

    const current = config.get('multiTabEnabled');
    await config.set('multiTabEnabled', !current);

    vscode.window.showInformationMessage(
        !current ? '✅ Multi-Tab: ON' : '⏸️ Multi-Tab: OFF'
    );

    // Re-sync with new mode
    if (config.get('autoAllEnabled')) {
        await syncCDPSession();
    }

    updateStatusBar();
}

async function toggleYokeMode(): Promise<void> {
    // Use actual loop state, not config - this ensures proper sync
    const isRunning = autonomousLoop.isRunning();

    // Update config to match the intended new state
    await config.set('yokeModeEnabled', !isRunning);

    if (!isRunning) {
        log.info('AI Autonomous Mode enabled');

        // Auto-enable prerequisites
        if (!config.get('autoAllEnabled')) {
            log.info('Auto-enabling Auto-All as prerequisite');
            await config.set('autoAllEnabled', true);
            ensureCDPOrPrompt(true).then(() => startPolling());
        }

        startYokeAutonomous();
    } else {
        log.info('AI Autonomous Mode disabled');
        autonomousLoop.stop('User stopped');
    }

    updateStatusBar();
}

function resetCircuitBreaker(): void {
    circuitBreaker.reset('User reset');
    vscode.window.showInformationMessage('✅ Circuit breaker reset.');
}

// ============ Yoke Autonomous ============
async function startYokeAutonomous(): Promise<void> {
    vscode.window.showInformationMessage(
        '🚀 AI Autonomous Mode: STARTING',
        'Stop'
    ).then((action) => {
        if (action === 'Stop') {
            autonomousLoop.stop('User clicked Stop');
        }
    });

    await autonomousLoop.start({
        maxLoops: config.get('maxLoopsPerSession'),
        loopIntervalSeconds: config.get('loopInterval'),
        autoSwitchModels: config.get('autoSwitchModels'),
    });
}

// ============ Dashboard ============
function openDashboard(context: vscode.ExtensionContext): void {
    const stats = progressTracker.getStats();
    const loopStatus = autonomousLoop.getStatus();

    DashboardPanel.create(
        context,
        handleFeatureToggle,
        handleSaveSettings
    ).updateState({
        autoAllEnabled: config.get('autoAllEnabled'),
        multiTabEnabled: config.get('multiTabEnabled'),
        yokeModeEnabled: loopStatus.running,
        autoSwitchModels: config.get('autoSwitchModels'),
        autoGitCommit: config.get('autoGitCommit'),
        loopCount: loopStatus.loopCount,
        sessionStats: stats,
        duration: progressTracker.getDurationMinutes(),
        usage: null,
    });
}

async function handleFeatureToggle(feature: string, enabled: boolean): Promise<void> {
    switch (feature) {
        case 'autoAll':
            if (enabled !== config.get('autoAllEnabled')) await toggleAutoAll();
            break;
        case 'multiTab':
            if (enabled !== config.get('multiTabEnabled')) await toggleMultiTab();
            break;
        case 'yokeMode':
            if (enabled !== autonomousLoop.isRunning()) await toggleYokeMode();
            break;
        case 'autoSwitchModels':
            await config.set('autoSwitchModels', enabled);
            // Auto-enable Auto-All as prerequisite
            if (enabled && !config.get('autoAllEnabled')) {
                log.info('Auto-enabling Auto-All for Smart Model Switching');
                await config.set('autoAllEnabled', true);
                ensureCDPOrPrompt(true).then(() => startPolling());
            }
            break;
        case 'autoGitCommit':
            await config.set('autoGitCommit', enabled);
            break;
        case 'resetCircuitBreaker':
            resetCircuitBreaker();
            break;
    }
    updateStatusBar();
}

async function handleSaveSettings(settings: Record<string, unknown>, silent = false): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
        await config.set(key as keyof import('./utils/constants').YokeConfig, value as never);
    }
    if (!silent) {
        vscode.window.showInformationMessage('Settings saved!');
    }
}

// ============ Status Bar ============
function updateStatusBar(): void {
    const loopStatus = autonomousLoop.getStatus();
    statusBar.update({
        autoAllEnabled: config.get('autoAllEnabled'),
        multiTabEnabled: config.get('multiTabEnabled'),
        yokeModeEnabled: loopStatus.running,
        loopCount: loopStatus.loopCount,
    });
}

// ============ Deactivation ============
export function deactivate(): void {
    stopPolling();
    autonomousLoop.stop('Extension deactivated');
    statusBar?.dispose();
    log.info('Yoke Antigravity deactivated');
}
