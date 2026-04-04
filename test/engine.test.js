const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../engine.js');

// --- Fixture Data ---
// Minimal mock data that mirrors the shape of real parsed data.
const mockTraits = ['Warrior', 'Mage', 'Guardian', 'Assassin', 'Sorcerer'];
const mockBreakpoints = {
    Warrior: [2, 4, 6],
    Mage: [2, 4],
    Guardian: [2, 4],
    Assassin: [2, 4],
    Sorcerer: [1] // Unique trait (1-unit)
};

const mockUnits = [
    { id: 'Garen',   cost: 1, role: 'Tank',  traits: ['Warrior', 'Guardian'], traitIds: ['Warrior', 'Guardian'] },
    { id: 'Darius',  cost: 2, role: 'Tank',  traits: ['Warrior'],            traitIds: ['Warrior'] },
    { id: 'Lux',     cost: 3, role: 'Carry', traits: ['Mage', 'Sorcerer'],   traitIds: ['Mage', 'Sorcerer'] },
    { id: 'Ahri',    cost: 4, role: 'Carry', traits: ['Mage'],               traitIds: ['Mage'] },
    { id: 'Zed',     cost: 3, role: 'Carry', traits: ['Assassin'],           traitIds: ['Assassin'] },
    { id: 'Talon',   cost: 2, role: 'Carry', traits: ['Assassin'],           traitIds: ['Assassin'] },
    { id: 'Braum',   cost: 3, role: 'Tank',  traits: ['Guardian'],           traitIds: ['Guardian'] },
    { id: 'Malph',   cost: 1, role: 'Tank',  traits: ['Guardian'],           traitIds: ['Guardian'] },
];

// hashMap maps traitIds to themselves (in real data these are hash strings -> names)
const mockHashMap = {};
mockTraits.forEach(t => mockHashMap[t] = t);
mockUnits.forEach(u => mockHashMap[u.id] = u.id);

const mockDataCache = {
    units: mockUnits,
    traits: mockTraits,
    roles: ['Tank', 'Carry'],
    traitBreakpoints: mockBreakpoints,
    hashMap: mockHashMap
};

const roleThresholdDataCache = {
    units: [
        { id: 'MidTankA', cost: 3, role: 'Tank', traits: ['Bulwark'], traitIds: ['Bulwark'] },
        { id: 'MidTankB', cost: 3, role: 'Tank', traits: ['Bulwark'], traitIds: ['Bulwark'] },
        { id: 'EliteTank', cost: 4, role: 'Tank', traits: ['Bulwark'], traitIds: ['Bulwark'] },
        { id: 'CheapTank', cost: 2, role: 'Tank', traits: ['Bulwark'], traitIds: ['Bulwark'] },
        { id: 'EliteCarry', cost: 4, role: 'Carry', traits: ['Volley'], traitIds: ['Volley'] },
        { id: 'CheapCarry', cost: 3, role: 'Carry', traits: ['Volley'], traitIds: ['Volley'] },
        { id: 'Flex', cost: 2, role: 'Support', traits: ['Flex'], traitIds: ['Flex'] }
    ],
    traits: ['Bulwark', 'Flex', 'Volley'],
    roles: ['Tank', 'Carry', 'Support'],
    traitBreakpoints: {
        Bulwark: [1],
        Flex: [1],
        Volley: [1]
    },
    hashMap: {
        Bulwark: 'Bulwark',
        Flex: 'Flex',
        Volley: 'Volley'
    }
};

const aliasedTraitDataCache = {
    units: [
        {
            id: 'Frontliner',
            cost: 1,
            role: 'Tank',
            traits: ['Alpha'],
            traitIds: ['{alpha-api}']
        },
        {
            id: 'Backliner',
            cost: 2,
            role: 'Carry',
            traits: ['Alpha', 'Solo'],
            traitIds: ['{alpha-api}', '{solo-api}']
        }
    ],
    traits: ['Alpha', 'Solo'],
    roles: ['Tank', 'Carry'],
    traitBreakpoints: {
        Alpha: [2],
        Solo: [1]
    },
    hashMap: {
        '{alpha-api}': 'ApiAlpha',
        '{solo-api}': 'ApiSolo'
    }
};

const weightedTraitDataCache = {
    units: [
        {
            id: 'Amplifier',
            cost: 1,
            role: 'Tank',
            traits: ['Mage'],
            traitIds: ['Mage'],
            traitContributions: { Mage: 2 }
        },
        {
            id: 'Caster',
            cost: 2,
            role: 'Carry',
            traits: ['Mage'],
            traitIds: ['Mage']
        }
    ],
    traits: ['Mage'],
    roles: ['Tank', 'Carry'],
    traitBreakpoints: {
        Mage: [3]
    },
    hashMap: {
        Mage: 'Mage'
    }
};

