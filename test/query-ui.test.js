const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadQueryUiFactory(sandbox) {
    const variantLockUiSource = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'variant-lock-ui.js'),
        'utf8'
    );
    const querySummaryUiSource = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'query-summary-ui.js'),
        'utf8'
    );
    const queryControlStateSource = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'query-control-state.js'),
        'utf8'
    );
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'query-ui.js'),
        'utf8'
    );

    vm.runInNewContext(variantLockUiSource, sandbox, { filename: 'renderer/variant-lock-ui.js' });
    vm.runInNewContext(querySummaryUiSource, sandbox, { filename: 'renderer/query-summary-ui.js' });
    vm.runInNewContext(queryControlStateSource, sandbox, { filename: 'renderer/query-control-state.js' });
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

function createSelector(initialValues = []) {
    let values = [...initialValues];
    return {
        getValues: () => [...values],
        setValues(nextValues) {
            values = [...nextValues];
        }
    };
}

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

    it('renders query summary chips and active-state meta for populated params', () => {
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
                getElementById: (id) => id === 'resultsQuerySummary' ? summaryNode : null,
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const queryUi = createQueryUi({
            state: {
                searchLimits: {},
                selectors: {},
                variantLockControls: new Map(),
                listeners: {}
            }
        });

        queryUi.renderQuerySummary({
            boardSize: 9,
            maxResults: 50,
            mustInclude: ['A'],
            mustExclude: ['B'],
            mustIncludeTraits: ['Bruiser'],
            mustExcludeTraits: ['Sniper'],
            extraEmblems: ['Emblem'],
            variantLocks: { MissFortune: 'conduit' },
            includeUnique: true,
            onlyActive: false,
            tierRank: false
        }, 'Loaded Set 17');

        assert.match(summaryNode.innerHTML, /query-summary-meta query-summary-meta-active/);
        assert.match(summaryNode.innerHTML, /Include 1 units/);
        assert.match(summaryNode.innerHTML, /Exclude 1 units/);
        assert.match(summaryNode.innerHTML, /Force 1 traits/);
        assert.match(summaryNode.innerHTML, /Ban 1 traits/);
        assert.match(summaryNode.innerHTML, /1 emblems/);
        assert.match(summaryNode.innerHTML, /1 locked modes/);
        assert.match(summaryNode.innerHTML, /Unique traits on/);
        assert.match(summaryNode.innerHTML, /Inactive traits counted/);
        assert.match(summaryNode.innerHTML, /Flat trait ranking/);
    });

    it('renders summary meta without chips when params are absent', () => {
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
                getElementById: (id) => id === 'resultsQuerySummary' ? summaryNode : null,
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const queryUi = createQueryUi({
            state: {
                searchLimits: {},
                selectors: {},
                variantLockControls: new Map(),
                listeners: {}
            }
        });

        queryUi.renderQuerySummary(null, 'Search cancelled');

        assert.match(summaryNode.innerHTML, /query-summary-meta query-summary-meta-warning/);
        assert.doesNotMatch(summaryNode.innerHTML, /query-chip-list/);
        assert.match(summaryNode.innerHTML, /Search cancelled/);
    });

    it('renders data stats through extracted markup helpers', () => {
        const dataStatsNode = { innerHTML: '' };
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
                getElementById: (id) => id === 'dataStats' ? dataStatsNode : null,
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const queryUi = createQueryUi({
            state: {
                searchLimits: {},
                selectors: {},
                variantLockControls: new Map(),
                listeners: {}
            }
        });

        queryUi.setDataStats(61, 28, 7, '58/61');

        assert.match(dataStatsNode.innerHTML, /Units/);
        assert.match(dataStatsNode.innerHTML, />61</);
        assert.match(dataStatsNode.innerHTML, /Traits/);
        assert.match(dataStatsNode.innerHTML, />28</);
        assert.match(dataStatsNode.innerHTML, /Roles/);
        assert.match(dataStatsNode.innerHTML, />7</);
        assert.match(dataStatsNode.innerHTML, /Splashes/);
        assert.match(dataStatsNode.innerHTML, />58\/61</);
    });

    it('calculates fetch and search button UI states through extracted helpers', () => {
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
                getElementById: () => null,
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const queryUi = createQueryUi({
            state: {
                searchLimits: {},
                selectors: {},
                variantLockControls: new Map(),
                listeners: {}
            }
        });

        const toPlainObject = (value) => JSON.parse(JSON.stringify(value));

        assert.deepEqual(toPlainObject(queryUi.__test.getFetchButtonUiState({
            isSearching: false,
            isFetchingData: false
        })), {
            disabled: false,
            opacity: '1'
        });
        assert.deepEqual(toPlainObject(queryUi.__test.getFetchButtonUiState({
            isSearching: true,
            isFetchingData: false
        })), {
            disabled: true,
            opacity: '0.5'
        });
        assert.deepEqual(toPlainObject(queryUi.__test.getSearchButtonUiState({
            isSearching: false,
            isFetchingData: true,
            hasActiveData: true
        })), {
            disabled: true,
            classDisabled: true,
            text: 'Loading data...'
        });
        assert.deepEqual(toPlainObject(queryUi.__test.getSearchButtonUiState({
            isSearching: true,
            isFetchingData: false,
            hasActiveData: true
        })), {
            disabled: true,
            classDisabled: true,
            text: null
        });
    });

    it('syncs the fetch button DOM state through the extracted applicator', () => {
        const fetchButton = {
            disabled: false,
            style: {
                opacity: ''
            }
        };
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
                getElementById: (id) => id === 'fetchBtn' ? fetchButton : null,
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const queryUi = createQueryUi({
            state: {
                isSearching: false,
                isFetchingData: true,
                searchLimits: {},
                selectors: {},
                variantLockControls: new Map(),
                listeners: {}
            }
        });

        queryUi.syncFetchButtonState();

        assert.equal(fetchButton.disabled, true);
        assert.equal(fetchButton.style.opacity, '0.5');
    });

    it('syncs the search button DOM state without clobbering active search text', () => {
        const searchButton = {
            disabled: false,
            innerText: 'Searching...',
            classList: createClassList()
        };
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
                getElementById: (id) => id === 'searchBtn' ? searchButton : null,
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const queryUi = createQueryUi({
            state: {
                activeData: { ready: true },
                isSearching: true,
                isFetchingData: false,
                searchLimits: {},
                selectors: {},
                variantLockControls: new Map(),
                listeners: {}
            }
        });

        queryUi.syncSearchButtonState();

        assert.equal(searchButton.disabled, true);
        assert.equal(searchButton.classList.contains('disabled'), true);
        assert.equal(searchButton.innerText, 'Searching...');
    });

    it('clamps maxResults inputs to the shared renderer limit', () => {
        const maxResultsInput = {
            value: '500000',
            addEventListener: () => {}
        };
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
                    if (id === 'maxResults') return maxResultsInput;
                    return null;
                },
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const queryUi = createQueryUi({
            state: {
                searchLimits: {
                    DEFAULT_MAX_RESULTS: 500,
                    MAX_RESULTS: 1000
                },
                selectors: {},
                variantLockControls: new Map(),
                listeners: {}
            }
        });

        const clamped = queryUi.clampNumericInput('maxResults', 1, 1000, 500);

        assert.equal(clamped, 1000);
        assert.equal(maxResultsInput.value, 1000);
    });

    it('applies derived default role filters without overwriting non-empty selectors unless forced', () => {
        const tankRoles = createSelector([]);
        const carryRoles = createSelector(['ExistingCarry']);
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
                getElementById: () => null,
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const queryUi = createQueryUi({
            state: {
                activeData: {
                    roles: ['Bruiser', 'Sentinel', 'Sniper', 'Sorcerer']
                },
                resolveDefaultTankRoles: () => ['Bruiser', 'Sentinel'],
                resolveDefaultCarryRoles: () => ['Sniper', 'Sorcerer'],
                searchLimits: {},
                selectors: {
                    tankRoles,
                    carryRoles
                },
                variantLockControls: new Map(),
                listeners: {}
            }
        });

        queryUi.applyDefaultRoleFilters(false);
        assert.deepEqual(tankRoles.getValues(), ['Bruiser', 'Sentinel']);
        assert.deepEqual(carryRoles.getValues(), ['ExistingCarry']);

        queryUi.applyDefaultRoleFilters(true);
        assert.deepEqual(carryRoles.getValues(), ['Sniper', 'Sorcerer']);
    });

    it('applies explicit role params and falls back to derived defaults when role params are absent', () => {
        const tankRoles = createSelector(['OldTank']);
        const carryRoles = createSelector(['OldCarry']);
        const mustInclude = createSelector(['OldUnit']);
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
                    if (id === 'boardSize') return { value: '9' };
                    if (id === 'maxResults') return { value: '50' };
                    if (id === 'onlyActiveToggle') return { checked: true };
                    if (id === 'tierRankToggle') return { checked: true };
                    if (id === 'includeUniqueToggle') return { checked: false };
                    return null;
                },
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const app = {
            state: {
                activeData: {
                    roles: ['Bruiser', 'Sentinel', 'Sniper', 'Sorcerer']
                },
                resolveDefaultTankRoles: () => ['Bruiser', 'Sentinel'],
                resolveDefaultCarryRoles: () => ['Sniper', 'Sorcerer'],
                searchLimits: {
                    DEFAULT_MAX_RESULTS: 500
                },
                selectors: {
                    mustInclude,
                    mustExclude: createSelector(),
                    mustIncludeTraits: createSelector(),
                    mustExcludeTraits: createSelector(),
                    extraEmblems: createSelector(),
                    tankRoles,
                    carryRoles
                },
                variantLockControls: new Map(),
                listeners: {}
            }
        };

        const queryUi = createQueryUi(app);
        queryUi.applySearchParams({
            boardSize: 10,
            maxResults: 123,
            mustInclude: ['Aurora'],
            tankRoles: ['Warden'],
            carryRoles: ['Invoker']
        });

        assert.deepEqual(mustInclude.getValues(), ['Aurora']);
        assert.deepEqual(tankRoles.getValues(), ['Warden']);
        assert.deepEqual(carryRoles.getValues(), ['Invoker']);

        queryUi.applySearchParams({
            boardSize: 8,
            maxResults: 75,
            mustInclude: ['Mordekaiser']
        });

        assert.deepEqual(mustInclude.getValues(), ['Mordekaiser']);
        assert.deepEqual(tankRoles.getValues(), ['Bruiser', 'Sentinel']);
        assert.deepEqual(carryRoles.getValues(), ['Sniper', 'Sorcerer']);
    });

    it('derives draft query signal counts and summary meta through extracted helpers', () => {
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
                getElementById: () => null,
                querySelector: () => null
            }
        };

        const createQueryUi = loadQueryUiFactory(sandbox);
        const queryUi = createQueryUi({
            state: {
                searchLimits: {},
                selectors: {},
                variantLockControls: new Map(),
                listeners: {}
            }
        });

        assert.equal(queryUi.__test.countDraftQuerySignals({
            mustInclude: ['A'],
            mustExclude: ['B'],
            mustIncludeTraits: ['Bruiser'],
            mustExcludeTraits: [],
            extraEmblems: ['Emblem'],
            variantLocks: { MissFortune: 'conduit' }
        }), 5);
        assert.equal(queryUi.__test.getDraftQueryMeta({
            mustInclude: [],
            mustExclude: [],
            mustIncludeTraits: [],
            mustExcludeTraits: [],
            extraEmblems: [],
            variantLocks: {}
        }), 'Idle');
        assert.equal(queryUi.__test.getDraftQueryMeta({
            mustInclude: ['A'],
            mustExclude: [],
            mustIncludeTraits: [],
            mustExcludeTraits: [],
            extraEmblems: [],
            variantLocks: { MissFortune: 'challenger' }
        }), '2 active constraints');
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
