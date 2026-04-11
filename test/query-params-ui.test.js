const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createSelector(initialValues = []) {
    let values = [...initialValues];
    return {
        getValues: () => [...values],
        setValues(nextValues) {
            values = [...nextValues];
        }
    };
}

function loadQueryParamsUiFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'query-params-ui.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/query-params-ui.js' });
    return sandbox.window.TFTRenderer.createQueryParamsUi;
}

describe('renderer query params ui', () => {
    it('reads current params and applies search params through selectors and controls', () => {
        const controls = {
            boardSize: { value: '9' },
            maxResults: { value: '25' },
            onlyActiveToggle: { checked: true },
            tierRankToggle: { checked: false },
            includeUniqueToggle: { checked: true }
        };
        const selectors = {
            mustInclude: createSelector(['A']),
            mustExclude: createSelector(['B']),
            mustIncludeTraits: createSelector(['Bruiser']),
            mustExcludeTraits: createSelector(['Sniper']),
            extraEmblems: createSelector(['Emblem']),
            tankRoles: createSelector([]),
            carryRoles: createSelector([])
        };
        const appliedControls = [];
        const appliedVariantLocks = [];
        const sandbox = {
            console,
            window: {
                TFTRenderer: {}
            }
        };

        const createQueryParamsUi = loadQueryParamsUiFactory(sandbox);
        const queryParamsUi = createQueryParamsUi({
            state: {
                activeData: {
                    roles: ['Bruiser', 'Tank', 'Carry']
                },
                selectors,
                resolveDefaultTankRoles: () => ['Tank'],
                resolveDefaultCarryRoles: () => ['Carry']
            }
        }, {
            queryControlState: {
                readQueryControlValues: (resolvedControls) => ({
                    boardSize: Number(resolvedControls.boardSize.value),
                    maxResults: Number(resolvedControls.maxResults.value),
                    onlyActive: !!resolvedControls.onlyActiveToggle.checked,
                    tierRank: !!resolvedControls.tierRankToggle.checked,
                    includeUnique: !!resolvedControls.includeUniqueToggle.checked
                }),
                getDefaultSearchParams: () => ({
                    boardSize: 9,
                    maxResults: 50,
                    mustInclude: [],
                    mustExclude: [],
                    mustIncludeTraits: [],
                    mustExcludeTraits: [],
                    extraEmblems: [],
                    variantLocks: {},
                    tankRoles: null,
                    carryRoles: null,
                    onlyActive: true,
                    tierRank: true,
                    includeUnique: false
                }),
                applyQueryControlValues: (resolvedControls, params) => {
                    resolvedControls.boardSize.value = String(params.boardSize);
                    resolvedControls.maxResults.value = String(params.maxResults);
                    resolvedControls.onlyActiveToggle.checked = !!params.onlyActive;
                    resolvedControls.tierRankToggle.checked = !!params.tierRank;
                    resolvedControls.includeUniqueToggle.checked = !!params.includeUnique;
                    appliedControls.push(params);
                },
                applyRoleSelectorSearchParams: (selector, values, defaultValues) => {
                    selector.setValues(Array.isArray(values) ? values : (defaultValues || []));
                },
                clampNumericInput: (input, min, max, fallback) => {
                    const parsed = Number.parseInt(input.value, 10);
                    const nextValue = Number.isFinite(parsed)
                        ? Math.min(Math.max(parsed, min), max)
                        : fallback;
                    input.value = String(nextValue);
                    return nextValue;
                }
            },
            queryShellUi: {
                resolveQueryControls: () => controls
            },
            variantLockUi: {
                getCurrentVariantLocks: () => ({ MissFortune: 'conduit' }),
                applyVariantLocks: (variantLocks) => appliedVariantLocks.push(variantLocks)
            }
        });

        const currentParams = JSON.parse(JSON.stringify(queryParamsUi.getCurrentSearchParams()));
        assert.deepEqual(currentParams, {
            boardSize: 9,
            maxResults: 25,
            onlyActive: true,
            tierRank: false,
            includeUnique: true,
            mustInclude: ['A'],
            mustExclude: ['B'],
            mustIncludeTraits: ['Bruiser'],
            mustExcludeTraits: ['Sniper'],
            extraEmblems: ['Emblem'],
            variantLocks: { MissFortune: 'conduit' },
            tankRoles: [],
            carryRoles: []
        });

        queryParamsUi.applySearchParams({
            boardSize: 10,
            mustInclude: ['Lux'],
            variantLocks: { Galio: 'two-slot' }
        });

        assert.deepEqual(JSON.parse(JSON.stringify(appliedControls)), [{
            boardSize: 10,
            maxResults: 50,
            mustInclude: ['Lux'],
            mustExclude: [],
            mustIncludeTraits: [],
            mustExcludeTraits: [],
            extraEmblems: [],
            variantLocks: { Galio: 'two-slot' },
            tankRoles: null,
            carryRoles: null,
            onlyActive: true,
            tierRank: true,
            includeUnique: false
        }]);
        assert.deepEqual(selectors.mustInclude.getValues(), ['Lux']);
        assert.deepEqual(selectors.tankRoles.getValues(), ['Tank']);
        assert.deepEqual(selectors.carryRoles.getValues(), ['Carry']);
        assert.deepEqual(JSON.parse(JSON.stringify(appliedVariantLocks)), [{ Galio: 'two-slot' }]);
    });

    it('applies default role filters conservatively and clamps numeric inputs', () => {
        const controls = {
            maxResults: { value: '5000' }
        };
        const tankRoles = createSelector(['ExistingTank']);
        const carryRoles = createSelector([]);
        const sandbox = {
            console,
            window: {
                TFTRenderer: {}
            }
        };

        const createQueryParamsUi = loadQueryParamsUiFactory(sandbox);
        const queryParamsUi = createQueryParamsUi({
            state: {
                activeData: {
                    roles: ['Tank', 'Carry']
                },
                selectors: {
                    mustInclude: createSelector([]),
                    mustExclude: createSelector([]),
                    mustIncludeTraits: createSelector([]),
                    mustExcludeTraits: createSelector([]),
                    extraEmblems: createSelector([]),
                    tankRoles,
                    carryRoles
                },
                resolveDefaultTankRoles: () => ['Tank'],
                resolveDefaultCarryRoles: () => ['Carry']
            }
        }, {
            queryControlState: {
                getDefaultSearchParams: () => ({}),
                readQueryControlValues: () => ({}),
                applyQueryControlValues: () => {},
                applyRoleSelectorSearchParams: () => {},
                clampNumericInput: (input, min, max, fallback) => {
                    const parsed = Number.parseInt(input.value, 10);
                    const nextValue = Number.isFinite(parsed)
                        ? Math.min(Math.max(parsed, min), max)
                        : fallback;
                    input.value = String(nextValue);
                    return nextValue;
                }
            },
            queryShellUi: {
                resolveQueryControls: () => controls
            },
            variantLockUi: {
                getCurrentVariantLocks: () => ({}),
                applyVariantLocks: () => {}
            }
        });

        queryParamsUi.applyDefaultRoleFilters();
        assert.deepEqual(tankRoles.getValues(), ['ExistingTank']);
        assert.deepEqual(carryRoles.getValues(), ['Carry']);

        queryParamsUi.applyDefaultRoleFilters(true);
        assert.deepEqual(tankRoles.getValues(), ['Tank']);

        assert.equal(queryParamsUi.clampNumericInput('maxResults', 1, 1000, 500), 1000);
        assert.equal(controls.maxResults.value, '1000');
    });
});
