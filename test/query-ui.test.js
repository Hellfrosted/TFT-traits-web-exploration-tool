const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadQueryUiFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'query-ui.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/query-ui.js' });
    return sandbox.window.TFTRenderer.createQueryUi;
}

function createEventTarget() {
    const listeners = new Map();
    return {
        addEventListener(eventName, handler) {
            if (!listeners.has(eventName)) {
                listeners.set(eventName, []);
            }
            listeners.get(eventName).push(handler);
        },
        dispatchEvent(event) {
            const handlers = listeners.get(event.type) || [];
            handlers.forEach((handler) => handler(event));
        }
    };
}

describe('renderer query UI', () => {
    it('refreshes the draft summary on multiselect changes', () => {
        const controlsBody = createEventTarget();
        const summaryNode = { innerHTML: '' };
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: {
                        escapeHtml: (value) => String(value ?? '')
                    }
                }
            },
            document: {
                getElementById: (id) => {
                    if (id === 'resultsQuerySummary') return summaryNode;
                    if (id === 'boardSize') return { value: '9', addEventListener: () => {} };
                    if (id === 'maxResults') return { value: '50', addEventListener: () => {} };
                    if (id === 'onlyActiveToggle') return { checked: true, addEventListener: () => {} };
                    if (id === 'tierRankToggle') return { checked: true, addEventListener: () => {} };
                    if (id === 'includeUniqueToggle') return { checked: false, addEventListener: () => {} };
                    return null;
                },
                querySelector: (selector) => selector === '.controls-body' ? controlsBody : null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const app = {
            state: {
                activeData: { ready: true },
                isSearching: false,
                searchLimits: {},
                selectors: {
                    mustInclude: { getValues: () => ['A'] },
                    mustExclude: { getValues: () => [] },
                    mustIncludeTraits: { getValues: () => ['Bruiser'] },
                    mustExcludeTraits: { getValues: () => [] },
                    extraEmblems: { getValues: () => [] },
                    tankRoles: { getValues: () => [] },
                    carryRoles: { getValues: () => [] }
                },
                variantLockControls: new Map(),
                listeners: {
                    draftBound: false
                }
            }
        };

        const queryUi = createQueryUi(app);
        queryUi.bindDraftQueryListeners();
        controlsBody.dispatchEvent({ type: 'multiselectchange' });

        assert.match(summaryNode.innerHTML, /2 active constraints/);
        assert.match(summaryNode.innerHTML, /Include 1 units/);
        assert.match(summaryNode.innerHTML, /Force 1 traits/);
    });
});
