(function initializeHistoryUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { escapeHtml, summarizeParams, formatTimestamp } = ns.shared;

    ns.createHistoryUi = function createHistoryUi(app) {
        const { state } = app;

        async function updateHistoryList() {
            const listEl = document.getElementById('historyList');
            if (!listEl) return;
            if (!state.electronBridge?.listCache) {
                listEl.innerHTML = '<div class="history-empty">History unavailable</div>';
                return;
            }

            let res;
            try {
                res = await state.electronBridge.listCache();
            } catch (error) {
                listEl.innerHTML = `<div class="history-empty">History unavailable: ${escapeHtml(error.message || String(error))}</div>`;
                return;
            }

            if (!res.success || res.entries.length === 0) {
                listEl.innerHTML = res.success
                    ? '<div class="history-empty">No history</div>'
                    : `<div class="history-empty">History unavailable: ${escapeHtml(res.error || 'Unknown error')}</div>`;
                return;
            }

            const recent = res.entries.slice(0, 5);
            listEl.innerHTML = '';

            recent.forEach((entry) => {
                const item = document.createElement('div');
                item.className = 'history-item';

                const paramsStr = summarizeParams(entry.params);
                const title = entry.params ? `Level ${entry.params.boardSize}` : 'Saved Search';

                item.innerHTML = `
                    <div class="history-title">${escapeHtml(title)}</div>
                    <div class="history-params" title="${escapeHtml(paramsStr)}">${escapeHtml(paramsStr)}</div>
                    <div class="history-meta">
                        <span>${entry.resultCount} results</span>
                        <span>${escapeHtml(formatTimestamp(entry.timestamp))}</span>
                    </div>
                `;

                item.addEventListener('click', () => loadSearchFromHistory(entry));
                listEl.appendChild(item);
            });
        }

        function loadSearchFromHistory(entry) {
            if (state.isSearching) {
                showAlert('Wait for current search to finish or cancel it.');
                return;
            }

            const { params } = entry;
            if (!params) return;

            document.getElementById('boardSize').value = params.boardSize || 9;
            document.getElementById('maxResults').value = params.maxResults || 200;
            document.getElementById('onlyActiveToggle').checked = !!params.onlyActive;
            document.getElementById('tierRankToggle').checked = !!params.tierRank;
            document.getElementById('includeUniqueToggle').checked = !!params.includeUnique;

            if (state.selectors.mustInclude) state.selectors.mustInclude.setValues(params.mustInclude || []);
            if (state.selectors.mustExclude) state.selectors.mustExclude.setValues(params.mustExclude || []);
            if (state.selectors.mustIncludeTraits) state.selectors.mustIncludeTraits.setValues(params.mustIncludeTraits || []);
            if (state.selectors.mustExcludeTraits) state.selectors.mustExcludeTraits.setValues(params.mustExcludeTraits || []);
            if (state.selectors.extraEmblems) state.selectors.extraEmblems.setValues(params.extraEmblems || []);
            if (state.selectors.tankRoles) state.selectors.tankRoles.setValues(params.tankRoles || []);
            if (state.selectors.carryRoles) state.selectors.carryRoles.setValues(params.carryRoles || []);
            app.queryUi.applyVariantLocks(params.variantLocks || {});

            if (state.activeData?.hashMap) {
                state.selectors.tankRoles?.resolvePills(state.activeData.hashMap);
                state.selectors.carryRoles?.resolvePills(state.activeData.hashMap);
            }

            app.queryUi.renderQuerySummary(params, 'Loaded a recent search. Replaying query now.');
            document.getElementById('searchBtn').click();
        }

        window.updateHistoryList = updateHistoryList;

        return {
            updateHistoryList,
            loadSearchFromHistory
        };
    };
})();