const variantTraitDataCache = {
    units: [
        {
            id: 'MissFortune',
            cost: 3,
            role: 'Carry',
            traits: ['Gun Goddess'],
            traitIds: ['Gun Goddess'],
            traitContributions: { 'Gun Goddess': 1 },
            variants: [
                {
                    id: 'conduit',
                    label: 'Conduit Mode',
                    role: 'Carry',
                    traits: ['Gun Goddess', 'Conduit'],
                    traitContributions: {
                        'Gun Goddess': 1,
                        Conduit: 1
                    }
                },
                {
                    id: 'challenger',
                    label: 'Challenger Mode',
                    role: 'Carry',
                    traits: ['Gun Goddess', 'Challenger'],
                    traitContributions: {
                        'Gun Goddess': 1,
                        Challenger: 1
                    }
                }
            ]
        },
        {
            id: 'Lux',
            cost: 2,
            role: 'Carry',
            traits: ['Conduit'],
            traitIds: ['Conduit']
        },
        {
            id: 'Braum',
            cost: 2,
            role: 'Tank',
            traits: ['Guardian'],
            traitIds: ['Guardian']
        }
    ],
    traits: ['Challenger', 'Conduit', 'Guardian', 'Gun Goddess'],
    roles: ['Tank', 'Carry'],
    traitBreakpoints: {
        Challenger: [2],
        Conduit: [2],
        Guardian: [1],
        'Gun Goddess': [1]
    },
    hashMap: {
        Challenger: 'Challenger',
        Conduit: 'Conduit',
        Guardian: 'Guardian',
        'Gun Goddess': 'Gun Goddess'
    }
};

const mechaSlotDataCache = {
    units: [
        {
            id: 'Galio',
            cost: 4,
            role: 'Tank',
            traits: ['Mecha', 'Voyager'],
            traitIds: ['Mecha', 'Voyager'],
            variants: [
                {
                    id: 'standard',
                    label: 'Standard',
                    role: 'Tank',
                    slotCost: 1,
                    traits: ['Mecha', 'Voyager'],
                    traitContributions: {
                        Mecha: 1,
                        Voyager: 1
                    }
                },
                {
                    id: 'two-slot',
                    label: '2-Slot Mecha',
                    role: 'Tank',
                    slotCost: 2,
                    traits: ['Mecha', 'Voyager'],
                    traitContributions: {
                        Mecha: 2,
                        Voyager: 1
                    }
                }
            ]
        },
        {
            id: 'AurelionSol',
            cost: 4,
            role: 'Carry',
            traits: ['Mecha', 'Conduit'],
            traitIds: ['Mecha', 'Conduit'],
            variants: [
                {
                    id: 'standard',
                    label: 'Standard',
                    role: 'Carry',
                    slotCost: 1,
                    traits: ['Mecha', 'Conduit'],
                    traitContributions: {
                        Mecha: 1,
                        Conduit: 1
                    }
                },
                {
                    id: 'two-slot',
                    label: '2-Slot Mecha',
                    role: 'Carry',
                    slotCost: 2,
                    traits: ['Mecha', 'Conduit'],
                    traitContributions: {
                        Mecha: 2,
                        Conduit: 1
                    }
                }
            ]
        },
        {
            id: 'Urgot',
            cost: 3,
            role: 'Carry',
            traits: ['Mecha', 'Brawler'],
            traitIds: ['Mecha', 'Brawler'],
            variants: [
                {
                    id: 'standard',
                    label: 'Standard',
                    role: 'Carry',
                    slotCost: 1,
                    traits: ['Mecha', 'Brawler'],
                    traitContributions: {
                        Mecha: 1,
                        Brawler: 1
                    }
                },
                {
                    id: 'two-slot',
                    label: '2-Slot Mecha',
                    role: 'Carry',
                    slotCost: 2,
                    traits: ['Mecha', 'Brawler'],
                    traitContributions: {
                        Mecha: 2,
                        Brawler: 1
                    }
                }
            ]
        },
        { id: 'VoyagerTwo', cost: 2, role: 'Tank', traits: ['Voyager'], traitIds: ['Voyager'] },
        { id: 'VoyagerThree', cost: 2, role: 'Tank', traits: ['Voyager'], traitIds: ['Voyager'] },
        { id: 'ConduitTwo', cost: 2, role: 'Carry', traits: ['Conduit'], traitIds: ['Conduit'] },
        { id: 'ConduitThree', cost: 2, role: 'Carry', traits: ['Conduit'], traitIds: ['Conduit'] },
        { id: 'BrawlerTwo', cost: 2, role: 'Tank', traits: ['Brawler'], traitIds: ['Brawler'] }
    ],
    traits: ['Brawler', 'Conduit', 'Mecha', 'Voyager'],
    roles: ['Tank', 'Carry'],
    traitBreakpoints: {
        Brawler: [2],
        Conduit: [2],
        Mecha: [2, 4],
        Voyager: [2]
    },
    hashMap: {
        Brawler: 'Brawler',
        Conduit: 'Conduit',
        Mecha: 'Mecha',
        Voyager: 'Voyager'
    }
};

const conditionalVariantDataCache = {
    units: [
        {
            id: 'Switcher',
            cost: 2,
            role: 'Carry',
            traits: ['Core'],
            traitIds: ['Core'],
            traitContributions: { Core: 1 },
            variants: [
                {
                    id: 'arcane',
                    label: 'Arcane Mode',
                    role: 'Carry',
                    traits: ['Core', 'Arcane'],
                    traitContributions: {
                        Core: 1,
                        Arcane: 1
                    },
                    conditions: {
                        requiredActiveTraits: ['Guardian']
                    }
                },
                {
                    id: 'shadow',
                    label: 'Shadow Mode',
                    role: 'Carry',
                    traits: ['Core', 'Shadow'],
                    traitContributions: {
                        Core: 1,
                        Shadow: 1
                    }
                }
            ]
        },
        {
            id: 'Warden',
            cost: 1,
            role: 'Tank',
            traits: ['Guardian'],
            traitIds: ['Guardian']
        },
        {
            id: 'Mage',
            cost: 1,
            role: 'Carry',
            traits: ['Arcane'],
            traitIds: ['Arcane']
        }
    ],
    traits: ['Arcane', 'Core', 'Guardian', 'Shadow'],
    roles: ['Tank', 'Carry'],
    traitBreakpoints: {
        Arcane: [2],
        Core: [1],
        Guardian: [1],
        Shadow: [1]
    },
    hashMap: {
        Arcane: 'Arcane',
        Core: 'Core',
        Guardian: 'Guardian',
        Shadow: 'Shadow'
    }
};

