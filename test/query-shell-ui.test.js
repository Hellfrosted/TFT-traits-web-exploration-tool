const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add: (value) => values.add(value),
        remove: (value) => values.delete(value),
        toggle(value, force) {
            if (force === true) {
                values.add(value);
                return true;
            }

            if (force === false) {
                values.delete(value);
                return false;
            }

            if (values.has(value)) {
                values.delete(value);
                return false;
            }

            values.add(value);
            return true;
        },
        contains: (value) => values.has(value)
    };
}

function createElement(overrides = {}) {
    return {
        innerHTML: '',
        innerText: '',
        value: '',
        disabled: false,
        checked: false,
        style: {},
        classList: createClassList(),
        ...overrides
    };
}

function loadQueryShellUiFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'query-shell-ui.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/query-shell-ui.js' });
    return sandbox.window.TFTRenderer.createQueryShellUi;
}

describe('renderer query shell ui', () => {
    it('renders stats, summary, status, and source labels through shell nodes', () => {
        const nodes = {
            resultsSummary: createElement(),
            resultsQuerySummary: createElement(),
            dataStats: createElement(),
            status: createElement(),
            dataSourceSelect: createElement({ value: 'latest' })
        };
        const sandbox = {
            console,
            window: {
                TFTRenderer: {}
            },
            document: {
                getElementById: (id) => nodes[id] || null
            }
        };

        const createQueryShellUi = loadQueryShellUiFactory(sandbox);
        const queryShellUi = createQueryShellUi({
            state: {
                defaultDataSource: 'pbe'
            }
        }, {
            querySummaryUi: {
                buildDataStatsMarkup: ({ units, traits, roles, assets }) =>
                    `${units}|${traits}|${roles}|${assets}`
            },
            queryControlState: {}
        });

        queryShellUi.setResultsSummary('<strong>Summary</strong>');
        queryShellUi.setQuerySummary('<strong>Query</strong>');
        queryShellUi.setDataStats(10, 4, 2, '8/10');
        queryShellUi.setStatusMessage('Loaded');

        assert.equal(nodes.resultsSummary.innerHTML, '<strong>Summary</strong>');
        assert.equal(nodes.resultsQuerySummary.innerHTML, '<strong>Query</strong>');
        assert.equal(nodes.dataStats.innerHTML, '10|4|2|8/10');
        assert.equal(nodes.status.innerText, 'Loaded');
        assert.equal(queryShellUi.getSelectedDataSource(), 'latest');
        assert.equal(queryShellUi.getDataSourceLabel('latest'), 'Live');
        assert.equal(queryShellUi.getDataSourceLabel('pbe'), 'PBE');
    });

    it('syncs fetch and search button state from control-state helpers', () => {
        const nodes = {
            fetchBtn: createElement(),
            searchBtn: createElement()
        };
        const sandbox = {
            console,
            window: {
                TFTRenderer: {}
            },
            document: {
                getElementById: (id) => nodes[id] || null
            }
        };
        const appliedStates = [];

        const createQueryShellUi = loadQueryShellUiFactory(sandbox);
        const queryShellUi = createQueryShellUi({
            state: {
                isSearching: true,
                isFetchingData: false,
                activeData: { ready: true }
            }
        }, {
            querySummaryUi: {
                buildDataStatsMarkup: () => ''
            },
            queryControlState: {
                getFetchButtonUiState: () => ({ disabled: true, opacity: '0.5' }),
                applyFetchButtonUi: (button, uiState) => {
                    button.disabled = uiState.disabled;
                    button.style.opacity = uiState.opacity;
                    appliedStates.push(['fetch', uiState]);
                },
                getSearchButtonUiState: () => ({
                    disabled: true,
                    classDisabled: true,
                    text: 'Searching...'
                }),
                applySearchButtonUi: (button, uiState) => {
                    button.disabled = uiState.disabled;
                    button.classList.toggle('disabled', uiState.classDisabled);
                    button.innerText = uiState.text;
                    appliedStates.push(['search', uiState]);
                }
            }
        });

        queryShellUi.syncFetchButtonState();
        queryShellUi.syncSearchButtonState();

        assert.equal(nodes.fetchBtn.disabled, true);
        assert.equal(nodes.fetchBtn.style.opacity, '0.5');
        assert.equal(nodes.searchBtn.disabled, true);
        assert.equal(nodes.searchBtn.classList.contains('disabled'), true);
        assert.equal(nodes.searchBtn.innerText, 'Searching...');
        assert.deepEqual(appliedStates, [
            ['fetch', { disabled: true, opacity: '0.5' }],
            ['search', { disabled: true, classDisabled: true, text: 'Searching...' }]
        ]);
    });
});
