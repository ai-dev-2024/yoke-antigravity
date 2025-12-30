"use strict";
/**
 * Yoke Extension - Main Entry Point
 * Autonomous AI development loop for Antigravity with intelligent model selection
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const loop_1 = require("./loop");
const settings_panel_1 = require("./settings-panel");
let yokeLoop = null;
let statusBarItem;
let isEnabled = false;
function activate(context) {
    console.log('Yoke extension activating...');
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'yoke.toggle';
    updateStatusBar();
    statusBarItem.show();
    // Register commands
    const toggleCommand = vscode.commands.registerCommand('yoke.toggle', () => {
        isEnabled = !isEnabled;
        const config = vscode.workspace.getConfiguration('yoke');
        config.update('enabled', isEnabled, vscode.ConfigurationTarget.Global);
        updateStatusBar();
        if (isEnabled) {
            vscode.window.showInformationMessage('🚀 Yoke Autonomous Mode: ON');
            startLoopIfReady();
        }
        else {
            vscode.window.showInformationMessage('⏸️ Yoke Autonomous Mode: OFF');
            stopLoop();
        }
    });
    const openSettingsCommand = vscode.commands.registerCommand('yoke.openSettings', () => {
        settings_panel_1.SettingsPanel.show(context.extensionUri);
    });
    const startLoopCommand = vscode.commands.registerCommand('yoke.startLoop', () => {
        if (!isEnabled) {
            isEnabled = true;
            updateStatusBar();
        }
        startLoopIfReady();
    });
    const stopLoopCommand = vscode.commands.registerCommand('yoke.stopLoop', () => {
        stopLoop();
        vscode.window.showInformationMessage('⏹️ Yoke loop stopped');
    });
    const showStatusCommand = vscode.commands.registerCommand('yoke.showStatus', () => {
        showLoopStatus();
    });
    // Load initial enabled state from config
    const config = vscode.workspace.getConfiguration('yoke');
    isEnabled = config.get('enabled', false);
    updateStatusBar();
    // Register all disposables
    context.subscriptions.push(statusBarItem, toggleCommand, openSettingsCommand, startLoopCommand, stopLoopCommand, showStatusCommand);
    // Listen for config changes
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('yoke.enabled')) {
            const config = vscode.workspace.getConfiguration('yoke');
            isEnabled = config.get('enabled', false);
            updateStatusBar();
        }
    });
    console.log('Yoke extension activated!');
}
function updateStatusBar() {
    if (isEnabled) {
        statusBarItem.text = '$(sync~spin) Yoke: ON';
        statusBarItem.tooltip = 'Yoke Autonomous Mode is ON - Click to toggle';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    else {
        statusBarItem.text = '$(circle-slash) Yoke: OFF';
        statusBarItem.tooltip = 'Yoke Autonomous Mode is OFF - Click to toggle';
        statusBarItem.backgroundColor = undefined;
    }
}
async function startLoopIfReady() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Yoke: No workspace folder open');
        return;
    }
    const projectDir = workspaceFolders[0].uri.fsPath;
    // Check for PROMPT.md
    const promptUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'PROMPT.md');
    try {
        await vscode.workspace.fs.stat(promptUri);
    }
    catch {
        const action = await vscode.window.showWarningMessage('Yoke: No PROMPT.md found. Would you like to create a Yoke project?', 'Create Project', 'Cancel');
        if (action === 'Create Project') {
            await createProjectFiles(projectDir);
        }
        return;
    }
    // Start the loop
    const config = vscode.workspace.getConfiguration('yoke');
    yokeLoop = new loop_1.YokeLoop(projectDir, {
        maxLoops: config.get('maxLoopsPerSession', 100),
        pauseBetweenLoops: config.get('pauseBetweenLoops', 5) * 1000,
        verbose: true
    });
    vscode.window.showInformationMessage('🔄 Yoke autonomous loop starting...');
    // Run loop in background
    yokeLoop.runLoop().then(() => {
        vscode.window.showInformationMessage('✅ Yoke loop completed!');
        isEnabled = false;
        updateStatusBar();
    }).catch(error => {
        vscode.window.showErrorMessage(`Yoke error: ${error.message}`);
        isEnabled = false;
        updateStatusBar();
    });
}
function stopLoop() {
    if (yokeLoop) {
        yokeLoop.stop();
        yokeLoop = null;
    }
    isEnabled = false;
    updateStatusBar();
}
function showLoopStatus() {
    if (!yokeLoop) {
        vscode.window.showInformationMessage('Yoke: No active loop');
        return;
    }
    const stats = yokeLoop.getStats();
    const message = `
Yoke Status:
• Loop count: ${stats.loopCount}
• Models: ${stats.rateLimitStats.map(s => `${s.modelId}: ${s.used}/${s.limit}`).join(', ')}
    `.trim();
    vscode.window.showInformationMessage(message);
}
async function createProjectFiles(projectDir) {
    const promptContent = `# Project Development Instructions

## Objective
[Describe your project objective here]

## Current Priority
Check @fix_plan.md for the current task list and priorities.

## Guidelines
1. Focus on one task at a time from @fix_plan.md
2. Mark tasks as complete when done
3. Write clean, maintainable code
4. Include tests where appropriate

## Context
[Add any additional context about your project]
`;
    const fixPlanContent = `# Fix Plan

## Priority Tasks
- [ ] Initial project setup
- [ ] Core feature implementation
- [ ] Add tests
- [ ] Documentation

## Completed
`;
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(path.join(projectDir, 'PROMPT.md'), promptContent);
    fs.writeFileSync(path.join(projectDir, '@fix_plan.md'), fixPlanContent);
    vscode.window.showInformationMessage('✅ Yoke project files created! Edit PROMPT.md and @fix_plan.md, then start the loop.');
}
function deactivate() {
    if (yokeLoop) {
        yokeLoop.stop();
    }
}
