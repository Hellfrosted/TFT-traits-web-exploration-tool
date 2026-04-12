const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSearchOperationsFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'search-operations.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/search-operations.js' });
    return sandbox.window.TFTRenderer.createSearchOperations;
}

function createSandbox() {
    return {
        console,
        window: {
            TFTRenderer: {}
        }
    };
}

describe('renderer search operations', () => {
    it('only prompts for confirmation when the search volume exceeds the configured threshold', async () => {
        const createSearchOperations = loadSearchOperationsFactory(createSandbox());
        const prompts = [];
        const operations = createSearchOperations({
            state: {
                searchLimits: {
                    LARGE_SEARCH_THRESHOLD: 10
                }
            },
            queryUi: {}
        }, {
            showConfirm: async (message, title) => {
                prompts.push({ message, title });
                return false;
            }
        });

        assert.equal(await operations.confirmLargeSearchVolume({ count: 5 }), true);
        assert.equal(await operations.confirmLargeSearchVolume({ count: 12 }), false);
        assert.deepEqual(prompts, [{
            message: 'Search volume: ~0.0B combinations. This may take a minute. Continue?',
            title: 'Performance Warning'
        }]);
    });

    it('updates active progress state only for accepted progress events', () => {
        const createSearchOperations = loadSearchOperationsFactory(createSandbox());
        const renderedProgress = [];
        const state = {
            isSearching: true,
            isCancellingSearch: false,
            activeSearchId: 4,
            lastCompletedSearchId: 2,
            cleanupFns: [],
            electronBridge: {
                onSearchProgress: (handler) => {
                    state.progressHandler = handler;
                    return () => {};
                }
            }
        };
        const operations = createSearchOperations({
            state,
            queryUi: {}
        }, {
            resolveProgressSearchId: (data, activeSearchId) => (
                data.searchId === activeSearchId ? activeSearchId : null
            ),
            renderActiveSearchUi: (progress) => {
                renderedProgress.push(progress);
            }
        });

        operations.subscribeProgressUpdates();
        state.progressHandler({ searchId: 3, pct: 10, checked: 1, total: 10 });
        state.progressHandler({ searchId: 4, pct: 20, checked: 2, total: 10 });

        assert.deepEqual(JSON.parse(JSON.stringify(renderedProgress)), [{
            pct: 20,
            checked: 2,
            total: 10
        }]);
        assert.equal(state.activeSearchId, 4);
        assert.equal(state.cleanupFns.length, 1);
    });
});
