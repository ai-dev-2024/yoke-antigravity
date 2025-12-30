/**
 * Yoke Autonomous Script - Injected into Antigravity via CDP
 * Handles: prompt injection, model switching, task tracking, exit detection
 */

(function () {
    const g = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : self);

    // Prevent duplicate injection
    if (g.__yokeInjected) return;
    g.__yokeInjected = true;

    // ============ STATE ============
    let yokeEnabled = false;
    let yokeConfig = {};
    let loopCount = 0;
    let currentTask = '';
    let currentModel = '';
    let isProcessing = false;
    let lastPromptTime = 0;
    let completionSignals = 0;
    let stagnationCount = 0;
    let lastOutput = '';

    // Stats
    let stats = {
        loopsCompleted: 0,
        promptsSent: 0,
        modelSwitches: 0,
        tasksCompleted: 0,
        errors: 0,
        startTime: null
    };

    // ============ DOM SELECTORS ============
    const SELECTORS = {
        // Chat input (Antigravity uses a textarea or contenteditable)
        chatInput: [
            'textarea[placeholder*="message"]',
            'textarea[placeholder*="Ask"]',
            '[contenteditable="true"]',
            '.chat-input textarea',
            'textarea.prompt-input',
            'textarea'
        ],
        // Send button
        sendButton: [
            'button[aria-label*="Send"]',
            'button[type="submit"]',
            'button:has(svg[class*="send"])',
            '.send-button',
            'button[title*="Send"]'
        ],
        // Model selector dropdown
        modelSelector: [
            'button[aria-label*="Model"]',
            '.model-selector',
            '[class*="model-dropdown"]',
            'button:contains("Gemini")',
            'button:contains("Claude")'
        ],
        // Model options in dropdown
        modelOptions: {
            'claude-opus-4.5-thinking': ['Claude Opus 4.5 (Thinking)', 'opus-thinking', 'opus'],
            'claude-sonnet-4.5-thinking': ['Claude Sonnet 4.5 (Thinking)', 'sonnet-thinking'],
            'claude-sonnet-4.5': ['Claude Sonnet 4.5', 'sonnet-4.5'],
            'gemini-3-pro-high': ['Gemini 3 Pro (High)', 'gemini-pro-high', 'Gemini 3 Pro'],
            'gemini-3-pro-low': ['Gemini 3 Pro (Low)', 'gemini-pro-low'],
            'gemini-3-flash': ['Gemini 3 Flash', 'gemini-flash', 'Flash'],
            'gpt-oss-120b': ['GPT-OSS 120B', 'gpt-oss', 'GPT']
        },
        // Response/output area
        responseArea: [
            '.message-content',
            '.response-text',
            '[class*="message"]',
            '.conversation-message'
        ],
        // Accept buttons (from Auto-All)
        acceptButtons: [
            'button:contains("Accept")',
            'button:contains("Apply")',
            'button:contains("Run")',
            'button[aria-label*="Accept"]'
        ]
    };

    // ============ TASK PATTERNS ============
    const TASK_PATTERNS = {
        reasoning: ['debug', 'fix bug', 'algorithm', 'architecture', 'refactor', 'optimize', 'analyze', 'error', 'issue'],
        frontend: ['ui', 'css', 'component', 'react', 'vue', 'html', 'style', 'design', 'animation', 'layout'],
        quick: ['format', 'typo', 'rename', 'simple', 'small change', 'minor', 'cleanup']
    };

    // ============ EXIT PATTERNS ============
    const EXIT_PATTERNS = [
        'all tasks completed',
        'project is complete',
        'nothing left to do',
        'all items checked',
        'implementation complete',
        'no more tasks',
        'everything is done'
    ];

    // ============ HELPER FUNCTIONS ============
    function log(msg) {
        console.log(`[Yoke] ${msg}`);
    }

    function findElement(selectors) {
        for (const selector of selectors) {
            try {
                // Handle :contains pseudo-selector
                if (selector.includes(':contains')) {
                    const match = selector.match(/([^:]+):contains\("([^"]+)"\)/);
                    if (match) {
                        const [, baseSelector, text] = match;
                        const elements = document.querySelectorAll(baseSelector || '*');
                        for (const el of elements) {
                            if (el.textContent.includes(text)) return el;
                        }
                    }
                } else {
                    const el = document.querySelector(selector);
                    if (el) return el;
                }
            } catch (e) { }
        }
        return null;
    }

    function findAllElements(selectors) {
        const results = [];
        for (const selector of selectors) {
            try {
                if (selector.includes(':contains')) {
                    const match = selector.match(/([^:]+):contains\("([^"]+)"\)/);
                    if (match) {
                        const [, baseSelector, text] = match;
                        const elements = document.querySelectorAll(baseSelector || '*');
                        for (const el of elements) {
                            if (el.textContent.includes(text)) results.push(el);
                        }
                    }
                } else {
                    results.push(...document.querySelectorAll(selector));
                }
            } catch (e) { }
        }
        return results;
    }

    function getVisibleChatInput() {
        const inputs = findAllElements(SELECTORS.chatInput);
        for (const input of inputs) {
            if (input.offsetParent !== null && !input.disabled) {
                return input;
            }
        }
        return null;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============ TASK ANALYSIS ============
    function analyzeTaskType(task) {
        const lowerTask = task.toLowerCase();
        const scores = { reasoning: 0, frontend: 0, quick: 0, general: 0 };

        for (const [type, patterns] of Object.entries(TASK_PATTERNS)) {
            for (const pattern of patterns) {
                if (lowerTask.includes(pattern)) scores[type]++;
            }
        }

        let maxScore = 0;
        let selectedType = 'general';
        for (const [type, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                selectedType = type;
            }
        }
        return selectedType;
    }

    function selectModelForTask(taskType) {
        const models = yokeConfig.models || {};
        switch (taskType) {
            case 'reasoning': return models.reasoning || 'claude-opus-4.5-thinking';
            case 'frontend': return models.frontend || 'gemini-3-pro-high';
            case 'quick': return models.quick || 'gemini-3-flash';
            default: return models.frontend || 'gemini-3-pro-high';
        }
    }

    // ============ MODEL SWITCHING ============
    async function switchModel(modelId) {
        if (currentModel === modelId) {
            log(`Already using model: ${modelId}`);
            return true;
        }

        log(`Switching to model: ${modelId}`);

        // Find and click model selector dropdown
        const modelButton = findElement(SELECTORS.modelSelector);
        if (!modelButton) {
            log('Model selector not found');
            return false;
        }

        modelButton.click();
        await sleep(500);

        // Find the model option
        const modelNames = SELECTORS.modelOptions[modelId] || [modelId];
        let found = false;

        for (const name of modelNames) {
            const options = document.querySelectorAll('[role="option"], [role="menuitem"], li, button');
            for (const option of options) {
                if (option.textContent.includes(name)) {
                    option.click();
                    currentModel = modelId;
                    stats.modelSwitches++;
                    log(`Switched to: ${modelId}`);
                    found = true;
                    break;
                }
            }
            if (found) break;
        }

        await sleep(300);

        // Click elsewhere to close dropdown if still open
        document.body.click();

        return found;
    }

    // ============ PROMPT INJECTION ============
    async function injectPrompt(prompt) {
        log(`Injecting prompt (${prompt.length} chars)`);

        const input = getVisibleChatInput();
        if (!input) {
            log('Chat input not found');
            return false;
        }

        // Clear existing content
        if (input.tagName === 'TEXTAREA') {
            input.value = '';
            input.value = prompt;
            // Trigger input event
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            // contenteditable
            input.innerHTML = '';
            input.textContent = prompt;
            input.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt }));
        }

        await sleep(200);

        // Find and click send button
        const sendBtn = findElement(SELECTORS.sendButton);
        if (sendBtn) {
            sendBtn.click();
            stats.promptsSent++;
            lastPromptTime = Date.now();
            log('Prompt sent');
            return true;
        }

        // Try Enter key as fallback
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        stats.promptsSent++;
        lastPromptTime = Date.now();
        log('Prompt sent via Enter key');
        return true;
    }

    // ============ RESPONSE DETECTION ============
    function getLatestResponse() {
        const messages = findAllElements(SELECTORS.responseArea);
        if (messages.length === 0) return '';

        const lastMessage = messages[messages.length - 1];
        return lastMessage.textContent || '';
    }

    function isResponseComplete() {
        // Check if AI is still generating (look for loading indicators)
        const loadingIndicators = document.querySelectorAll(
            '[class*="loading"], [class*="typing"], [class*="generating"], .spinner'
        );

        for (const indicator of loadingIndicators) {
            if (indicator.offsetParent !== null) return false;
        }

        // Check if response text is stable
        const currentResponse = getLatestResponse();
        if (currentResponse === lastOutput && currentResponse.length > 50) {
            return true;
        }
        lastOutput = currentResponse;
        return false;
    }

    function checkForExitSignals(response) {
        const lowerResponse = response.toLowerCase();

        for (const pattern of EXIT_PATTERNS) {
            if (lowerResponse.includes(pattern)) {
                completionSignals++;
                log(`Exit signal detected: ${pattern} (count: ${completionSignals})`);
                return true;
            }
        }
        return false;
    }

    function checkForStagnation(response) {
        if (response === lastOutput) {
            stagnationCount++;
            if (stagnationCount >= 3) {
                log('Stagnation detected - same output 3 times');
                return true;
            }
        } else {
            stagnationCount = 0;
        }
        return false;
    }

    // ============ AUTO-ACCEPT ============
    async function autoAcceptPending() {
        const buttons = findAllElements(SELECTORS.acceptButtons);
        let accepted = 0;

        for (const btn of buttons) {
            if (btn.offsetParent !== null && !btn.disabled) {
                btn.click();
                accepted++;
                await sleep(100);
            }
        }

        if (accepted > 0) {
            log(`Auto-accepted ${accepted} actions`);
        }
        return accepted;
    }

    // ============ MAIN LOOP ============
    async function runYokeLoop() {
        if (!yokeEnabled || isProcessing) return;

        isProcessing = true;
        loopCount++;
        log(`=== Yoke Loop #${loopCount} ===`);

        try {
            // 1. Check for exit conditions
            if (completionSignals >= 2) {
                log('Exiting: Multiple completion signals');
                g.__yokeStop();
                return;
            }

            if (loopCount >= (yokeConfig.maxLoops || 100)) {
                log(`Exiting: Max loops (${yokeConfig.maxLoops}) reached`);
                g.__yokeStop();
                return;
            }

            // 2. Auto-accept any pending actions
            await autoAcceptPending();

            // 3. Wait for any current response to complete
            let waitCount = 0;
            while (!isResponseComplete() && waitCount < 30) {
                await sleep(2000);
                waitCount++;
                await autoAcceptPending(); // Keep accepting while waiting
            }

            // 4. Check response for exit signals
            const response = getLatestResponse();
            if (checkForExitSignals(response)) {
                if (completionSignals >= 2) {
                    log('Project appears complete');
                    g.__yokeStop();
                    return;
                }
            }

            // 5. Check for stagnation
            if (checkForStagnation(response)) {
                log('Breaking stagnation with new prompt');
            }

            // 6. Get current task (from config)
            currentTask = yokeConfig.currentTask || 'Continue working on the current task from @fix_plan.md';

            // 7. Analyze task and select model
            const taskType = analyzeTaskType(currentTask);
            const targetModel = selectModelForTask(taskType);

            log(`Task type: ${taskType}, Target model: ${targetModel}`);

            // 8. Switch model if needed
            if (yokeConfig.autoSwitchModels) {
                await switchModel(targetModel);
            }

            // 9. Build and inject prompt
            const prompt = buildPrompt(currentTask);
            await injectPrompt(prompt);

            stats.loopsCompleted++;

        } catch (e) {
            log(`Loop error: ${e.message}`);
            stats.errors++;
        } finally {
            isProcessing = false;
        }
    }

    function buildPrompt(task) {
        const basePrompt = `Continue working on the project. Current priority task:

${task}

Instructions:
1. Check @fix_plan.md for the current task list
2. Work on the highest priority incomplete task
3. Mark tasks as complete when done ([x])
4. If all tasks are done, say "all tasks completed"
5. Focus on clean, tested code

Begin working now.`;

        return basePrompt;
    }

    // ============ PUBLIC API ============
    g.__yokeStart = function (config) {
        log('Yoke starting...');
        yokeEnabled = true;
        yokeConfig = config || {};
        stats.startTime = Date.now();
        loopCount = 0;
        completionSignals = 0;
        stagnationCount = 0;

        // Start the loop
        g.__yokeLoopInterval = setInterval(() => {
            if (yokeEnabled) runYokeLoop();
        }, (config.loopInterval || 30) * 1000); // Default 30 seconds

        // Run immediately
        runYokeLoop();

        return 'yoke_started';
    };

    g.__yokeStop = function () {
        log('Yoke stopping...');
        yokeEnabled = false;
        if (g.__yokeLoopInterval) {
            clearInterval(g.__yokeLoopInterval);
            g.__yokeLoopInterval = null;
        }
        return 'yoke_stopped';
    };

    g.__yokeGetStats = function () {
        return JSON.stringify({
            ...stats,
            loopCount,
            currentTask,
            currentModel,
            isProcessing,
            completionSignals,
            runtimeMinutes: stats.startTime ? Math.floor((Date.now() - stats.startTime) / 60000) : 0
        });
    };

    g.__yokeInjectPrompt = function (prompt) {
        return injectPrompt(prompt);
    };

    g.__yokeSwitchModel = function (modelId) {
        return switchModel(modelId);
    };

    g.__yokeUpdateConfig = function (config) {
        yokeConfig = { ...yokeConfig, ...config };
        return 'config_updated';
    };

    log('Yoke script injected successfully');
})();
