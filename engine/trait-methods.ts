module.exports = {
    buildTraitContributionEntries(unit, traitIndex, hashMap = {}) {
        const contributionMap = new Map();
        const addContribution = (traitName, count = 1) => {
            const index = traitIndex[traitName];
            const numericCount = Math.trunc(Number(count));
            if (index === undefined || !Number.isFinite(numericCount) || numericCount <= 0) {
                return;
            }

            contributionMap.set(index, (contributionMap.get(index) || 0) + numericCount);
        };

        if (unit.traitContributions && typeof unit.traitContributions === 'object') {
            Object.entries(unit.traitContributions as LooseRecord).forEach(([traitName, count]) => {
                addContribution(traitName, count);
            });
        } else {
            const traitNames = new Set();

            if (Array.isArray(unit.traits)) {
                unit.traits.forEach((traitName) => {
                    traitNames.add(traitName);
                });
            }

            if (Array.isArray(unit.traitIds)) {
                unit.traitIds.forEach((traitId) => {
                    traitNames.add(hashMap[traitId] || traitId);
                });
            }

            traitNames.forEach((traitName) => addContribution(traitName, 1));
        }

        return Array.from(contributionMap.entries()).map(([index, count]) => ({ index, count }));
    },

    getConditionalEffectTraitNames(conditionalEffects) {
        const traitNames = new Set();

        (conditionalEffects || []).forEach((effect) => {
            Object.keys(effect?.traitContributions || {}).forEach((traitName) => {
                if (traitName) {
                    traitNames.add(traitName);
                }
            });
        });

        return [...traitNames];
    },

    buildConditionalEffectEntries(conditionalEffects, traitIndex, hashMap = {}) {
        return (conditionalEffects || []).map((effect) => {
            const traitContributionEntries = this.buildTraitContributionEntries(
                { traitContributions: effect?.traitContributions || {} },
                traitIndex,
                hashMap
            );

            if (traitContributionEntries.length === 0) {
                return null;
            }

            return {
                conditions: effect?.conditions || null,
                traitContributionEntries
            };
        }).filter(Boolean);
    },

    buildConditionalProfileEntries(conditionalProfiles, traitIndex, hashMap = {}) {
        return (conditionalProfiles || []).map((profile) => {
            const traitContributionEntries = this.buildTraitContributionEntries(profile, traitIndex, hashMap);
            if (traitContributionEntries.length === 0) {
                return null;
            }

            return {
                conditions: profile?.conditions || null,
                traits: profile?.traits || [],
                traitContributionEntries
            };
        }).filter(Boolean);
    },

    getAutomaticConditionalTraitNames(unit) {
        const traitNames = new Set(this.getConditionalEffectTraitNames(unit?.conditionalEffects));

        (unit?.conditionalProfiles || []).forEach((profile) => {
            (profile?.traits || []).forEach((traitName) => {
                if (traitName) {
                    traitNames.add(traitName);
                }
            });
            Object.keys(profile?.traitContributions || {}).forEach((traitName) => {
                if (traitName) {
                    traitNames.add(traitName);
                }
            });
        });

        (unit?.variants || []).forEach((variant) => {
            this.getConditionalEffectTraitNames(variant?.conditionalEffects).forEach((traitName) => {
                traitNames.add(traitName);
            });
            (variant?.conditionalProfiles || []).forEach((profile) => {
                (profile?.traits || []).forEach((traitName) => {
                    if (traitName) {
                        traitNames.add(traitName);
                    }
                });
                Object.keys(profile?.traitContributions || {}).forEach((traitName) => {
                    if (traitName) {
                        traitNames.add(traitName);
                    }
                });
            });
        });

        return traitNames;
    },

    getUnitTraitProfiles(unit, lockedVariantId = null) {
        const unitConditionalTraits = this.getConditionalEffectTraitNames(unit.conditionalEffects);
        const unitConditionalProfileTraits = (unit.conditionalProfiles || []).map((profile) => ([
            ...new Set([
                ...(profile.traits || []),
                ...this.getConditionalEffectTraitNames(unit.conditionalEffects)
            ])
        ]));
        if (Array.isArray(unit.variants) && unit.variants.length > 0) {
            const variants = lockedVariantId
                ? unit.variants.filter((variant) => variant.id === lockedVariantId)
                : unit.variants;
            return variants.flatMap((variant) => {
                const variantConditionalTraits = this.getConditionalEffectTraitNames(variant.conditionalEffects);
                const baseVariantTraits = [...new Set([...(variant.traits || []), ...unitConditionalTraits, ...variantConditionalTraits])];
                const conditionalVariantTraits = (variant.conditionalProfiles || []).map((profile) => ([
                    ...new Set([
                        ...(profile.traits || []),
                        ...unitConditionalTraits,
                        ...variantConditionalTraits
                    ])
                ]));
                return [baseVariantTraits, ...conditionalVariantTraits, ...unitConditionalProfileTraits];
            });
        }

        return [
            [...new Set([...(unit.traits || []), ...unitConditionalTraits])],
            ...unitConditionalProfileTraits
        ];
    },

    hasAllowedTraitProfile(unit, excludedTraits, lockedVariantId = null) {
        if (!excludedTraits || excludedTraits.size === 0) {
            return this.getUnitTraitProfiles(unit, lockedVariantId).length > 0;
        }

        return this.getUnitTraitProfiles(unit, lockedVariantId)
            .some((traits) => !traits.some((trait) => excludedTraits.has(trait)));
    },

    contributionEntriesToMap(entries) {
        const contributionMap = new Map();
        (entries || []).forEach(({ index, count }) => {
            contributionMap.set(index, count);
        });
        return contributionMap;
    },

    summarizeVariantProfiles(variantProfiles) {
        if (!Array.isArray(variantProfiles) || variantProfiles.length === 0) {
            return {
                fixedTraitContributionEntries: [],
                variantProfiles: []
            };
        }

        const entryMaps = variantProfiles.map((profile) => this.contributionEntriesToMap(profile.traitContributionEntries));
        const allIndexes = new Set();
        entryMaps.forEach((entryMap) => {
            entryMap.forEach((_, index) => allIndexes.add(index));
        });

        const fixedTraitContributionEntries = [];
        allIndexes.forEach((index) => {
            const commonCount = Math.min(...entryMaps.map((entryMap) => entryMap.get(index) || 0));
            if (commonCount > 0) {
                fixedTraitContributionEntries.push({ index, count: commonCount });
            }
        });

        const fixedContributionMap = this.contributionEntriesToMap(fixedTraitContributionEntries);
        const normalizedVariants = variantProfiles.map((profile) => {
            const deltaEntries = [];
            profile.traitContributionEntries.forEach(({ index, count }) => {
                const deltaCount = count - (fixedContributionMap.get(index) || 0);
                if (deltaCount > 0) {
                    deltaEntries.push({ index, count: deltaCount });
                }
            });

            return {
                ...profile,
                traitContributionEntries: deltaEntries
            };
        });

        return {
            fixedTraitContributionEntries,
            variantProfiles: normalizedVariants
        };
    },

    traitCountsToRecord(counts, allTraitNames) {
        const record = {};

        for (let i = 0; i < counts.length; i++) {
            if (counts[i] > 0) {
                record[allTraitNames[i]] = counts[i];
            }
        }

        return record;
    }
};
