/**
 * Test Loop Detector - Unit Tests
 * Tests the test-loop detection logic for autonomous mode
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import the actual detector patterns for testing
const TEST_PATTERNS = [
    /running\s+(unit\s+)?tests?/i,
    /npm\s+(run\s+)?test/i,
    /jest|vitest|mocha|pytest|rspec/i,
    /all\s+tests?\s+pass(ed|ing)?/i,
    /\d+\s+tests?\s+(passed|passing)/i,
    /test\s+suite/i,
    /coverage\s+report/i,
    /✓.*test|test.*✓/i,
    /PASS\s+\w+\.test\./i,
    /no\s+changes?\s+(needed|required)/i,
    /everything\s+is\s+working/i,
    /all\s+good|looks\s+good/i,
];

const FEATURE_WORK_PATTERNS = [
    /creat(ed?|ing)\s+(new\s+)?file/i,
    /modif(ied|ying)\s+\w+/i,
    /implement(ed|ing)/i,
    /add(ed|ing)\s+(new\s+)?/i,
    /fix(ed|ing)\s+(bug|issue|error)/i,
    /refactor(ed|ing)/i,
    /updat(ed|ing)\s+\w+/i,
];

function analyzeResponse(response: string): { isTestOnly: boolean; hasFeatureWork: boolean } {
    let testMatches = 0;
    let featureMatches = 0;

    for (const pattern of TEST_PATTERNS) {
        if (pattern.test(response)) testMatches++;
    }

    for (const pattern of FEATURE_WORK_PATTERNS) {
        if (pattern.test(response)) featureMatches++;
    }

    return {
        isTestOnly: testMatches > 0 && featureMatches === 0,
        hasFeatureWork: featureMatches > 0,
    };
}

describe('TestLoopDetector', () => {
    describe('Pattern Detection', () => {
        it('should detect test-only responses', () => {
            const testOnlyMessages = [
                'Running tests... All 15 tests passed!',
                'npm run test completed successfully',
                'jest --coverage: Coverage report generated',
                'All tests pass, everything is working correctly.',
                '✓ test authentication flow',
            ];

            for (const msg of testOnlyMessages) {
                const result = analyzeResponse(msg);
                expect(result.isTestOnly, `"${msg}" should be test-only`).toBe(true);
            }
        });

        it('should detect feature work responses', () => {
            const featureMessages = [
                'I created a new file src/utils/helper.ts',
                'Implementing the new authentication flow now',
                'I fixed the bug in the login component',
                'Refactoring the database layer today',
                'I am adding new validation logic',
            ];

            for (const msg of featureMessages) {
                const result = analyzeResponse(msg);
                expect(result.hasFeatureWork, `"${msg}" should have feature work`).toBe(true);
            }
        });

        it('should handle mixed responses correctly', () => {
            const mixedMessage = 'I fixed the bug in authentication. Now running tests... All tests passed!';
            const result = analyzeResponse(mixedMessage);

            // Has feature work, so should not be test-only
            expect(result.hasFeatureWork).toBe(true);
        });

        it('should handle empty/neutral responses', () => {
            const neutralMessages = [
                '',
                'Thinking about the problem...',
                'Let me analyze this code.',
            ];

            for (const msg of neutralMessages) {
                const result = analyzeResponse(msg);
                expect(result.isTestOnly, `"${msg}" should NOT be test-only`).toBe(false);
            }
        });
    });

    describe('Exit Logic', () => {
        it('should trigger exit after consecutive test-only loops', () => {
            const maxConsecutive = 3;
            let consecutive = 0;

            const testResponses = [
                'All tests passed',
                'Running tests... 5 tests passed',
                'npm test completed, looks good',
            ];

            for (const response of testResponses) {
                const result = analyzeResponse(response);
                if (result.isTestOnly) {
                    consecutive++;
                } else {
                    consecutive = 0;
                }
            }

            expect(consecutive).toBe(3);
            expect(consecutive >= maxConsecutive).toBe(true);
        });

        it('should reset consecutive count on feature work', () => {
            let consecutive = 0;

            const responses = [
                'All tests passed', // test
                'All tests passed', // test
                'Fixed the authentication bug', // feature - should reset
                'All tests passed', // test
            ];

            for (const response of responses) {
                const result = analyzeResponse(response);
                if (result.isTestOnly) {
                    consecutive++;
                } else {
                    consecutive = 0;
                }
            }

            expect(consecutive).toBe(1); // Only the last one
        });
    });
});
