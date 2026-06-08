function createSearchExecutionDependencies(engine) {
    return {
        buildTraitContributionEntries: engine.buildTraitContributionEntries.bind(engine),
        getEntitySlotCost: engine.getEntitySlotCost.bind(engine),
        buildConditionalEffectEntries: engine.buildConditionalEffectEntries.bind(engine),
        buildConditionalProfileEntries: engine.buildConditionalProfileEntries.bind(engine),
        compileConditions: engine.compileConditions.bind(engine),
        summarizeVariantProfiles: engine.summarizeVariantProfiles.bind(engine),
        getUnitSlotCostRange: engine.getUnitSlotCostRange.bind(engine),
        combinations: engine.combinations.bind(engine),
        isCompiledConditionSatisfied: engine.isCompiledConditionSatisfied.bind(engine),
        findFirstSatisfiedProfile: engine.findFirstSatisfiedProfile.bind(engine),
        traitCountsToRecord: engine.traitCountsToRecord.bind(engine),
        buildSortedBoardUnits: engine.buildSortedBoardUnits.bind(engine)
    };
}

module.exports = {
    createSearchExecutionDependencies
};
