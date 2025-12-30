/**
 * Yoke - Main Loop
 * The autonomous development loop that orchestrates model selection, execution, and exit detection
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { selectModelForTask, ModelConfig, ModelId } from './model-selector';
import { RateLimiter } from './rate-limiter';
import { ExitDetector } from './exit-detector';

const STATUS_FILE = 'status.json';
const LOG_DIR = 'logs';

export interface LoopConfig {
    promptFile: string;
    fixPlanFile: string;
    maxLoops: number;
    pauseBetweenLoops: number; // ms
    verbose: boolean;
}

export interface LoopStatus {
    loopCount: number;
    currentModel: string | null;
    lastAction: string;
    status: 'running' | 'paused' | 'completed' | 'error';
    exitReason: string | null;
    timestamp: string;
}

const DEFAULT_CONFIG: LoopConfig = {
    promptFile: 'PROMPT.md',
    fixPlanFile: '@fix_plan.md',
    maxLoops: 1000,
    pauseBetweenLoops: 5000,
    verbose: false
};

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    purple: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    let color = colors.reset;

    switch (level) {
        case 'INFO': color = colors.blue; break;
        case 'WARN': color = colors.yellow; break;
        case 'ERROR': color = colors.red; break;
        case 'SUCCESS': color = colors.green; break;
        case 'LOOP': color = colors.purple; break;
        case 'MODEL': color = colors.cyan; break;
    }

    console.log(`${color}[${timestamp}] [${level}] ${message}${colors.reset}`);
}

export class YokeLoop {
    private config: LoopConfig;
    private projectDir: string;
    private rateLimiter: RateLimiter;
    private exitDetector: ExitDetector;
    private loopCount: number = 0;
    private running: boolean = false;

    constructor(projectDir: string, config?: Partial<LoopConfig>) {
        this.projectDir = projectDir;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.rateLimiter = new RateLimiter(projectDir);
        this.exitDetector = new ExitDetector(projectDir);

        // Ensure log directory exists
        const logDir = path.join(projectDir, LOG_DIR);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    private updateStatus(status: Partial<LoopStatus>): void {
        const fullStatus: LoopStatus = {
            loopCount: this.loopCount,
            currentModel: null,
            lastAction: '',
            status: 'running',
            exitReason: null,
            timestamp: new Date().toISOString(),
            ...status
        };

        const statusPath = path.join(this.projectDir, STATUS_FILE);
        fs.writeFileSync(statusPath, JSON.stringify(fullStatus, null, 2));
    }

    private readPrompt(): string {
        const promptPath = path.join(this.projectDir, this.config.promptFile);

        if (!fs.existsSync(promptPath)) {
            throw new Error(`Prompt file not found: ${promptPath}`);
        }

        return fs.readFileSync(promptPath, 'utf-8');
    }

    private getCurrentTask(): string {
        const fixPlanPath = path.join(this.projectDir, this.config.fixPlanFile);

        if (!fs.existsSync(fixPlanPath)) {
            return 'No fix plan found';
        }

        const content = fs.readFileSync(fixPlanPath, 'utf-8');
        const lines = content.split('\n');

        // Find first incomplete task
        for (const line of lines) {
            if (line.match(/^-\s*\[\s*\]/)) {
                return line.replace(/^-\s*\[\s*\]\s*/, '').trim();
            }
            if (line.match(/^-\s*\[\/\]/)) {
                return line.replace(/^-\s*\[\/\]\s*/, '').trim() + ' (in progress)';
            }
        }

        return 'All tasks may be complete';
    }

    private async executeAntigravity(model: ModelConfig, prompt: string): Promise<{ output: string; success: boolean }> {
        return new Promise((resolve) => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputFile = path.join(this.projectDir, LOG_DIR, `output_${timestamp}.log`);

            log('MODEL', `Using: ${model.displayName}`);
            log('INFO', 'Executing Antigravity...');

            // For now, we simulate the execution
            // In production, this would call the Antigravity CLI
            // The Antigravity CLI command would be something like:
            // antigravity --model <model-id> --prompt <prompt>

            // Simulated execution for development
            const simulatedOutput = `
[Yoke] Simulated execution with model: ${model.displayName}
[Yoke] This is a placeholder - actual Antigravity CLI integration needed
[Yoke] Current task from fix_plan: ${this.getCurrentTask()}
[Yoke] Prompt length: ${prompt.length} characters
      `.trim();

            fs.writeFileSync(outputFile, simulatedOutput);

            // In production, this would be:
            // const child = spawn('antigravity', ['--model', model.id, '--prompt', prompt]);
            // or interact with Antigravity's API/CLI

            log('INFO', `Output saved to: ${outputFile}`);

            resolve({
                output: simulatedOutput,
                success: true
            });
        });
    }

    async runLoop(): Promise<void> {
        this.running = true;

        log('SUCCESS', '🚀 Yoke loop starting');
        log('INFO', `Project directory: ${this.projectDir}`);
        log('INFO', `Max loops: ${this.config.maxLoops}`);

        // Check if this is a valid Yoke project
        const promptPath = path.join(this.projectDir, this.config.promptFile);
        if (!fs.existsSync(promptPath)) {
            log('ERROR', `Prompt file not found: ${this.config.promptFile}`);
            log('INFO', 'Run "yoke-setup <project-name>" to create a new project');
            return;
        }

        while (this.running && this.loopCount < this.config.maxLoops) {
            this.loopCount++;
            log('LOOP', `=== Starting Loop #${this.loopCount} ===`);

            // Check exit conditions
            const exitReason = this.exitDetector.shouldExit(this.loopCount, this.projectDir);
            if (exitReason) {
                log('SUCCESS', `🏁 Graceful exit: ${exitReason}`);
                this.updateStatus({
                    status: 'completed',
                    exitReason,
                    lastAction: 'graceful_exit'
                });
                break;
            }

            // Get current task
            const currentTask = this.getCurrentTask();
            log('INFO', `Current task: ${currentTask}`);

            // Get unavailable models (rate limited)
            const unavailableModels = this.rateLimiter.getUnavailableModels();
            if (unavailableModels.length > 0) {
                log('WARN', `Rate-limited models: ${unavailableModels.join(', ')}`);
            }

            // Select optimal model for the task
            const { model, taskType } = selectModelForTask(currentTask, unavailableModels);

            if (!model) {
                log('ERROR', 'No available models! All models are rate-limited.');
                log('INFO', 'Waiting for rate limit reset...');

                // Wait and retry
                await this.sleep(60000); // Wait 1 minute
                continue;
            }

            log('MODEL', `Selected: ${model.displayName} (task type: ${taskType})`);

            this.updateStatus({
                currentModel: model.displayName,
                lastAction: `executing_${taskType}`,
                status: 'running'
            });

            // Read prompt
            const prompt = this.readPrompt();

            // Execute with selected model
            const { output, success } = await this.executeAntigravity(model, prompt);

            // Record the call for rate limiting
            this.rateLimiter.recordCall(model.id);

            // Analyze output for exit signals
            this.exitDetector.analyzeOutput(this.loopCount, output, success);

            if (success) {
                log('SUCCESS', '✅ Loop completed successfully');
                this.updateStatus({
                    lastAction: 'completed',
                    status: 'running'
                });
            } else {
                log('ERROR', '❌ Loop failed');
                this.updateStatus({
                    lastAction: 'failed',
                    status: 'error'
                });
            }

            // Pause between loops
            log('INFO', `Pausing ${this.config.pauseBetweenLoops / 1000}s before next loop...`);
            await this.sleep(this.config.pauseBetweenLoops);
        }

        log('SUCCESS', '🎉 Yoke loop finished');
        log('INFO', `Total loops: ${this.loopCount}`);
        log('INFO', `Total API calls: ${this.rateLimiter.getGlobalCalls()}`);
    }

    stop(): void {
        log('WARN', 'Stopping Yoke loop...');
        this.running = false;
        this.updateStatus({
            status: 'paused',
            lastAction: 'stopped'
        });
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStats() {
        return {
            loopCount: this.loopCount,
            rateLimitStats: this.rateLimiter.getStats(),
            exitSignals: this.exitDetector.getSignals()
        };
    }
}
