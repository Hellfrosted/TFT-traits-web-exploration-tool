(function initializeVariantLockUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createVariantLockUi = function createVariantLockUi(app, hooks = {}) {
        const { state } = app;
        const {
            resolveSummaryShell,
            refreshDraftQuerySummary
        } = hooks;

        function getVariantCapableUnits() {
            if (!state.activeData?.unitMap) {
                return [];
            }

            return [...state.activeData.unitMap.values()]
                .filter((unit) => Array.isArray(unit.variants) && unit.variants.length > 0)
                .sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id));
        }

        function getCurrentVariantLocks() {
            const variantLocks = {};

            state.variantLockControls.forEach((select, unitId) => {
                const value = String(select.value || '').trim();
                if (!value || value === 'auto') {
                    return;
                }

                variantLocks[unitId] = value;
            });

            return variantLocks;
        }

        function applyVariantLocks(variantLocks = {}) {
            state.variantLockControls.forEach((select, unitId) => {
                const requested = variantLocks?.[unitId] || 'auto';
                const hasRequestedOption = Array.from(select.options).some((option) => option.value === requested);
                select.value = hasRequestedOption ? requested : 'auto';
            });
        }

        function resetVariantLockSection(container) {
            state.variantLockControls.clear();
            container.innerHTML = '';
        }

        function setVariantLockSectionVisibility(section, hasVariantUnits) {
            if (hasVariantUnits) {
                section.classList.remove('hidden');
                return;
            }

            section.classList.add('hidden');
        }

        function createVariantLockOption(value, label) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            return option;
        }

        function createVariantLockRow(unit) {
            const row = document.createElement('div');
            row.className = 'variant-lock-row';

            const label = document.createElement('div');
            label.className = 'variant-lock-name';
            label.textContent = unit.displayName || unit.id;

            const select = document.createElement('select');
            select.className = 'variant-lock-select';
            select.setAttribute('aria-label', `${unit.displayName || unit.id} variant lock`);
            select.appendChild(createVariantLockOption('auto', 'Auto'));

            unit.variants.forEach((variant) => {
                select.appendChild(createVariantLockOption(variant.id, variant.label || variant.id));
            });

            row.appendChild(label);
            row.appendChild(select);
            return { row, select };
        }

        function renderVariantLockControls(preservedLocks = null) {
            const {
                variantLocksSection: section,
                variantLocksContainer: container
            } = resolveSummaryShell();
            if (!section || !container) {
                return;
            }

            const variantUnits = getVariantCapableUnits();
            const locks = preservedLocks || getCurrentVariantLocks();
            resetVariantLockSection(container);

            if (variantUnits.length === 0) {
                setVariantLockSectionVisibility(section, false);
                return;
            }

            setVariantLockSectionVisibility(section, true);
            variantUnits.forEach((unit) => {
                const { row, select } = createVariantLockRow(unit);
                container.appendChild(row);
                state.variantLockControls.set(unit.id, select);
                select.addEventListener('change', refreshDraftQuerySummary);
            });

            applyVariantLocks(locks);
        }

        return {
            getCurrentVariantLocks,
            applyVariantLocks,
            renderVariantLockControls
        };
    };
})();
