const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    evaluateBoardSelection,
    createBoardResult
} = require('../engine/search-evaluator.js');

describe('search evaluator helpers', () => {
    it('creates board results with score metadata and variant assignments', () => {
        const board = createBoardResult({
            unitIds: ['A', 'B'],
            evaluation: {
                synergyScore: 3,
                occupiedSlots: 2,
                traitCounts: { Arcane: 2 },
                variantAssignments: {
                    A: { id: 'alt', label: 'Alt Mode' }
                }
            },
            totalCost: 7,
            scoreBoard: (score, cost) => score * 10000 + cost
        });

        assert.deepEqual(board, {
            units: ['A', 'B'],
            synergyScore: 3,
            occupiedSlots: 2,
            totalCost: 7,
            traitCounts: { Arcane: 2 },
            variantAssignments: {
                A: { id: 'alt', label: 'Alt Mode' }
            },
            _score: 30007
        });
    });

    it('evaluates variant selections and keeps the highest-scoring valid assignment', () => {
        const evaluation = evaluateBoardSelection({
            selectedUnitIndices: [0],
            selectedVariantIndices: [0],
            baseTraitCounts: Uint8Array.from([1, 0]),
            minOccupiedSlots: 1,
            boardSize: 2,
            unitInfo: [{
                id: 'Switcher',
                baseTraitContributionEntries: [{ index: 0, count: 1 }],
                conditionalProfileEntries: [],
                conditionalEffectEntries: [],
                variantProfiles: [
                    {
                        id: 'alpha',
                        label: 'Alpha Mode',
                        slotDelta: 1,
                        compiledConditions: null,
                        traitContributionEntries: [{ index: 1, count: 1 }],
                        fullTraitContributionEntries: [{ index: 1, count: 1 }],
                        conditionalProfileEntries: [],
                        conditionalEffectEntries: []
                    },
                    {
                        id: 'beta',
                        label: 'Beta Mode',
                        slotDelta: 1,
                        compiledConditions: null,
                        traitContributionEntries: [{ index: 1, count: 2 }],
                        fullTraitContributionEntries: [{ index: 1, count: 2 }],
                        conditionalProfileEntries: [],
                        conditionalEffectEntries: []
                    }
                ]
            }],
            activeUnitFlags: Uint8Array.from([1]),
            mustIncludeTraitIndices: [1],
            mustIncludeTraitTargets: [2],
            allTraitNames: ['Base', 'Arcane'],
            calculateSynergyScore: (counts) => counts[1],
            isCompiledConditionSatisfied: () => true,
            findFirstSatisfiedProfile: () => null,
            traitCountsToRecord: (counts, names) => Object.fromEntries(
                names.map((name, index) => [name, counts[index]]).filter(([, count]) => count > 0)
            )
        });

        assert.deepEqual(evaluation, {
            synergyScore: 2,
            occupiedSlots: 2,
            traitCounts: {
                Base: 1,
                Arcane: 2
            },
            variantAssignments: {
                Switcher: {
                    id: 'beta',
                    label: 'Beta Mode'
                }
            }
        });
    });
});
