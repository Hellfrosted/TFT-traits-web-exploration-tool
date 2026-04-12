(function initializeQueryParamsUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createQueryParamsUi = function createQueryParamsUi(app, hooks = {}) {
        const { state } = app;
        const {
            queryControlState,
            queryShellUi,
            variantLockUi
        } = hooks;

        function getDefaultRoleFilterValues() {
            if (!state.activeData?.roles) {
                return null;
            }

            return {
                tankRoles: state.resolveDefaultTankRoles(state.activeData.roles),
                carryRoles: state.resolveDefaultCarryRoles(state.activeData.roles)
            };
        }

        function setSelectorValues(selector, values = []) {
            if (selector) {
                selector.setValues(values);
            }
        }

        function applyDefaultRoleSelectorValues(selector, values, force = false) {
            if (!selector) {
                return;
            }

            if (force || selector.getValues().length === 0) {
                selector.setValues(values);
            }
        }

        function applyDefaultRoleFilters(force = false) {
            const defaultRoleValues = getDefaultRoleFilterValues();
            if (!defaultRoleValues) {
                return;
            }

            applyDefaultRoleSelectorValues(state.selectors.tankRoles, defaultRoleValues.tankRoles, force);
            applyDefaultRoleSelectorValues(state.selectors.carryRoles, defaultRoleValues.carryRoles, force);
        }

        function getCurrentSearchParams() {
            const controls = queryShellUi.resolveQueryControls();
            return {
                ...queryControlState.readQueryControlValues(controls),
                mustInclude: state.selectors.mustInclude?.getValues() || [],
                mustExclude: state.selectors.mustExclude?.getValues() || [],
                mustIncludeTraits: state.selectors.mustIncludeTraits?.getValues() || [],
                mustExcludeTraits: state.selectors.mustExcludeTraits?.getValues() || [],
                extraEmblems: state.selectors.extraEmblems?.getValues() || [],
                variantLocks: variantLockUi.getCurrentVariantLocks(),
                tankRoles: state.selectors.tankRoles?.getValues() || [],
                carryRoles: state.selectors.carryRoles?.getValues() || []
            };
        }

        function getDefaultSearchParams() {
            return queryControlState.getDefaultSearchParams();
        }

        function applySelectorSearchParams(params) {
            setSelectorValues(state.selectors.mustInclude, params.mustInclude || []);
            setSelectorValues(state.selectors.mustExclude, params.mustExclude || []);
            setSelectorValues(state.selectors.mustIncludeTraits, params.mustIncludeTraits || []);
            setSelectorValues(state.selectors.mustExcludeTraits, params.mustExcludeTraits || []);
            setSelectorValues(state.selectors.extraEmblems, params.extraEmblems || []);

            const defaultRoleValues = getDefaultRoleFilterValues();
            queryControlState.applyRoleSelectorSearchParams(
                state.selectors.tankRoles,
                params.tankRoles,
                defaultRoleValues?.tankRoles
            );
            queryControlState.applyRoleSelectorSearchParams(
                state.selectors.carryRoles,
                params.carryRoles,
                defaultRoleValues?.carryRoles
            );

            variantLockUi.applyVariantLocks(params.variantLocks || {});
        }

        function applySearchParams(params = {}) {
            const nextParams = {
                ...getDefaultSearchParams(),
                ...params
            };
            const controls = queryShellUi.resolveQueryControls();
            queryControlState.applyQueryControlValues(controls, nextParams);
            applySelectorSearchParams(nextParams);
        }

        function clampNumericInput(id, min, max, fallback) {
            const input = queryShellUi.resolveQueryControls()[id];
            return queryControlState.clampNumericInput(input, min, max, fallback);
        }

        return {
            applyDefaultRoleFilters,
            getCurrentSearchParams,
            getDefaultSearchParams,
            applySearchParams,
            clampNumericInput
        };
    };
})();
