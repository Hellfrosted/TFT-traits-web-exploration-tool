// Shared engine fixtures keep the behavior suites small enough to navigate.
const mockTraits = ['Warrior', 'Mage', 'Guardian', 'Assassin', 'Sorcerer'];
const mockBreakpoints = {
    Warrior: [2, 4, 6],
    Mage: [2, 4],
    Guardian: [2, 4],
    Assassin: [2, 4],
    Sorcerer: [1]
};

const mockUnits = [
    { id: 'Garen', cost: 1, role: 'Tank', traits: ['Warrior', 'Guardian'], traitIds: ['Warrior', 'Guardian'] },
    { id: 'Darius', cost: 2, role: 'Tank', traits: ['Warrior'], traitIds: ['Warrior'] },
    { id: 'Lux', cost: 3, role: 'Carry', traits: ['Mage', 'Sorcerer'], traitIds: ['Mage', 'Sorcerer'] },
    { id: 'Ahri', cost: 4, role: 'Carry', traits: ['Mage'], traitIds: ['Mage'] },
    { id: 'Zed', cost: 3, role: 'Carry', traits: ['Assassin'], traitIds: ['Assassin'] },
    { id: 'Talon', cost: 2, role: 'Carry', traits: ['Assassin'], traitIds: ['Assassin'] },
    { id: 'Braum', cost: 3, role: 'Tank', traits: ['Guardian'], traitIds: ['Guardian'] },
    { id: 'Malph', cost: 1, role: 'Tank', traits: ['Guardian'], traitIds: ['Guardian'] }
];

const mockHashMap = {};
mockTraits.forEach((trait) => {
    mockHashMap[trait] = trait;
});
mockUnits.forEach((unit) => {
    mockHashMap[unit.id] = unit.id;
});

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

const BASE_SEARCH_PARAMS = Object.freeze({
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
});

function createBaseSearchParams(overrides = {}) {
    return {
        ...BASE_SEARCH_PARAMS,
        ...overrides
    };
}

module.exports = {
    aliasedTraitDataCache,
    createBaseSearchParams,
    conditionalEffectDataCache,
    conditionalEffectVariantDataCache,
    conditionalProfileDataCache,
    conditionalProfileVariantDataCache,
    conditionalVariantDataCache,
    mechaSlotDataCache,
    mockDataCache,
    roleThresholdDataCache,
    singlePassConditionalDataCache,
    variantTraitDataCache,
    weightedTraitDataCache
};
