const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        toggle(value, force) {
            if (force) {
                values.add(value);
                return true;
            }

            values.delete(value);
            return false;
        },
        contains(value) {
            return values.has(value);
        }
    };
}

function loadQueryControlStateFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'query-control-state.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/query-control-state.js' });
    return sandbox.window.TFTRenderer.createQueryControlState;
}

describe('renderer query control state', () => {
    it('derives and applies fetch/search button state', () => {
        const sandbox = {
            console,
            window: {
                TFTRenderer: {}
            }
        };
        const createQueryControlState = loadQueryControlStateFactory(sandbox);
        const queryControlState = createQueryControlState();
        const fetchButton = { disabled: false, style: { opacity: '' } };
        const searchButton = { disabled: false, innerText: 'Compute', classList: createClassList() };

        queryControlState.applyFetchButtonUi(fetchButton, queryControlState.getFetchButtonUiState({
            isSearching: true,
            isFetchingData: false
        }));
        queryControlState.applySearchButtonUi(searchButton, queryControlState.getSearchButtonUiState({
            isSearching: false,
            isFetchingData: true,
            hasActiveData: true
        }));

        assert.equal(fetchButton.disabled, true);
        assert.equal(fetchButton.style.opacity, '0.5');
        assert.equal(searchButton.disabled, true);
        assert.equal(searchButton.classList.contains('disabled'), true);
        assert.equal(searchButton.innerText, 'Loading data...');
    });

    it('reads, applies, and clamps query control values', () => {
        const sandbox = {
            console,
            window: {
                TFTRenderer: {}
            }
        };
        const createQueryControlState = loadQueryControlStateFactory(sandbox);
        const queryControlState = createQueryControlState({
            getDefaultBoardSize: () => 9,
            getDefaultMaxResults: () => 50
        });
        const controls = {
            boardSize: { value: '11' },
            maxResults: { value: '5000' },
            onlyActiveToggle: { checked: true },
            tierRankToggle: { checked: false },
            includeUniqueToggle: { checked: true }
        };

        assert.deepEqual(
            JSON.parse(JSON.stringify(queryControlState.readQueryControlValues(controls))),
            {
                boardSize: 11,
                maxResults: 5000,
                onlyActive: true,
                tierRank: false,
                includeUnique: true
            }
        );

        queryControlState.applyQueryControlValues(controls, queryControlState.getDefaultSearchParams());
        assert.equal(controls.boardSize.value, 9);
        assert.equal(controls.maxResults.value, 50);
        assert.equal(controls.onlyActiveToggle.checked, true);
        assert.equal(controls.tierRankToggle.checked, true);
        assert.equal(controls.includeUniqueToggle.checked, false);

        controls.maxResults.value = '5000';
        assert.equal(queryControlState.clampNumericInput(controls.maxResults, 1, 1000, 50), 1000);
        assert.equal(controls.maxResults.value, 1000);
    });
});
