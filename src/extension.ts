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
// New feature imports
import { mcpServer } from './providers/mcp-server';
import { memoryManager } from './core/memory-manager';
import { codeReviewer } from './core/code-reviewer';
import { projectManager } from './providers/project-manager';
import { voiceController } from './ui/voice-controller';
import { agentOrchestrator } from './core/agent-orchestrator';
import { testGenerator } from './core/test-generator';
import { modelProviderManager } from './providers/model-provider';
import { notificationManager } from './core/notification-manager';

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
            ide: currentIDE.toLowerCase(), // CRITICAL: Must be lowercase like original extension
            bannedCommands: config.get('bannedCommands') // Use actual banned commands from config
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
        // Core commands
        vscode.commands.registerCommand('yoke.toggleExtension', toggleExtension),
        vscode.commands.registerCommand('yoke.toggleAutoAll', toggleAutoAll),
        vscode.commands.registerCommand('yoke.toggleMultiTab', toggleMultiTab),
        vscode.commands.registerCommand('yoke.toggleYokeMode', toggleYokeMode),
        vscode.commands.registerCommand('yoke.openSettings', () => openDashboard(context)),
        vscode.commands.registerCommand('yoke.resetCircuitBreaker', resetCircuitBreaker),
        // New feature commands
        vscode.commands.registerCommand('yoke.toggleMcp', toggleMcp),
        vscode.commands.registerCommand('yoke.toggleVoice', toggleVoice),
        vscode.commands.registerCommand('yoke.generateTests', generateTests),
        vscode.commands.registerCommand('yoke.runCodeReview', runCodeReview),
        vscode.commands.registerCommand('yoke.startMultiAgent', startMultiAgent),
        vscode.commands.registerCommand('yoke.showMemory', showMemory),
        vscode.commands.registerCommand('yoke.syncProjectTasks', syncProjectTasks)
    );
}

// ============ New Feature Commands ============
async function toggleMcp(): Promise<void> {
    const current = config.get('mcpEnabled');
    await config.set('mcpEnabled', !current);

    if (!current) {
        log.info('MCP Server enabled');
        vscode.window.showInformationMessage('✅ MCP Server: ON - AI tools now available');
    } else {
        log.info('MCP Server disabled');
        vscode.window.showInformationMessage('⏸️ MCP Server: OFF');
    }
}

async function toggleVoice(): Promise<void> {
    const current = config.get('voiceControlEnabled');
    await config.set('voiceControlEnabled', !current);

    if (!current) {
        voiceController.setConfig({ enabled: true });
        await voiceController.startListening();
        vscode.window.showInformationMessage('🎤 Voice Control: ON');
    } else {
        voiceController.setConfig({ enabled: false });
        await voiceController.stopListening();
        vscode.window.showInformationMessage('🔇 Voice Control: OFF');
    }
}

