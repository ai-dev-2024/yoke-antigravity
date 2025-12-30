/**
 * Task Analyzer - Unit Tests
 * Tests task extraction and categorization for model selection
 */

import { describe, it, expect } from 'vitest';

// Task type categories
type TaskType = 'reasoning' | 'frontend' | 'quick' | 'general';

// Keywords for task categorization
const REASONING_KEYWORDS = [
    'debug', 'fix', 'error', 'bug', 'issue', 'problem', 'investigate',
    'analyze', 'optimize', 'performance', 'memory', 'leak', 'crash',
    'architecture', 'design', 'refactor', 'complex'
];

const FRONTEND_KEYWORDS = [
    'ui', 'css', 'style', 'component', 'react', 'vue', 'angular',
    'html', 'layout', 'responsive', 'animation', 'design', 'button',
    'form', 'modal', 'dropdown', 'menu', 'dashboard', 'page', 'frontend'
];

const QUICK_KEYWORDS = [
    'simple', 'quick', 'typo', 'rename', 'move', 'delete', 'add import',
    'format', 'lint', 'comment', 'docs', 'readme'
];

function categorizeTask(task: string): TaskType {
    const lower = task.toLowerCase();

    // Check for reasoning keywords
    for (const kw of REASONING_KEYWORDS) {
        if (lower.includes(kw)) return 'reasoning';
    }

    // Check for frontend keywords
    for (const kw of FRONTEND_KEYWORDS) {
        if (lower.includes(kw)) return 'frontend';
    }

    // Check for quick task keywords
    for (const kw of QUICK_KEYWORDS) {
        if (lower.includes(kw)) return 'quick';
    }

    return 'general';
}

function extractCurrentTask(fixPlanContent: string): string | null {
    const lines = fixPlanContent.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        // Look for unchecked checkbox items: - [ ] or * [ ]
        const uncheckedMatch = trimmed.match(/^[-*]\s*\[\s*\]\s*(.+)$/);
        if (uncheckedMatch) {
            return uncheckedMatch[1].trim();
        }

        // Look for in-progress items: - [/] or - [~]
        const inProgressMatch = trimmed.match(/^[-*]\s*\[[\/~]\]\s*(.+)$/);
        if (inProgressMatch) {
            return inProgressMatch[1].trim();
        }
    }

    return null; // All tasks done
}

describe('TaskAnalyzer', () => {
    describe('Task Categorization', () => {
        it('should categorize debugging tasks as reasoning', () => {
            const tasks = [
                'Debug the authentication error',
                'Fix the memory leak in the worker',
                'Investigate why the API crashes',
                'Analyze performance bottleneck',
            ];

            for (const task of tasks) {
                expect(categorizeTask(task), `"${task}" should be reasoning`).toBe('reasoning');
            }
        });

        it('should categorize UI tasks as frontend', () => {
            const tasks = [
                'Update the dashboard UI styles',
                'Create a new button component',
                'Adjust the responsive layout on mobile',
                'Add animation to the modal',
                'Build the settings page for frontend',
            ];

            for (const task of tasks) {
                expect(categorizeTask(task), `"${task}" should be frontend`).toBe('frontend');
            }
        });

        it('should categorize simple tasks as quick', () => {
            const tasks = [
                'typo in the code',
                'rename ABC to XYZ',
                'add import lodash',
                'simple edit here',
                'readme docs change',
            ];

            for (const task of tasks) {
                expect(categorizeTask(task), `"${task}" should be quick`).toBe('quick');
            }
        });

        it('should categorize ambiguous tasks as general', () => {
            const tasks = [
                'Implement user signup',
                'Create the payment service',
                'Set up the connection pool',
            ];

            for (const task of tasks) {
                expect(categorizeTask(task), `"${task}" should be general`).toBe('general');
            }
        });
    });

    describe('Task Extraction from @fix_plan.md', () => {
        it('should extract first unchecked task', () => {
            const content = `# Fix Plan

- [x] Task 1 completed
- [x] Task 2 completed
- [ ] Task 3 pending
- [ ] Task 4 pending
`;
            expect(extractCurrentTask(content)).toBe('Task 3 pending');
        });

        it('should return in-progress task first', () => {
            const content = `# Fix Plan

- [x] Task 1 completed
- [/] Task 2 in progress
- [ ] Task 3 pending
`;
            expect(extractCurrentTask(content)).toBe('Task 2 in progress');
        });

        it('should return null when all tasks complete', () => {
            const content = `# Fix Plan

- [x] Task 1 completed
- [x] Task 2 completed
`;
            expect(extractCurrentTask(content)).toBeNull();
        });

        it('should handle asterisk list markers', () => {
            const content = `# Fix Plan

* [x] Task 1 completed
* [ ] Task 2 pending
`;
            expect(extractCurrentTask(content)).toBe('Task 2 pending');
        });

        it('should handle empty fix plan', () => {
            expect(extractCurrentTask('')).toBeNull();
            expect(extractCurrentTask('# No tasks here\n\nJust notes.')).toBeNull();
        });
    });
});
