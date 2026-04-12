const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    createSearchContext,
    createCancelledSearchResponse,
    createWorkerProgressPayload,
    shouldPersistSearchResults,
    createWorkerDoneResponse,
    createWorkerErrorResponse,
    createWorkerExitResponse
} = require('../main-process/search-service-state.js');

describe('search service state helpers', () => {
    it('creates a fresh search context with worker lifecycle flags', () => {
        assert.deepEqual(createSearchContext(7), {
            searchId: 7,
            cancelled: false,
            worker: null,
            settle: null,
            completed: false,
            terminated: false,
            terminatePromise: null
        });
    });

    it('derives progress payloads for renderer IPC', () => {
        assert.deepEqual(
            createWorkerProgressPayload(12, { pct: 30, checked: 15, total: 50 }),
            { searchId: 12, pct: 30, checked: 15, total: 50 }
        );
    });

    it('persists only successful board result arrays', () => {
        assert.equal(shouldPersistSearchResults([{ units: ['A'] }]), true);
        assert.equal(shouldPersistSearchResults([{ error: 'Search too large' }]), false);
        assert.equal(shouldPersistSearchResults([]), false);
        assert.equal(shouldPersistSearchResults(null), false);
    });

    it('creates success, failure, and cancelled worker responses', () => {
        assert.deepEqual(
            createWorkerDoneResponse({ success: true, results: [{ units: ['A'] }] }, 3),
            {
                success: true,
                cancelled: false,
                fromCache: false,
                results: [{ units: ['A'] }],
                error: null,
                searchId: 3
            }
        );

        assert.deepEqual(
            createWorkerDoneResponse({ success: false, error: 'boom' }, 4),
            {
                success: false,
                cancelled: false,
                fromCache: false,
                results: [],
                error: 'boom',
                searchId: 4
            }
        );

        assert.deepEqual(
            createWorkerErrorResponse(new Error('broken'), 5, true),
            createCancelledSearchResponse(5)
        );
    });

    it('creates deterministic worker exit responses', () => {
        assert.deepEqual(
            createWorkerExitResponse(0, 9),
            {
                success: false,
                cancelled: false,
                fromCache: false,
                results: [],
                error: 'Search worker exited before returning a result.',
                searchId: 9
            }
        );

        assert.deepEqual(
            createWorkerExitResponse(2, 10),
            {
                success: false,
                cancelled: false,
                fromCache: false,
                results: [],
                error: 'Worker exited with code 2',
                searchId: 10
            }
        );
    });
});