async function generateTests(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No file open to generate tests for');
        return;
    }

    const filePath = vscode.workspace.asRelativePath(editor.document.uri);
    vscode.window.showInformationMessage(`🧪 Generating tests for ${filePath}...`);

    try {
        const suite = await testGenerator.generateTestsForFile(filePath);
        vscode.window.showInformationMessage(
            `✅ Generated ${suite.tests.length} tests in ${suite.tests[0]?.testFile || 'tests/'}`,
            'Open Tests'
        ).then(action => {
            if (action === 'Open Tests' && suite.tests[0]?.testFile) {
                const testUri = vscode.Uri.file(path.join(
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
                    suite.tests[0].testFile
                ));
                vscode.window.showTextDocument(testUri);
            }
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Test generation failed: ${(error as Error).message}`);
    }
}

async function runCodeReview(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No file open to review');
        return;
    }

    const code = editor.document.getText();
    const filename = path.basename(editor.document.fileName);

    vscode.window.showInformationMessage(`🔍 Reviewing ${filename}...`);

    const result = codeReviewer.review(code, filename);

    // Show diagnostics in VS Code
    const diagnostics = codeReviewer.showDiagnostics(editor.document, result.issues);
    const collection = vscode.languages.createDiagnosticCollection('yoke-review');
    collection.set(editor.document.uri, diagnostics);

    vscode.window.showInformationMessage(result.summary, 'View Details').then(action => {
        if (action === 'View Details') {
            const panel = vscode.window.createWebviewPanel(
                'yokeCodeReview',
                `Code Review: ${filename}`,
                vscode.ViewColumn.Two,
                {}
            );
            panel.webview.html = generateReviewHtml(result);
        }
    });
}

function generateReviewHtml(result: import('./core/code-reviewer').ReviewResult): string {
    const issueRows = result.issues.map(i => `
        <tr>
            <td>${i.severity}</td>
            <td>${i.type}</td>
            <td>${i.line || '-'}</td>
            <td>${i.message}</td>
            <td><code>${i.rule}</code></td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: system-ui; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
                h1 { color: ${result.passed ? '#4ade80' : '#f87171'}; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 8px; text-align: left; border-bottom: 1px solid #333; }
                th { background: #2d2d2d; }
                .score { font-size: 2em; color: ${result.score >= 80 ? '#4ade80' : result.score >= 50 ? '#facc15' : '#f87171'}; }
            </style>
        </head>
        <body>
            <h1>${result.passed ? '✅ Review Passed' : '❌ Issues Found'}</h1>
            <p class="score">Score: ${result.score}/100</p>
            <table>
                <tr><th>Severity</th><th>Type</th><th>Line</th><th>Message</th><th>Rule</th></tr>
                ${issueRows || '<tr><td colspan="5">No issues found!</td></tr>'}
            </table>
        </body>
        </html>
    `;
}

async function startMultiAgent(): Promise<void> {
    const task = await vscode.window.showInputBox({
        prompt: 'Describe the task for multi-agent collaboration',
        placeHolder: 'e.g., Implement user authentication with OAuth2'
    });

    if (!task) return;

    await config.set('multiAgentEnabled', true);
    vscode.window.showInformationMessage(`🤖 Starting multi-agent task: ${task.substring(0, 50)}...`);

    try {
        await agentOrchestrator.coordinateAgents(task);
        vscode.window.showInformationMessage('✅ Multi-agent task initiated');
    } catch (error) {
        vscode.window.showErrorMessage(`Multi-agent error: ${(error as Error).message}`);
    }
}

async function showMemory(): Promise<void> {
    const stats = memoryManager.getStats();
    const recent = memoryManager.getRecentMemories(10);

    const panel = vscode.window.createWebviewPanel(
        'yokeMemory',
        'Yoke Session Memory',
        vscode.ViewColumn.Two,
        {}
    );

    const memoryRows = recent.map(m => `
        <tr>
            <td>${new Date(m.timestamp).toLocaleTimeString()}</td>
            <td>${m.type}</td>
            <td>${m.content.substring(0, 100)}...</td>
        </tr>
    `).join('');

    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: system-ui; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
                h1 { color: #7c3aed; }
                .stat { display: inline-block; margin: 10px; padding: 15px; background: #2d2d2d; border-radius: 8px; }
                .stat-value { font-size: 2em; color: #4ade80; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 8px; text-align: left; border-bottom: 1px solid #333; }
            </style>
        </head>
        <body>
            <h1>🧠 Session Memory</h1>
            <div>
                <div class="stat"><div class="stat-value">${stats.currentEntries}</div>Current Entries</div>
                <div class="stat"><div class="stat-value">${stats.totalSessions}</div>Total Sessions</div>
                <div class="stat"><div class="stat-value">${stats.indexedTerms}</div>Indexed Terms</div>
            </div>
            <h2>Recent Memories</h2>
            <table>
                <tr><th>Time</th><th>Type</th><th>Content</th></tr>
                ${memoryRows || '<tr><td colspan="3">No memories yet</td></tr>'}
            </table>
        </body>
        </html>
    `;
}

async function syncProjectTasks(): Promise<void> {
    const configured = projectManager.isConfigured();

    if (!configured.github && !configured.jira) {
        const config = await vscode.window.showQuickPick(
            ['Configure GitHub', 'Configure Jira', 'Use Local @fix_plan.md'],
            { placeHolder: 'Select project management integration' }
        );

        if (config === 'Use Local @fix_plan.md') {
            const tasks = await projectManager.syncFromFixPlan();
            vscode.window.showInformationMessage(`📋 Synced ${tasks.length} tasks from @fix_plan.md`);
            return;
        }

        vscode.window.showInformationMessage('Configure integration in .yoke/project-manager.json');
        return;
    }

    vscode.window.showInformationMessage('📋 Syncing project tasks...');

    try {
        const tasks = [];
        if (configured.github) {
            tasks.push(...await projectManager.fetchGitHubIssues());
        }
        if (configured.jira) {
            tasks.push(...await projectManager.fetchJiraIssues());
        }

        await projectManager.updateFixPlan(tasks);
        vscode.window.showInformationMessage(`✅ Synced ${tasks.length} tasks`);
    } catch (error) {
        vscode.window.showErrorMessage(`Sync failed: ${(error as Error).message}`);
    }
}

// ============ Extension Toggle (Universal ON/OFF) ============
async function toggleExtension(): Promise<void> {
    const current = config.get('autoAllEnabled');

    if (current) {
        // Turning OFF - disable everything
        log.info('Yoke: Turning OFF');
        await config.set('autoAllEnabled', false);
        await stopPolling();

        // Also stop autonomous mode if running
        if (autonomousLoop.isRunning()) {
            autonomousLoop.stop('Extension disabled');
            await config.set('yokeModeEnabled', false);
        }

        vscode.window.showInformationMessage('⏸️ Yoke: OFF');
    } else {
        // Turning ON - enable auto-all
        log.info('Yoke: Turning ON');
        await config.set('autoAllEnabled', true);
        vscode.window.showInformationMessage('✅ Yoke: ON');
        ensureCDPOrPrompt(true).then(() => startPolling());
    }

    updateStatusBar();
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