const conditionalEffectDataCache = {
    units: [
        {
            id: 'Catalyst',
            cost: 2,
            role: 'Carry',
            traits: ['Core'],
            traitIds: ['Core'],
            conditionalEffects: [
                {
                    conditions: {
                        requiredActiveTraits: ['Guardian']
                    },
                    traitContributions: {
                        Arcane: 1
                    }
                }
            ]
        },
        {
            id: 'Warden',
            cost: 1,
            role: 'Tank',
            traits: ['Guardian'],
            traitIds: ['Guardian']
        },
        {
            id: 'Mage',
            cost: 1,
            role: 'Carry',
            traits: ['Arcane'],
            traitIds: ['Arcane']
        },
        {
            id: 'Scout',
            cost: 1,
            role: 'Carry',
            traits: ['Tempo'],
            traitIds: ['Tempo']
        }
    ],
    traits: ['Arcane', 'Core', 'Guardian', 'Tempo'],
    roles: ['Tank', 'Carry'],
    traitBreakpoints: {
        Arcane: [2],
        Core: [1],
        Guardian: [1],
        Tempo: [1]
    },
    hashMap: {
        Arcane: 'Arcane',
        Core: 'Core',
        Guardian: 'Guardian',
        Tempo: 'Tempo'
    }
};

const conditionalEffectVariantDataCache = {
    units: [
        {
            id: 'Switcher',
            cost: 2,
            role: 'Carry',
            traits: ['Core'],
            traitIds: ['Core'],
            variants: [
                {
                    id: 'arcane',
                    label: 'Arcane Mode',
                    role: 'Carry',
                    traits: ['Core', 'Arcane'],
                    traitContributions: {
                        Core: 1,
                        Arcane: 1
                    },
                    conditionalEffects: [
                        {
                            conditions: {
                                requiredActiveTraits: ['Guardian']
                            },
                            traitContributions: {
                                Arcane: 1
                            }
                        }
                    ]
                },
                {
                    id: 'shadow',
                    label: 'Shadow Mode',
                    role: 'Carry',
                    traits: ['Core', 'Shadow'],
                    traitContributions: {
                        Core: 1,
                        Shadow: 1
                    }
                }
            ]
        },
        {
            id: 'Warden',
            cost: 1,
            role: 'Tank',
            traits: ['Guardian'],
            traitIds: ['Guardian']
        },
        {
            id: 'Mage',
            cost: 1,
            role: 'Carry',
            traits: ['Arcane'],
            traitIds: ['Arcane']
        }
    ],
    traits: ['Arcane', 'Core', 'Guardian', 'Shadow'],
    roles: ['Tank', 'Carry'],
    traitBreakpoints: {
        Arcane: [3],
        Core: [1],
        Guardian: [1],
        Shadow: [1]
    },
    hashMap: {
        Arcane: 'Arcane',
        Core: 'Core',
        Guardian: 'Guardian',
        Shadow: 'Shadow'
    }
};

const singlePassConditionalDataCache = {
    units: [
        {
            id: 'Looper',
            cost: 2,
            role: 'Carry',
            traits: ['Core'],
            traitIds: ['Core'],
            conditionalEffects: [
                {
                    conditions: {
                        requiredActiveTraits: ['Arcane']
                    },
                    traitContributions: {
                        Shadow: 1
                    }
                },
                {
                    conditions: {
                        requiredActiveTraits: ['Shadow']
                    },
                    traitContributions: {
                        Arcane: 1
                    }
                }
            ]
        },
        {
            id: 'Mage',
            cost: 1,
            role: 'Carry',
            traits: ['Arcane'],
            traitIds: ['Arcane']
        },
        {
            id: 'Warden',
            cost: 1,
            role: 'Tank',
            traits: ['Guardian'],
            traitIds: ['Guardian']
        }
    ],
    traits: ['Arcane', 'Core', 'Guardian', 'Shadow'],
    roles: ['Tank', 'Carry'],
    traitBreakpoints: {
        Arcane: [1],
        Core: [1],
        Guardian: [1],
        Shadow: [1]
    },
    hashMap: {
        Arcane: 'Arcane',
        Core: 'Core',
        Guardian: 'Guardian',
        Shadow: 'Shadow'
    }
};

