const crypto = require('crypto');

module.exports = {
    _createDataFingerprint(parsedData) {
        const fingerprintPayload = JSON.stringify({
            setNumber: parsedData.setNumber,
            units: parsedData.units.map((unit) => ({
                id: unit.id,
                cost: unit.cost,
                role: unit.role,
                slotCost: unit.slotCost || 1,
                traits: unit.traits,
                traitContributions: unit.traitContributions || null,
                conditionalEffects: unit.conditionalEffects || null,
                conditionalProfiles: unit.conditionalProfiles || null,
                variants: unit.variants || null
            })),
            traits: parsedData.traits,
            roles: parsedData.roles,
            traitBreakpoints: parsedData.traitBreakpoints
        });

        return crypto.createHash('sha1').update(fingerprintPayload).digest('hex');
    }
};
