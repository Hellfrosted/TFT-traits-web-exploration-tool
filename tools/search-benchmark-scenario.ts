function buildSearchBenchmarkData(unitCount = 30) {
    const traits = Array.from({ length: 14 }, (_, index) => `Trait${index}`);
    const units = Array.from({ length: unitCount }, (_, index) => ({
        id: `Unit${String(index).padStart(2, '0')}`,
        cost: (index % 5) + 1,
        role: index % 3 === 0 ? 'Tank' : index % 3 === 1 ? 'Carry' : 'Flex',
        traits: [traits[index % traits.length], traits[(index * 5 + 3) % traits.length]],
        traitIds: [traits[index % traits.length], traits[(index * 5 + 3) % traits.length]]
    }));

    return {
        units,
        traits,
        roles: ['Tank', 'Carry', 'Flex'],
        traitBreakpoints: Object.fromEntries(traits.map((trait) => [trait, [2, 4, 6]])),
        hashMap: Object.fromEntries(traits.map((trait) => [trait, trait]))
    };
}

const searchBenchmarkParams = {
    boardSize: 7,
    mustInclude: [],
    mustExclude: [],
    mustIncludeTraits: [],
    mustExcludeTraits: [],
    tankRoles: ['Tank'],
    carryRoles: ['Carry'],
    extraEmblems: [],
    onlyActive: true,
    tierRank: true,
    includeUnique: true,
    maxResults: 500
};

module.exports = {
    buildSearchBenchmarkData,
    searchBenchmarkParams
};
