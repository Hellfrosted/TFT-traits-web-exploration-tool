const { getSetOverrides } = require('../setOverrides.js');

module.exports = {
    _getUnitOverride(cleanName, rawName, setOverrides = getSetOverrides()) {
        const unitOverrides = setOverrides.unitOverrides || {};
        return unitOverrides[cleanName] || unitOverrides[rawName] || null;
    },

    _applyUnitTraitOverrides(traits, unitOverride = null) {
        const removeTraits = new Set(unitOverride?.removeTraits || []);
        const effectiveTraits = [];
        const seen = new Set();

        [...(traits || []), ...(unitOverride?.addTraits || [])].forEach((trait) => {
            const normalized = String(trait || '').trim();
            if (!normalized || removeTraits.has(normalized) || seen.has(normalized)) {
                return;
            }

            seen.add(normalized);
            effectiveTraits.push(normalized);
        });

        return effectiveTraits;
    },

    _buildTraitContributionMap(traits, unitOverride = null) {
        const contributions = {};

        (traits || []).forEach((trait) => {
            contributions[trait] = (contributions[trait] || 0) + 1;
        });

        Object.entries(unitOverride?.traitContributions || {}).forEach(([trait, count]) => {
            const normalizedTrait = String(trait || '').trim();
            const numericCount = Math.trunc(Number(count));

            if (!normalizedTrait) {
                return;
            }
            if (!Number.isFinite(numericCount) || numericCount <= 0) {
                delete contributions[normalizedTrait];
                return;
            }

            contributions[normalizedTrait] = numericCount;
        });

        return contributions;
    },

    _normalizeConditionalEffects(conditionalEffects) {
        if (!Array.isArray(conditionalEffects)) {
            return [];
        }

        return conditionalEffects.map((effect) => {
            const traitContributions = Object.entries(effect?.traitContributions || {}).reduce((result, [trait, count]) => {
                const normalizedTrait = String(trait || '').trim();
                const numericCount = Math.trunc(Number(count));
                if (!normalizedTrait || !Number.isFinite(numericCount) || numericCount <= 0) {
                    return result;
                }

                result[normalizedTrait] = numericCount;
                return result;
            }, {});

            if (Object.keys(traitContributions).length === 0) {
                return null;
            }

            return {
                ...(effect?.conditions && typeof effect.conditions === 'object'
                    ? { conditions: effect.conditions }
                    : {}),
                traitContributions
            };
        }).filter(Boolean);
    },

    _normalizeConditionalProfiles(conditionalProfiles) {
        if (!Array.isArray(conditionalProfiles)) {
            return [];
        }

        return conditionalProfiles.map((profile) => {
            const normalizedAddTraits = (profile?.addTraits || [])
                .map((trait) => String(trait || '').trim())
                .filter(Boolean);
            const normalizedRemoveTraits = (profile?.removeTraits || [])
                .map((trait) => String(trait || '').trim())
                .filter(Boolean);
            const normalizedTraitContributions = Object.entries(profile?.traitContributions || {}).reduce((result, [trait, count]) => {
                const normalizedTrait = String(trait || '').trim();
                const numericCount = Math.trunc(Number(count));
                if (!normalizedTrait || !Number.isFinite(numericCount) || numericCount <= 0) {
                    return result;
                }

                result[normalizedTrait] = numericCount;
                return result;
            }, {});

            if (
                normalizedAddTraits.length === 0 &&
                normalizedRemoveTraits.length === 0 &&
                Object.keys(normalizedTraitContributions).length === 0
            ) {
                return null;
            }

            return {
                ...(profile?.conditions && typeof profile.conditions === 'object'
                    ? { conditions: profile.conditions }
                    : {}),
                ...(normalizedAddTraits.length > 0 ? { addTraits: normalizedAddTraits } : {}),
                ...(normalizedRemoveTraits.length > 0 ? { removeTraits: normalizedRemoveTraits } : {}),
                ...(Object.keys(normalizedTraitContributions).length > 0
                    ? { traitContributions: normalizedTraitContributions }
                    : {})
            };
        }).filter(Boolean);
    },

    _buildConditionalProfiles(baseTraits, conditionalProfiles = []) {
        return this._normalizeConditionalProfiles(conditionalProfiles).map((profile) => {
            const overrideContributionTraits = Object.entries(profile.traitContributions || {})
                .filter(([, count]) => Number(count) > 0)
                .map(([trait]) => trait);
            const effectiveTraits = this._applyUnitTraitOverrides(
                [...baseTraits, ...overrideContributionTraits],
                profile
            );
            const traitContributions = this._buildTraitContributionMap(effectiveTraits, profile);

            return {
                ...(profile.conditions && Object.keys(profile.conditions).length > 0
                    ? { conditions: profile.conditions }
                    : {}),
                ...(Number.isFinite(Number(profile.slotCost)) ? { slotCost: Number(profile.slotCost) } : {}),
                traits: effectiveTraits,
                traitContributions
            };
        }).filter((profile) => profile.traits.length > 0 || Object.keys(profile.traitContributions).length > 0);
    },

    _buildUnitVariants(baseTraits, baseRole, unitOverride = null) {
        let variantDefinitions;

        if (Array.isArray(unitOverride?.selectionGroups) && unitOverride.selectionGroups.length > 0) {
            let selectionStates = [{
                idParts: [],
                labelParts: [],
                role: baseRole,
                slotCost: Number.isFinite(Number(unitOverride?.slotCost)) ? Number(unitOverride.slotCost) : undefined,
                addTraits: [],
                removeTraits: [],
                traitContributions: {},
                conditions: {},
                conditionalEffects: [],
                conditionalProfiles: []
            }];

            unitOverride.selectionGroups.forEach((group, groupIndex) => {
                const options = Array.isArray(group?.options) ? group.options : [];
                if (options.length === 0) {
                    return;
                }

                const nextStates = [];
                selectionStates.forEach((state) => {
                    options.forEach((option, optionIndex) => {
                        nextStates.push({
                            idParts: [...state.idParts, String(option.id || `${group.id || `group-${groupIndex}`}-${optionIndex + 1}`)],
                            labelParts: [...state.labelParts, String(option.label || option.id || `Option ${optionIndex + 1}`)],
                            role: option.role || state.role,
                            slotCost: Number.isFinite(Number(option.slotCost)) ? Number(option.slotCost) : state.slotCost,
                            addTraits: [...state.addTraits, ...(option.addTraits || [])],
                            removeTraits: [...state.removeTraits, ...(option.removeTraits || [])],
                            traitContributions: {
                                ...state.traitContributions,
                                ...(option.traitContributions || {})
                            },
                            conditions: {
                                ...state.conditions,
                                ...(option.conditions || {})
                            },
                            conditionalEffects: [
                                ...state.conditionalEffects,
                                ...this._normalizeConditionalEffects(option.conditionalEffects)
                            ],
                            conditionalProfiles: [
                                ...state.conditionalProfiles,
                                ...this._normalizeConditionalProfiles(option.conditionalProfiles)
                            ]
                        });
                    });
                });

                selectionStates = nextStates;
            });

            variantDefinitions = selectionStates.map((state) => ({
                id: state.idParts.join('+'),
                label: state.labelParts.join(' + '),
                role: state.role,
                ...(Number.isFinite(Number(state.slotCost)) ? { slotCost: Number(state.slotCost) } : {}),
                addTraits: state.addTraits,
                removeTraits: state.removeTraits,
                traitContributions: state.traitContributions,
                conditions: state.conditions,
                conditionalEffects: state.conditionalEffects,
                conditionalProfiles: state.conditionalProfiles
            }));
        } else if (Array.isArray(unitOverride?.variants) && unitOverride.variants.length > 0) {
            variantDefinitions = unitOverride.variants;
        } else {
            return [];
        }

        return variantDefinitions.map((variant, index) => {
            const variantTraits = this._applyUnitTraitOverrides(baseTraits, variant);
            const overrideContributionTraits = Object.entries(variant?.traitContributions || {})
                .filter(([, count]) => Number(count) > 0)
                .map(([trait]) => trait);
            const effectiveTraits = this._applyUnitTraitOverrides(
                [...variantTraits, ...overrideContributionTraits],
                variant
            );
            const traitContributions = this._buildTraitContributionMap(effectiveTraits, variant);
            const conditionalProfiles = this._buildConditionalProfiles(
                effectiveTraits,
                variant.conditionalProfiles
            );

            return {
                id: String(variant.id || `variant-${index + 1}`),
                label: String(variant.label || variant.id || `Variant ${index + 1}`),
                role: variant.role || baseRole,
                ...(Number.isFinite(Number(variant.slotCost))
                    ? { slotCost: Number(variant.slotCost) }
                    : (Number.isFinite(Number(unitOverride?.slotCost))
                        ? { slotCost: Number(unitOverride.slotCost) }
                        : {})),
                traits: effectiveTraits,
                traitContributions,
                ...(this._normalizeConditionalEffects(variant.conditionalEffects).length > 0
                    ? { conditionalEffects: this._normalizeConditionalEffects(variant.conditionalEffects) }
                    : {}),
                ...(conditionalProfiles.length > 0 ? { conditionalProfiles } : {}),
                ...(variant.conditions && Object.keys(variant.conditions).length > 0
                    ? { conditions: variant.conditions }
                    : {})
            };
        }).filter((variant) => variant.traits.length > 0 || Object.keys(variant.traitContributions).length > 0);
    },

    _mergeUnitOverrides(baseOverride = null, extraOverride = null) {
        if (!baseOverride && !extraOverride) {
            return null;
        }
        if (!baseOverride) {
            return extraOverride;
        }
        if (!extraOverride) {
            return baseOverride;
        }

        return {
            ...extraOverride,
            ...baseOverride,
            slotCost: Number.isFinite(Number(baseOverride.slotCost))
                ? Number(baseOverride.slotCost)
                : Number(extraOverride.slotCost),
            addTraits: [...(extraOverride.addTraits || []), ...(baseOverride.addTraits || [])],
            removeTraits: [...(extraOverride.removeTraits || []), ...(baseOverride.removeTraits || [])],
            traitContributions: {
                ...(extraOverride.traitContributions || {}),
                ...(baseOverride.traitContributions || {})
            },
            conditionalEffects: [
                ...this._normalizeConditionalEffects(extraOverride.conditionalEffects),
                ...this._normalizeConditionalEffects(baseOverride.conditionalEffects)
            ],
            conditionalProfiles: [
                ...this._normalizeConditionalProfiles(extraOverride.conditionalProfiles),
                ...this._normalizeConditionalProfiles(baseOverride.conditionalProfiles)
            ],
            variants: baseOverride.variants || extraOverride.variants,
            selectionGroups: baseOverride.selectionGroups || extraOverride.selectionGroups
        };
    },

    _buildDetectedVariantOverrides({
        rawName,
        baseRole,
        baseTraits,
        hasExcludedLinkedTraits,
        rawChampionRecordMap,
        hashDictionary,
        traitNamesByAlias,
        setOverrides
    }) {
        if (!hasExcludedLinkedTraits) {
            return null;
        }

        const cloneRecord = rawChampionRecordMap.get(`${rawName}_TraitClone`);
        if (!cloneRecord) {
            return null;
        }

        const cloneTraits = (cloneRecord.mLinkedTraits || []).reduce((result, traitLink) => {
            const traitId = traitLink?.TraitData;
            if (!traitId) return result;

            const alias = hashDictionary[traitId] || traitId;
            const resolvedName = traitNamesByAlias[alias] || traitNamesByAlias[traitId] || alias;
            if (!resolvedName || this._isExcludedTraitName(resolvedName, setOverrides)) {
                return result;
            }

            result.push(resolvedName);
            return result;
        }, []);
        const uniqueCloneTraits = [...new Set(cloneTraits)].filter((trait) => !baseTraits.includes(trait));
        if (uniqueCloneTraits.length === 0) {
            return null;
        }

        const cloneRoleId = cloneRecord.CharacterRole || 'Unknown';
        const cloneRoleName = hashDictionary[cloneRoleId] || baseRole;

        return {
            variants: uniqueCloneTraits.map((traitName) => ({
                id: this._normalizeSlug(traitName) || traitName.toLowerCase(),
                label: `${traitName} Mode`,
                addTraits: [traitName],
                role: cloneRoleName && cloneRoleName !== 'Unknown' ? cloneRoleName : baseRole
            }))
        };
    },

    _isExcludedUnit(name, setOverrides = getSetOverrides()) {
        const raw = String(name || '');
        const alias = this._normalizeUnitAlias(raw);
        const candidates = [raw, alias].filter(Boolean);
        const exactNames = new Set(setOverrides.excludedUnitExact || []);

        return candidates.some((value) => (
            (setOverrides.excludedUnitPatterns || []).some((pattern) => value.includes(pattern)) ||
            (setOverrides.excludedUnitSuffixes || []).some((suffix) => value.endsWith(suffix)) ||
            exactNames.has(value)
        ));
    },

    _isExcludedTraitName(name, setOverrides = getSetOverrides()) {
        const normalized = String(name || '').trim();
        return (setOverrides.excludedTraitNames || []).includes(normalized);
    }
};
