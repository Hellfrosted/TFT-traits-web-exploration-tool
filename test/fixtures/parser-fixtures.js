function createTraitRecord(traitId, name, iconPath = '') {
    return {
        [traitId]: {
            mName: name,
            ...(iconPath ? { mIconPath: iconPath } : {}),
            __type: 'TftTraitData'
        }
    };
}

function createRoleRecord(roleId, name) {
    return {
        [roleId]: {
            mName: name
        }
    };
}

function createChampionRecord({
    key = 'Characters/Set17Champion',
    rawName = 'TFT17_KaiSa',
    tier = 4,
    roleId = '{RoleCarry}',
    traitIds = ['{TraitChallenger}']
} = {}) {
    return {
        [key]: {
            mCharacterName: rawName,
            unitTagsString: 'Champion',
            tier,
            CharacterRole: roleId,
            mLinkedTraits: traitIds.map((traitId) => ({ TraitData: traitId }))
        }
    };
}

function createSetCdragon({
    setNumber = '17',
    champions = [],
    traits = []
} = {}) {
    return {
        sets: {
            [setNumber]: {
                champions,
                traits
            }
        }
    };
}

module.exports = {
    createTraitRecord,
    createRoleRecord,
    createChampionRecord,
    createSetCdragon
};
