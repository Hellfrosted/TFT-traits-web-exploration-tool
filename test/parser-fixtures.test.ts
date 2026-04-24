const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const DataEngine = require('../data.js');
const {
    createTraitRecord,
    createRoleRecord,
    createChampionRecord,
    createSetCdragon
} = require('./fixtures/parser-fixtures.js');

describe('parser fixtures', () => {
    it('builds a set-scoped parser scenario from reusable fixtures', () => {
        const rawJSON = {
            ...createTraitRecord('{TraitChallenger}', 'TFT17_ASTrait'),
            ...createRoleRecord('{RoleCarry}', 'Carry'),
            ...createChampionRecord({
                rawName: 'TFT17_KaiSa',
                roleId: '{RoleCarry}',
                traitIds: ['{TraitChallenger}']
            })
        };

        const cdragonJSON = createSetCdragon({
            setNumber: '17',
            champions: [
                {
                    apiName: 'TFT17_Kaisa',
                    characterName: 'TFT17_Kaisa',
                    name: "Kai'Sa",
                    squareIcon: 'ASSETS/Characters/TFT17_Kaisa/Skins/Base/Images/TFT17_Kaisa_splash_tile_69.TFT_Set17.tex',
                    traits: ['Challenger']
                }
            ],
            traits: [
                {
                    apiName: 'TFT17_ASTrait',
                    name: 'Challenger',
                    effects: [{ minUnits: 2 }, { minUnits: 4 }]
                }
            ]
        });

        const parsed = DataEngine.parseData(rawJSON, cdragonJSON);

        assert.equal(parsed.setNumber, '17');
        assert.deepEqual(parsed.units.map((unit) => unit.id), ['KaiSa']);
        assert.deepEqual(parsed.units[0].traits, ['Challenger']);
        assert.deepEqual(parsed.roles, ['Carry']);
        assert.deepEqual(parsed.traitBreakpoints.Challenger, [2, 4]);
    });
});