const conditionalProfileDataCache = {
    units: [
        {
            id: 'Shifter',
            cost: 2,
            role: 'Carry',
            traits: ['Core', 'Shadow'],
            traitIds: ['Core', 'Shadow'],
            conditionalProfiles: [
                {
                    conditions: {
                        requiredActiveTraits: ['Guardian']
                    },
                    addTraits: ['Arcane'],
                    removeTraits: ['Shadow'],
                    traitContributions: {
                        Core: 1,
                        Arcane: 1
                    }
                },
                {
                    conditions: {
                        requiredUnits: ['Warden']
                    },
                    addTraits: ['Spirit'],
                    removeTraits: ['Shadow'],
                    traitContributions: {
                        Core: 1,
                        Spirit: 1
                    }
                }
            ]
        },
        {
            id: 'Warden',
            cost: 1,
            role: 'Tank',
            traits: ['Guardian'],
            traitIds: ['Guardian']
        },
        {
            id: 'Mage',
            cost: 1,
            role: 'Carry',
            traits: ['Arcane'],
            traitIds: ['Arcane']
        }
    ],
    traits: ['Arcane', 'Core', 'Guardian', 'Shadow', 'Spirit'],
    roles: ['Tank', 'Carry'],
    traitBreakpoints: {
        Arcane: [2],
        Core: [1],
        Guardian: [1],
        Shadow: [1],
        Spirit: [1]
    },
    hashMap: {
        Arcane: 'Arcane',
        Core: 'Core',
        Guardian: 'Guardian',
        Shadow: 'Shadow',
        Spirit: 'Spirit'
    }
};

const conditionalProfileVariantDataCache = {
    units: [
        {
            id: 'ProfileSwitcher',
            cost: 2,
            role: 'Carry',
            traits: ['Core'],
            traitIds: ['Core'],
            variants: [
                {
                    id: 'adaptive',
                    label: 'Adaptive Mode',
                    role: 'Carry',
                    traits: ['Core', 'Shadow'],
                    traitContributions: {
                        Core: 1,
                        Shadow: 1
                    },
                    conditionalProfiles: [
                        {
                            conditions: {
                                requiredActiveTraits: ['Guardian']
                            },
                            addTraits: ['Arcane'],
                            removeTraits: ['Shadow'],
                            traitContributions: {
                                Core: 1,
                                Arcane: 1
                            }
                        }
                    ]
                },
                {
                    id: 'shadow',
                    label: 'Shadow Mode',
                    role: 'Carry',
                    traits: ['Core', 'Shadow'],
                    traitContributions: {
                        Core: 1,
                        Shadow: 1
                    }
                }
            ]
        },
        {
            id: 'Warden',
            cost: 1,
            role: 'Tank',
            traits: ['Guardian'],
            traitIds: ['Guardian']
        },
        {
            id: 'Mage',
            cost: 1,
            role: 'Carry',
            traits: ['Arcane'],
            traitIds: ['Arcane']
        }
    ],
    traits: ['Arcane', 'Core', 'Guardian', 'Shadow'],
    roles: ['Tank', 'Carry'],
    traitBreakpoints: {
        Arcane: [2],
        Core: [1],
        Guardian: [1],
        Shadow: [1]
    },
    hashMap: {
        Arcane: 'Arcane',
        Core: 'Core',
        Guardian: 'Guardian',
        Shadow: 'Shadow'
    }
};

// --- Tests ---

describe('Engine.popcount', () => {
    it('returns 0 for 0n', () => {
        assert.equal(Engine.popcount(0n), 0);
    });

    it('counts single bit', () => {
        assert.equal(Engine.popcount(1n), 1);
        assert.equal(Engine.popcount(4n), 1);
    });

    it('counts multiple bits', () => {
        assert.equal(Engine.popcount(7n), 3);   // 0b111
        assert.equal(Engine.popcount(15n), 4);  // 0b1111
        assert.equal(Engine.popcount(255n), 8); // 0b11111111
    });

    it('handles large BigInts', () => {
        // 2^64 - 1 = all 64 bits set
        assert.equal(Engine.popcount((1n << 64n) - 1n), 64);
    });
});

describe('Engine.popcountInt', () => {
    it('returns 0 for 0', () => {
        assert.equal(Engine.popcountInt(0), 0);
    });

    it('counts bits correctly', () => {
        assert.equal(Engine.popcountInt(7), 3);
        assert.equal(Engine.popcountInt(255), 8);
    });
});

describe('Engine.combinations', () => {
    it('C(n, 0) = 1', () => {
        assert.equal(Engine.combinations(10, 0), 1);
    });

    it('C(n, n) = 1', () => {
        assert.equal(Engine.combinations(5, 5), 1);
    });

    it('C(n, 1) = n', () => {
        assert.equal(Engine.combinations(10, 1), 10);
    });

    it('returns 0 when k > n', () => {
        assert.equal(Engine.combinations(3, 5), 0);
    });

    it('calculates known values correctly', () => {
        assert.equal(Engine.combinations(5, 2), 10);
        assert.equal(Engine.combinations(10, 3), 120);
        assert.equal(Engine.combinations(52, 5), 2598960); // Poker hand
    });
});

