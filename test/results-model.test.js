const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadResultsModelFactory() {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'results-model.js'),
        'utf8'
    );
    const sandbox = {
        console,
        window: {
            TFTRenderer: {}
        },
        document: {
            getElementById: () => ({ value: 'mostTraits' })
        }
    };

    vm.runInNewContext(source, sandbox, { filename: 'renderer/results-model.js' });
    sandbox.window.TFTRenderer.shared = {
        renderIconImage: () => '',
        getBoardMetric: (board) => board.synergyScore ?? board.traitsCount ?? 0
    };
    return sandbox.window.TFTRenderer.createResultsModel;
}

describe('results model variant accounting', () => {
    it('uses the selected variant contribution map without double-counting the base unit', () => {
        const createResultsModel = loadResultsModelFactory();
        const model = createResultsModel({
            state: {
                activeData: {
                    unitMap: new Map([
                        ['Switcher', {
                            id: 'Switcher',
                            displayName: 'Switcher',
                            traitContributions: { GunGoddess: 1 },
                            variants: [
                                {
                                    id: 'conduit',
                                    label: 'Conduit',
                                    traitContributions: {
                                        GunGoddess: 1,
                                        Conduit: 1
                                    }
                                }
                            ]
                        }]
                    ]),
                    traitBreakpoints: {
                        GunGoddess: [1],
                        Conduit: [2]
                    },
                    traitIcons: {},
                    hashMap: {}
                },
                lastSearchParams: {
                    includeUnique: true,
                    extraEmblems: []
                }
            }
        });

        const summary = model.buildBoardTraitSummary({
            units: ['Switcher'],
            variantAssignments: {
                Switcher: {
                    id: 'conduit',
                    label: 'Conduit'
                }
            }
        }, {
            includeUnique: true,
            showInactive: true
        });

        const gunGoddess = summary.find((trait) => trait.trait === 'GunGoddess');
        const conduit = summary.find((trait) => trait.trait === 'Conduit');

        assert.equal(gunGoddess.count, 1);
        assert.equal(conduit.count, 1);
        assert.equal(conduit.contributors.length, 1);
        assert.equal(conduit.contributors[0].label, 'Switcher (Conduit)');
    });
});
