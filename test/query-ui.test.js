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

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add: (value) => values.add(value),
        remove: (value) => values.delete(value),
        contains: (value) => values.has(value)
    };
}

function createDomElement(tagName) {
    const listeners = new Map();
    const element = {
        tagName,
        children: [],
        className: '',
        classList: createClassList(),
        attributes: {},
        textContent: '',
        value: '',
        checked: false,
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
        addEventListener(eventName, handler) {
            if (!listeners.has(eventName)) {
                listeners.set(eventName, []);
            }
            listeners.get(eventName).push(handler);
        }
    };

    Object.defineProperty(element, 'options', {
        get() {
            return this.children;
        }
    });

    let innerHtmlValue = '';
    Object.defineProperty(element, 'innerHTML', {
        get() {
            return innerHtmlValue;
        },
        set(value) {
            innerHtmlValue = value;
            this.children = [];
        }
    });

    return element;
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

    it('refreshes the draft estimate when query constraints change', async () => {
        const controlsBody = createEventTarget();
        const summaryNode = { innerHTML: '' };
        const resultsSummaries = [];
        const renderEstimate = createDeferred();
        let estimateCalls = 0;
        const estimateParams = [];
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
                isFetchingData: false,
                searchLimits: {},
                electronBridge: {
                    normalizeSearchParams: async () => ({
                        params: {
                            boardSize: 9,
                            maxResults: 50,
                            mustInclude: ['CanonicalUnit'],
                            mustExclude: [],
                            mustIncludeTraits: [],
                            mustExcludeTraits: [],
                            extraEmblems: [],
                            variantLocks: {},
                            tankRoles: [],
                            carryRoles: [],
                            onlyActive: true,
                            tierRank: true,
                            includeUnique: false
                        },
                        comparisonKey: 'canonical-key',
                        dataFingerprint: 'fingerprint-1'
                    }),
                    getSearchEstimate: async (params) => {
                        estimateCalls += 1;
                        estimateParams.push(params);
                        return { count: 1234, remainingSlots: 6 };
                    }
                },
                selectors: {
                    mustInclude: { getValues: () => ['A'] },
                    mustExclude: { getValues: () => [] },
                    mustIncludeTraits: { getValues: () => [] },
                    mustExcludeTraits: { getValues: () => [] },
                    extraEmblems: { getValues: () => [] },
                    tankRoles: { getValues: () => [] },
                    carryRoles: { getValues: () => [] }
                },
                variantLockControls: new Map(),
                listeners: {
                    draftBound: false
                }
            },
            results: {
                renderEstimateSummary: (estimate) => {
                    resultsSummaries.push(estimate);
                    renderEstimate.resolve();
                }
            }
        };

        const queryUi = createQueryUi(app);
        queryUi.bindDraftQueryListeners();
        controlsBody.dispatchEvent({ type: 'multiselectchange' });
        await renderEstimate.promise;

        assert.equal(estimateCalls, 1);
        assert.deepEqual(estimateParams[0], {
            boardSize: 9,
            maxResults: 50,
            mustInclude: ['CanonicalUnit'],
            mustExclude: [],
            mustIncludeTraits: [],
            mustExcludeTraits: [],
            extraEmblems: [],
            variantLocks: {},
            tankRoles: [],
            carryRoles: [],
            onlyActive: true,
            tierRank: true,
            includeUnique: false
        });
        assert.deepEqual(resultsSummaries.at(-1), { count: 1234, remainingSlots: 6 });
    });

    it('keeps stale draft-estimate responses from overriding newer canonicalized requests', async () => {
        const summaryNode = { innerHTML: '' };
        const renderedEstimates = [];
        let estimateCallCount = 0;
        let normalizeCallCount = 0;
        let resolveFirstNormalize;
        const firstNormalizePromise = new Promise((resolve) => {
            resolveFirstNormalize = resolve;
        });
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
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const app = {
            state: {
                activeData: { ready: true },
                isSearching: false,
                isFetchingData: false,
                searchLimits: {},
                electronBridge: {
                    normalizeSearchParams: async (params) => {
                        normalizeCallCount += 1;
                        if (normalizeCallCount === 1) {
                            await firstNormalizePromise;
                            return {
                                params: {
                                    ...params,
                                    mustInclude: ['First']
                                },
                                comparisonKey: 'first',
                                dataFingerprint: 'fp'
                            };
                        }

                        return {
                            params: {
                                ...params,
                                mustInclude: ['Second']
                            },
                            comparisonKey: 'second',
                            dataFingerprint: 'fp'
                        };
                    },
                    getSearchEstimate: async (params) => {
                        estimateCallCount += 1;
                        return {
                            count: params.mustInclude[0] === 'Second' ? 200 : 100,
                            remainingSlots: 4
                        };
                    }
                },
                selectors: {
                    mustInclude: { getValues: () => ['Raw'] },
                    mustExclude: { getValues: () => [] },
                    mustIncludeTraits: { getValues: () => [] },
                    mustExcludeTraits: { getValues: () => [] },
                    extraEmblems: { getValues: () => [] },
                    tankRoles: { getValues: () => [] },
                    carryRoles: { getValues: () => [] }
                },
                variantLockControls: new Map(),
                listeners: {
                    draftBound: false
                }
            },
            results: {
                renderEstimateSummary: (estimate) => renderedEstimates.push(estimate)
            }
        };

        const queryUi = createQueryUi(app);
        const first = queryUi.refreshDraftEstimate();
        const second = queryUi.refreshDraftEstimate();
        await Promise.resolve();
        resolveFirstNormalize();
        await first;
        await second;

        assert.equal(estimateCallCount, 1);
        assert.deepEqual(renderedEstimates, [{ count: 200, remainingSlots: 4 }]);
    });

    it('renders variant lock rows and preserves requested locks', () => {
        const section = createDomElement('section');
        section.classList.add('hidden');
        const container = createDomElement('div');
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
                createElement: (tagName) => createDomElement(tagName),
                getElementById: (id) => {
                    if (id === 'variantLocksSection') return section;
                    if (id === 'variantLocksContainer') return container;
                    return null;
                },
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const app = {
            state: {
                activeData: {
                    unitMap: new Map([
                        ['MissFortune', {
                            id: 'MissFortune',
                            displayName: 'Miss Fortune',
                            variants: [
                                { id: 'conduit', label: 'Conduit Mode' },
                                { id: 'challenger', label: 'Challenger Mode' }
                            ]
                        }],
                        ['Braum', {
                            id: 'Braum',
                            displayName: 'Braum',
                            variants: []
                        }]
                    ])
                },
                searchLimits: {},
                variantLockControls: new Map(),
                listeners: {}
            }
        };

        const queryUi = createQueryUi(app);
        queryUi.renderVariantLockControls({ MissFortune: 'challenger' });

        assert.equal(section.classList.contains('hidden'), false);
        assert.equal(container.children.length, 1);
        assert.equal(app.state.variantLockControls.size, 1);
        const select = app.state.variantLockControls.get('MissFortune');
        assert.equal(select.value, 'challenger');
        assert.deepEqual(
            select.options.map((option) => option.value),
            ['auto', 'conduit', 'challenger']
        );
    });

    it('hides the variant lock section when no variant-capable units are available', () => {
        const section = createDomElement('section');
        const container = createDomElement('div');
        container.appendChild(createDomElement('div'));
        const staleSelect = createDomElement('select');
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
                createElement: (tagName) => createDomElement(tagName),
                getElementById: (id) => {
                    if (id === 'variantLocksSection') return section;
                    if (id === 'variantLocksContainer') return container;
                    return null;
                },
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const app = {
            state: {
                activeData: {
                    unitMap: new Map([
                        ['Braum', {
                            id: 'Braum',
                            displayName: 'Braum',
                            variants: []
                        }]
                    ])
                },
                searchLimits: {},
                variantLockControls: new Map([['Stale', staleSelect]]),
                listeners: {}
            }
        };

        const queryUi = createQueryUi(app);
        queryUi.renderVariantLockControls();

        assert.equal(section.classList.contains('hidden'), true);
        assert.equal(container.children.length, 0);
        assert.equal(app.state.variantLockControls.size, 0);
    });
});
