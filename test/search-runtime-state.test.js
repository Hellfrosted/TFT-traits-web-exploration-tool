const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildAvailableIndices,
    buildUnitIndexById,
    buildMustIncludeTraitIndices,
    detectSearchFeatures,
    createProgressTracker
} = require('../engine/search-runtime-state.js');

describe('search runtime state helpers', () => {
    it('builds available indices, unit indexes, and must-include trait indices', () => {
        const validUnits = [{ id: 'Garen' }, { id: 'Lux' }, { id: 'Braum' }];
        const mustHaveMask = 0b010n;
        const unitIndexById = buildUnitIndexById(validUnits);

        assert.deepEqual(buildAvailableIndices(validUnits, mustHaveMask), [0, 2]);
        assert.equal(unitIndexById.Garen, 0);
        assert.equal(unitIndexById.Lux, 1);
        assert.equal(unitIndexById.Braum, 2);
        assert.deepEqual(
            buildMustIncludeTraitIndices(['Mage', 'Missing', 'Guardian'], {
                Guardian: 2,
                Mage: 1
            }),
            [1, 2]
        );
    });

    it('detects variant and conditional search features from unit info', () => {
        const featureState = detectSearchFeatures([
            {
                variantProfiles: [],
                conditionalProfileEntries: [],
                conditionalEffectEntries: []
            },
            {
                variantProfiles: [{
                    conditionalProfileEntries: [],
                    conditionalEffectEntries: [{ trait: 'Arcane' }]
                }],
                conditionalProfileEntries: [{ addTraits: ['Shadow'] }],
                conditionalEffectEntries: []
            }
        ]);

        assert.deepEqual(featureState, {
            hasVariantUnits: true,
            hasConditionalProfiles: true,
            hasConditionalEffects: true
        });
    });

    it('reports bounded progress and completion through the tracker', () => {
        const progressEvents = [];
        const tracker = createProgressTracker({
            onProgress: (pct, checked, total) => {
                progressEvents.push({ pct, checked, total });
            },
            totalCombinations: 10,
            shouldEmitProgress: (checked) => checked === 2
        });

        tracker.markChecked();
        tracker.markChecked();
        tracker.complete();

        assert.deepEqual(progressEvents, [
            { pct: 20, checked: 2, total: 10 },
            { pct: 100, checked: 10, total: 10 }
        ]);
    });

    it('reports indeterminate progress when the total combination count is unavailable', () => {
        const progressEvents = [];
        const tracker = createProgressTracker({
            onProgress: (pct, checked, total) => {
                progressEvents.push({ pct, checked, total });
            },
            totalCombinations: Number.NaN,
            shouldEmitProgress: () => true
        });

        tracker.markChecked();
        tracker.complete();

        assert.deepEqual(progressEvents, [
            { pct: null, checked: 1, total: Number.NaN },
            { pct: 100, checked: 1, total: Number.NaN }
        ]);
    });
});
