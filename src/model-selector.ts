/**
 * Yoke - Model Selector
 * Intelligently selects the optimal AI model based on task type
 */

export type ModelId =
    | 'gemini-3-pro-high'
    | 'gemini-3-pro-low'
    | 'gemini-3-flash'
    | 'claude-sonnet-4.5'
    | 'claude-sonnet-4.5-thinking'
    | 'claude-opus-4.5-thinking'
    | 'gpt-oss-120b';

export type TaskType = 'reasoning' | 'frontend' | 'quick' | 'general' | 'bulk';

export interface ModelConfig {
    id: ModelId;
    displayName: string;
    taskTypes: TaskType[];
    priority: number; // Higher = prefer this model
    costTier: 'high' | 'medium' | 'low';
}

export const MODELS: ModelConfig[] = [
    {
        id: 'claude-opus-4.5-thinking',
        displayName: 'Claude Opus 4.5 (Thinking)',
        taskTypes: ['reasoning'],
        priority: 100,
        costTier: 'high'
    },
    {
        id: 'claude-sonnet-4.5-thinking',
        displayName: 'Claude Sonnet 4.5 (Thinking)',
        taskTypes: ['reasoning', 'general'],
        priority: 90,
        costTier: 'medium'
    },
    {
        id: 'gemini-3-pro-high',
        displayName: 'Gemini 3 Pro (High)',
        taskTypes: ['frontend', 'general'],
        priority: 85,
        costTier: 'high'
    },
    {
        id: 'claude-sonnet-4.5',
        displayName: 'Claude Sonnet 4.5',
        taskTypes: ['general', 'reasoning'],
        priority: 80,
        costTier: 'medium'
    },
    {
        id: 'gemini-3-pro-low',
        displayName: 'Gemini 3 Pro (Low)',
        taskTypes: ['frontend', 'general', 'quick'],
        priority: 70,
        costTier: 'low'
    },
    {
        id: 'gemini-3-flash',
        displayName: 'Gemini 3 Flash',
        taskTypes: ['quick', 'bulk'],
        priority: 60,
        costTier: 'low'
    },
    {
        id: 'gpt-oss-120b',
        displayName: 'GPT-OSS 120B (Medium)',
        taskTypes: ['bulk', 'general'],
        priority: 50,
        costTier: 'low'
    }
];

// Task detection patterns
const TASK_PATTERNS: Record<TaskType, string[]> = {
    reasoning: [
        'debug', 'fix bug', 'algorithm', 'architecture', 'refactor',
        'optimize', 'analyze', 'complex', 'logic', 'performance',
        'multi-file', 'migration', 'security', 'error handling'
    ],
    frontend: [
        'ui', 'css', 'component', 'react', 'vue', 'html', 'style',
        'design', 'animation', 'responsive', 'layout', 'tailwind',
        'button', 'form', 'modal', 'navbar', 'sidebar', 'dashboard'
    ],
    quick: [
        'format', 'typo', 'rename', 'simple', 'small change', 'minor',
        'comment', 'cleanup', 'lint', 'import', 'export'
    ],
    general: [
        'feature', 'implement', 'add', 'create', 'test', 'documentation',
        'api', 'endpoint', 'function', 'class', 'module'
    ],
    bulk: [
        'batch', 'multiple files', 'bulk update', 'mass', 'all files'
    ]
};

/**
 * Analyzes a task description and determines its type
 */
export function analyzeTaskType(taskDescription: string): TaskType {
    const lowerTask = taskDescription.toLowerCase();

    // Score each task type based on keyword matches
    const scores: Record<TaskType, number> = {
        reasoning: 0,
        frontend: 0,
        quick: 0,
        general: 0,
        bulk: 0
    };

    for (const [taskType, patterns] of Object.entries(TASK_PATTERNS)) {
        for (const pattern of patterns) {
            if (lowerTask.includes(pattern)) {
                scores[taskType as TaskType] += 1;
            }
        }
    }

    // Find highest scoring type
    let maxScore = 0;
    let selectedType: TaskType = 'general';

    for (const [type, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            selectedType = type as TaskType;
        }
    }

    return selectedType;
}

/**
 * Selects the optimal model for a given task type
 */
export function selectModel(
    taskType: TaskType,
    unavailableModels: ModelId[] = []
): ModelConfig | null {
    // Filter models that support this task type and are available
    const candidates = MODELS
        .filter(m => m.taskTypes.includes(taskType))
        .filter(m => !unavailableModels.includes(m.id))
        .sort((a, b) => b.priority - a.priority);

    return candidates[0] || null;
}

/**
 * Main model selection function
 */
export function selectModelForTask(
    taskDescription: string,
    unavailableModels: ModelId[] = []
): { model: ModelConfig | null; taskType: TaskType } {
    const taskType = analyzeTaskType(taskDescription);
    const model = selectModel(taskType, unavailableModels);

    return { model, taskType };
}