describe('Engine.getCombinationCount', () => {
    it('returns correct count for simple case', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 3,
            mustInclude: [],
            mustExclude: [],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 56);
        assert.equal(result.remainingSlots, 3);
    });

    it('reduces search space with must-include', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 3,
            mustInclude: ['Garen', 'Lux'],
            mustExclude: [],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 6);
        assert.equal(result.remainingSlots, 1);
    });

    it('reduces pool with must-exclude', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 3,
            mustInclude: [],
            mustExclude: ['Garen', 'Darius'],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 20);
        assert.equal(result.remainingSlots, 3);
    });

    it('returns zero combinations when must-include unit is missing after filtering', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 3,
            mustInclude: ['Zed'],
            mustExclude: ['Zed'],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 0);
    });

    it('returns zero combinations when board size is smaller than locked units', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 1,
            mustInclude: ['Garen', 'Lux'],
            mustExclude: [],
            mustExcludeTraits: []
        });
        assert.equal(result.count, 0);
        assert.equal(result.remainingSlots, -1);
    });

    it('filters units by excluded traits', () => {
        const result = Engine.getCombinationCount(mockDataCache, {
            boardSize: 3,
            mustInclude: [],
            mustExclude: [],
            mustExcludeTraits: ['Assassin']
        });
        assert.equal(result.count, 20);
        assert.equal(result.remainingSlots, 3);
    });

    it('returns an indeterminate count for slot-varying variant searches', () => {
        const result = Engine.getCombinationCount(mechaSlotDataCache, {
            boardSize: 9,
            mustInclude: [],
            mustExclude: [],
            mustExcludeTraits: []
        });
        assert.equal(result.count, null);
        assert.equal(result.remainingSlots, 9);
    });

    it('leaves units in the pool unless explicitly excluded', () => {
        const validUnits = Engine.getValidUnits(mockDataCache, [], []);
        assert.equal(validUnits.length, 8);
        assert.ok(validUnits.some((unit) => unit.id === 'Zed'));
    });

    it('applies explicit unit exclusions only when requested', () => {
        const validUnits = Engine.getValidUnits(mockDataCache, ['Zed'], []);
        assert.equal(validUnits.length, 7);
        assert.ok(!validUnits.some((unit) => unit.id === 'Zed'));
    });

    it('treats conditional-effect traits as excluded traits during unit filtering', () => {
        const validUnits = Engine.getValidUnits(conditionalEffectDataCache, [], ['Arcane']);
        assert.ok(!validUnits.some((unit) => unit.id === 'Catalyst'));
    });

    it('treats conditional-profile traits as excluded traits during unit filtering', () => {
        const validUnits = Engine.getValidUnits(conditionalProfileDataCache, [], ['Arcane']);
        assert.ok(!validUnits.some((unit) => unit.id === 'Shifter'));
    });
});

describe('Engine.search', () => {
    const baseParams = {
        boardSize: 3,
        mustInclude: [],
        mustExclude: [],
        mustIncludeTraits: [],
        mustExcludeTraits: [],
        tankRoles: [],
        carryRoles: [],
        extraEmblems: [],
        onlyActive: false,
        tierRank: false,
        includeUnique: true,
        maxResults: 10
    };

    it('returns results array', () => {
        const results = Engine.search(mockDataCache, baseParams);
        assert.ok(Array.isArray(results));
    });

    it('all results have required fields', () => {
        const results = Engine.search(mockDataCache, baseParams);
        for (const r of results) {
            if (r.error) continue;
            assert.ok(Array.isArray(r.units), 'units should be an array');
            assert.ok(typeof r.synergyScore === 'number', 'synergyScore should be a number');
            assert.ok(typeof r.totalCost === 'number', 'totalCost should be a number');
            assert.equal(r.units.length, baseParams.boardSize, 'board should have correct unit count');
        }
    });

    it('respects must-include constraint', () => {
        const params = { ...baseParams, mustInclude: ['Garen'] };
        const results = Engine.search(mockDataCache, params);
        for (const r of results) {
            if (r.error) continue;
            assert.ok(r.units.includes('Garen'), 'every result should include Garen');
        }
    });

    it('respects must-exclude constraint', () => {
        const params = { ...baseParams, mustExclude: ['Zed'] };
        const results = Engine.search(mockDataCache, params);
        for (const r of results) {
            if (r.error) continue;
            assert.ok(!r.units.includes('Zed'), 'no result should include Zed');
        }
    });

    it('keeps Zed available when no explicit exclusion is set', () => {
        const results = Engine.search(mockDataCache, baseParams);
        assert.ok(results.some((result) => !result.error && result.units.includes('Zed')));
    });

    it('respects explicitly required units', () => {
        const params = { ...baseParams, mustInclude: ['Zed'] };
        const results = Engine.search(mockDataCache, params);
        assert.ok(results.length > 0);
        for (const r of results) {
            if (r.error) continue;
            assert.ok(r.units.includes('Zed'), 'required unit should appear in every result');
        }
    });

    it('requires either two 3-cost tanks or one 4-cost tank, plus one 4-cost carry', () => {
        const results = Engine.search(roleThresholdDataCache, {
            ...baseParams,
            tankRoles: ['Tank'],
            carryRoles: ['Carry']
        });

        assert.ok(results.length > 0);
        results.forEach((result) => {
            const units = result.units.map((unitId) =>
                roleThresholdDataCache.units.find((unit) => unit.id === unitId)
            );
            const tanks = units.filter((unit) => unit.role === 'Tank');
            const carries = units.filter((unit) => unit.role === 'Carry');
            const tankThreePlusCount = tanks.filter((unit) => unit.cost >= 3).length;
            const tankFourPlusCount = tanks.filter((unit) => unit.cost >= 4).length;
            const carryFourPlusCount = carries.filter((unit) => unit.cost >= 4).length;

            assert.ok(tankFourPlusCount >= 1 || tankThreePlusCount >= 2);
            assert.ok(carryFourPlusCount >= 1);
        });
    });

    it('treats an empty tank role list as no tank-role requirement', () => {
        const params = {
            ...baseParams,
            tankRoles: [],
            carryRoles: ['Carry'],
            boardSize: 2,
            mustInclude: ['CheapCarry', 'EliteCarry']
        };
        const results = Engine.search(roleThresholdDataCache, params);
        assert.ok(results.length > 0);
        results.forEach((result) => {
            assert.ok(result.units.includes('CheapCarry'));
            assert.ok(result.units.includes('EliteCarry'));
        });
    });

    it('treats an empty carry role list as no carry-role requirement', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            tankRoles: ['Tank'],
            carryRoles: [],
            mustInclude: ['MidTankA', 'MidTankB']
        };
        const results = Engine.search(roleThresholdDataCache, params);
        assert.ok(results.length > 0);
        results.forEach((result) => {
            assert.ok(result.units.includes('MidTankA'));
            assert.ok(result.units.includes('MidTankB'));
        });
    });

    it('rejects boards that have role matches but miss the new cost thresholds', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            tankRoles: ['Tank'],
            carryRoles: ['Carry'],
            mustInclude: ['CheapTank', 'CheapCarry', 'Flex']
        };
        const results = Engine.search(roleThresholdDataCache, params);
        assert.deepEqual(results, []);
    });

    it('allows one 4-cost tank to satisfy the tank requirement', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            tankRoles: ['Tank'],
            carryRoles: ['Carry'],
            mustInclude: ['EliteTank', 'EliteCarry']
        };
        const results = Engine.search(roleThresholdDataCache, params);
        assert.equal(results.length, 1);
        assert.deepEqual(results[0].units, ['EliteCarry', 'EliteTank']);
    });

    it('prefers higher-cost boards when synergy scores tie', () => {
        const expensiveTieDataCache = {
            units: [
                { id: 'FrontlineCheap', cost: 1, role: 'Tank', traits: ['Alpha'], traitIds: ['Alpha'] },
                { id: 'FrontlineExpensive', cost: 5, role: 'Tank', traits: ['Alpha'], traitIds: ['Alpha'] },
                { id: 'BacklineCheap', cost: 1, role: 'Carry', traits: ['Beta'], traitIds: ['Beta'] },
                { id: 'BacklineExpensive', cost: 5, role: 'Carry', traits: ['Beta'], traitIds: ['Beta'] }
            ],
            traits: ['Alpha', 'Beta'],
            roles: ['Tank', 'Carry'],
            traitBreakpoints: {
                Alpha: [1],
                Beta: [1]
            },
            hashMap: {
                Alpha: 'Alpha',
                Beta: 'Beta'
            }
        };

        const params = {
            ...baseParams,
            boardSize: 2,
            mustInclude: [],
            mustExclude: [],
            mustIncludeTraits: [],
            mustExcludeTraits: [],
            includeUnique: true,
            onlyActive: true,
            tierRank: false,
            maxResults: 5
        };

        const results = Engine.search(expensiveTieDataCache, params);

        assert.equal(results[0].synergyScore, 2);
        assert.equal(results[0].totalCost, 10);
        assert.deepEqual(results[0].units, ['BacklineExpensive', 'FrontlineExpensive']);
    });

    it('returns empty array when must-include units are not all found', () => {
        const params = { ...baseParams, mustInclude: ['NonExistentUnit'] };
        const results = Engine.search(mockDataCache, params);
        assert.equal(results.length, 0);
    });

    it('returns empty array when board size is smaller than required units', () => {
        const params = { ...baseParams, boardSize: 1, mustInclude: ['Garen', 'Lux'] };
        const results = Engine.search(mockDataCache, params);
        assert.deepEqual(results, []);
    });

    it('counts traits from resolved display names even when raw trait ids map to different aliases', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            maxResults: 5,
            includeUnique: false
        };
        const results = Engine.search(aliasedTraitDataCache, params);
        assert.equal(results.length, 1);
        assert.equal(results[0].synergyScore, 1);
    });

    it('applies the includeUnique toggle for alias-mapped trait data', () => {
        const paramsWithoutUnique = {
            ...baseParams,
            boardSize: 2,
            maxResults: 5,
            includeUnique: false
        };
        const paramsWithUnique = {
            ...paramsWithoutUnique,
            includeUnique: true
        };

        const withoutUnique = Engine.search(aliasedTraitDataCache, paramsWithoutUnique);
        const withUnique = Engine.search(aliasedTraitDataCache, paramsWithUnique);

        assert.equal(withoutUnique[0].synergyScore, 1);
        assert.equal(withUnique[0].synergyScore, 2);
    });

    it('supports explicit multi-count trait contributions from parsed unit data', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            mustIncludeTraits: ['Mage'],
            maxResults: 5,
            includeUnique: false
        };

        const results = Engine.search(weightedTraitDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].synergyScore, 1);
        assert.deepEqual(results[0].units, ['Amplifier', 'Caster']);
    });

    it('selects the best unit variant for board scoring and reports the assignment', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['MissFortune', 'Lux', 'Braum'],
            mustIncludeTraits: ['Conduit'],
            includeUnique: true
        };

        const results = Engine.search(variantTraitDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].synergyScore, 3);
        assert.equal(results[0].variantAssignments.MissFortune.label, 'Conduit Mode');
        assert.equal(results[0].traitCounts.Conduit, 2);
    });

    it('keeps variant-capable units searchable when banned traits only exclude some modes', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            mustInclude: ['MissFortune', 'Braum'],
            mustExcludeTraits: ['Conduit'],
            includeUnique: true
        };

        const results = Engine.search(variantTraitDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.MissFortune.label, 'Challenger Mode');
        assert.equal(results[0].traitCounts.Conduit, undefined);
    });

    it('respects explicit variant locks in the query params', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['MissFortune', 'Lux', 'Braum'],
            variantLocks: {
                MissFortune: 'challenger'
            },
            includeUnique: true
        };

        const results = Engine.search(variantTraitDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.MissFortune.label, 'Challenger Mode');
        assert.equal(results[0].traitCounts.Challenger, 1);
        assert.equal(results[0].traitCounts.Conduit, 1);
    });

    it('returns no boards when a required unit is locked to a missing variant', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            mustInclude: ['MissFortune', 'Braum'],
            variantLocks: {
                MissFortune: 'does-not-exist'
            }
        };

        const results = Engine.search(variantTraitDataCache, params);

        assert.deepEqual(results, []);
    });

    it('supports board-state conditions on variant legality', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Switcher', 'Warden', 'Mage'],
            tankRoles: [],
            carryRoles: [],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalVariantDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.Switcher.label, 'Arcane Mode');
        assert.equal(results[0].traitCounts.Arcane, 2);
        assert.equal(results[0].synergyScore, 1);
    });

    it('rejects conditional variants when the board state does not satisfy them', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            maxResults: 5,
            mustInclude: ['Switcher', 'Mage'],
            tankRoles: [],
            carryRoles: [],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalVariantDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.Switcher.label, 'Shadow Mode');
        assert.equal(results[0].traitCounts.Arcane, 1);
        assert.equal(results[0].synergyScore, 0);
    });

    it('applies unit-level conditional trait contributions when their board conditions are satisfied', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Catalyst', 'Warden', 'Mage'],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalEffectDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 2);
        assert.equal(results[0].synergyScore, 1);
    });

    it('skips unit-level conditional trait contributions when their board conditions are unmet', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Catalyst', 'Mage', 'Scout'],
            tankRoles: [],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalEffectDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 1);
        assert.equal(results[0].synergyScore, 0);
    });

    it('can satisfy required traits only through conditional effects', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Catalyst', 'Warden', 'Mage'],
            mustIncludeTraits: ['Arcane'],
            includeUnique: false
        };

        const results = Engine.search(conditionalEffectDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 2);
    });

    it('applies variant-level conditional effects for the selected mode only', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Switcher', 'Warden', 'Mage'],
            tankRoles: [],
            carryRoles: [],
            mustIncludeTraits: ['Arcane'],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalEffectVariantDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.Switcher.label, 'Arcane Mode');
        assert.equal(results[0].traitCounts.Arcane, 3);
        assert.equal(results[0].synergyScore, 1);
    });

    it('applies conditional effects with single-pass semantics', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Looper', 'Mage', 'Warden'],
            tankRoles: [],
            carryRoles: [],
            includeUnique: false,
            onlyActive: false
        };

        const results = Engine.search(singlePassConditionalDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 1);
        assert.equal(results[0].traitCounts.Shadow, 1);
    });

    it('applies unit-level conditional profiles when their conditions are satisfied', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Shifter', 'Warden', 'Mage'],
            includeUnique: false,
            onlyActive: true
        };

        const results = Engine.search(conditionalProfileDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 2);
        assert.equal(results[0].traitCounts.Shadow, undefined);
        assert.equal(results[0].synergyScore, 1);
    });

    it('falls back to the base profile when no conditional profile matches', () => {
        const params = {
            ...baseParams,
            boardSize: 2,
            maxResults: 5,
            mustInclude: ['Shifter', 'Mage'],
            tankRoles: [],
            includeUnique: false,
            onlyActive: false
        };

        const results = Engine.search(conditionalProfileDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Shadow, 1);
        assert.equal(results[0].traitCounts.Arcane, 1);
    });

    it('can satisfy required traits through a conditional profile swap', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Shifter', 'Warden', 'Mage'],
            mustIncludeTraits: ['Arcane'],
            includeUnique: false
        };

        const results = Engine.search(conditionalProfileDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 2);
    });

    it('uses the first matching conditional profile when multiple profiles match', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['Shifter', 'Warden', 'Mage'],
            includeUnique: false,
            onlyActive: false
        };

        const results = Engine.search(conditionalProfileDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].traitCounts.Arcane, 2);
        assert.equal(results[0].traitCounts.Spirit, undefined);
    });

    it('applies variant-level conditional profiles for the selected mode only', () => {
        const params = {
            ...baseParams,
            boardSize: 3,
            maxResults: 5,
            mustInclude: ['ProfileSwitcher', 'Warden', 'Mage'],
            tankRoles: [],
            carryRoles: [],
            mustIncludeTraits: ['Arcane'],
            includeUnique: false
        };

        const results = Engine.search(conditionalProfileVariantDataCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].variantAssignments.ProfileSwitcher.label, 'Adaptive Mode');
        assert.equal(results[0].traitCounts.Arcane, 2);
        assert.equal(results[0].traitCounts.Shadow, undefined);
    });

    it('respects maxResults limit', () => {
        const params = { ...baseParams, maxResults: 2, boardSize: 4 };
        const results = Engine.search(mockDataCache, params);
        assert.ok(results.length <= 2);
    });

    it('reports progress during search', () => {
        const params = { ...baseParams, boardSize: 4 };
        Engine.search(mockDataCache, params, (pct) => {
            assert.ok(pct >= 0 && pct <= 100);
        });
        // Progress may or may not be called depending on combination count vs interval
        // Just verify it doesn't crash
        assert.ok(true);
    });

    it('returns error for oversized search space', () => {
        // remainingSlots > 7 should error
        const params = { ...baseParams, boardSize: 50 };
        const results = Engine.search(mockDataCache, params);
        assert.ok(results.length > 0);
        assert.ok(results[0].error);
    });

    it('can fill a 9-slot board with 8 units by selecting one 2-slot Mecha form', () => {
        const params = {
            ...baseParams,
            boardSize: 9,
            maxResults: 5,
            mustInclude: ['Galio', 'VoyagerTwo', 'VoyagerThree', 'ConduitTwo', 'ConduitThree', 'BrawlerTwo', 'Lux', 'Braum'],
            tankRoles: [],
            carryRoles: [],
            includeUnique: true
        };

        const extendedCache = {
            ...mechaSlotDataCache,
            units: [
                ...mechaSlotDataCache.units.filter((unit) => unit.id !== 'AurelionSol' && unit.id !== 'Urgot'),
                { id: 'Lux', cost: 2, role: 'Carry', traits: ['Scholar'], traitIds: ['Scholar'] },
                { id: 'Braum', cost: 2, role: 'Tank', traits: ['Warden'], traitIds: ['Warden'] }
            ],
            traits: ['Brawler', 'Conduit', 'Mecha', 'Scholar', 'Voyager', 'Warden'],
            traitBreakpoints: {
                Brawler: [2],
                Conduit: [2],
                Mecha: [2, 4],
                Scholar: [1],
                Voyager: [2],
                Warden: [1]
            },
            hashMap: {
                Brawler: 'Brawler',
                Conduit: 'Conduit',
                Mecha: 'Mecha',
                Scholar: 'Scholar',
                Voyager: 'Voyager',
                Warden: 'Warden'
            }
        };

        const results = Engine.search(extendedCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].units.length, 8);
        assert.equal(results[0].occupiedSlots, 9);
        assert.equal(results[0].variantAssignments.Galio.label, '2-Slot Mecha');
        assert.equal(results[0].traitCounts.Mecha, 2);
    });

    it('can fill a 9-slot board with 7 units by selecting two 2-slot Mecha forms', () => {
        const params = {
            ...baseParams,
            boardSize: 9,
            maxResults: 5,
            mustInclude: ['Galio', 'AurelionSol', 'VoyagerTwo', 'ConduitTwo', 'ConduitThree', 'BrawlerTwo', 'Lux'],
            variantLocks: {
                Galio: 'two-slot',
                AurelionSol: 'two-slot'
            },
            tankRoles: [],
            carryRoles: [],
            includeUnique: true
        };

        const extendedCache = {
            ...mechaSlotDataCache,
            units: [
                ...mechaSlotDataCache.units.filter((unit) => unit.id !== 'Urgot'),
                { id: 'Lux', cost: 2, role: 'Carry', traits: ['Scholar'], traitIds: ['Scholar'] }
            ],
            traits: ['Brawler', 'Conduit', 'Mecha', 'Scholar', 'Voyager'],
            traitBreakpoints: {
                Brawler: [1],
                Conduit: [2],
                Mecha: [2, 4],
                Scholar: [1],
                Voyager: [2]
            },
            hashMap: {
                Brawler: 'Brawler',
                Conduit: 'Conduit',
                Mecha: 'Mecha',
                Scholar: 'Scholar',
                Voyager: 'Voyager'
            }
        };

        const results = Engine.search(extendedCache, params);

        assert.equal(results.length, 1);
        assert.equal(results[0].units.length, 7);
        assert.equal(results[0].occupiedSlots, 9);
        assert.equal(results[0].variantAssignments.Galio.label, '2-Slot Mecha');
        assert.equal(results[0].variantAssignments.AurelionSol.label, '2-Slot Mecha');
        assert.equal(results[0].traitCounts.Mecha, 4);
    });

    it('rejects Mecha 2-slot locks that overfill the board', () => {
        const params = {
            ...baseParams,
            boardSize: 7,
            maxResults: 5,
            mustInclude: ['Galio', 'VoyagerTwo', 'VoyagerThree', 'ConduitTwo', 'ConduitThree', 'BrawlerTwo', 'Lux'],
            variantLocks: {
                Galio: 'two-slot'
            },
            tankRoles: [],
            carryRoles: [],
            includeUnique: true
        };

        const extendedCache = {
            ...mechaSlotDataCache,
            units: [
                ...mechaSlotDataCache.units.filter((unit) => unit.id !== 'AurelionSol' && unit.id !== 'Urgot'),
                { id: 'Lux', cost: 2, role: 'Carry', traits: ['Scholar'], traitIds: ['Scholar'] }
            ],
            traits: ['Brawler', 'Conduit', 'Mecha', 'Scholar', 'Voyager'],
            traitBreakpoints: {
                Brawler: [1],
                Conduit: [2],
                Mecha: [2, 4],
                Scholar: [1],
                Voyager: [2]
            },
            hashMap: {
                Brawler: 'Brawler',
                Conduit: 'Conduit',
                Mecha: 'Mecha',
                Scholar: 'Scholar',
                Voyager: 'Voyager'
            }
        };

        const results = Engine.search(extendedCache, params);

        assert.deepEqual(results, []);
    });
});
