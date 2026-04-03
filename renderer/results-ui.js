(function initializeResultsUiFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { escapeHtml, renderIconImage, getBoardMetric, formatBoardEstimate } = ns.shared;

    ns.createResultsUi = function createResultsUi(app) {
        const { state } = app;

        function renderUnitPill(name, board = null) {
            const unit = state.activeData?.unitMap?.get(name);
            const label = unit?.displayName || name;
            const variantAssignment = board?.variantAssignments?.[name];
            const variantLabel = typeof variantAssignment === 'string'
                ? variantAssignment
                : variantAssignment?.label || '';
            const fullLabel = variantLabel ? `${label} (${variantLabel})` : label;
            const iconMarkup = renderIconImage(unit?.iconUrl, label, 'pill-icon unit-icon');

            return `<span class="unit-pill">${iconMarkup}<span>${escapeHtml(fullLabel)}</span></span>`;
        }

        function renderTraitChip(trait, extraClassName = '') {
            const iconMarkup = renderIconImage(trait.iconUrl, trait.trait, 'pill-icon trait-icon');
            const className = ['trait-chip', extraClassName].filter(Boolean).join(' ');
            return `<span class="${className}">${iconMarkup}${escapeHtml(trait.label)}</span>`;
        }

        function renderEmptySummary(message) {
            app.queryUi.setResultsSummary(`
                <div class="summary-card">
                    <span class="summary-label">Status</span>
                    <span class="summary-value">${escapeHtml(message)}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Top Score</span>
                    <span class="summary-value">-</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Lowest Cost</span>
                    <span class="summary-value">-</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Best Value</span>
                    <span class="summary-value">-</span>
                </div>
            `);
        }

        function renderEstimateSummary(estimate = null) {
            const estimateCount = estimate?.count;
            const remainingToPick = estimate?.remainingToPick;
            const estimateLabel = Number.isFinite(Number(estimateCount))
                ? `~${formatBoardEstimate(estimateCount)} boards`
                : 'Estimating...';
            const openSlotsLabel = Number.isFinite(Number(remainingToPick))
                ? String(remainingToPick)
                : '-';

            app.queryUi.setResultsSummary(`
                <div class="summary-card">
                    <span class="summary-label">Search Space</span>
                    <span class="summary-value">${escapeHtml(estimateLabel)}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Open Slots</span>
                    <span class="summary-value">${escapeHtml(openSlotsLabel)}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Top Score</span>
                    <span class="summary-value">-</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Lowest Cost</span>
                    <span class="summary-value">-</span>
                </div>
            `);
        }

        function renderEmptySpotlight(message = 'No selection') {
            const spotlight = document.getElementById('boardSpotlight');
            if (!spotlight) return;

            spotlight.className = 'board-spotlight empty';
            spotlight.innerHTML = `
                <div class="board-spotlight-header">
                    <div>
                        <span class="board-spotlight-label">Selected Board</span>
                        <h3 class="board-spotlight-title">No selection</h3>
                    </div>
                    <span class="board-spotlight-rank">Awaiting results</span>
                </div>
                <p class="board-spotlight-empty">${escapeHtml(message)}</p>
            `;
        }

        function renderSearchingSpotlight() {
            const estimateLabel = Number.isFinite(Number(state.activeSearchEstimate?.count))
                ? `Current estimate: ~${formatBoardEstimate(state.activeSearchEstimate.count)} boards.`
                : 'Estimating the search space for this query.';
            renderEmptySpotlight(`${estimateLabel} Results will appear here when the search completes.`);
        }

        function renderResultsMessageRow(message, className = 'results-message-row') {
            return `<tr><td colspan="6" class="${className}">${escapeHtml(message)}</td></tr>`;
        }

        function buildBoardTraitSummary(board) {
            if (!state.activeData?.unitMap) return [];

            const counts = new Map();
            const hasPrecomputedTraitCounts = board?.traitCounts && typeof board.traitCounts === 'object';
            if (hasPrecomputedTraitCounts) {
                Object.entries(board.traitCounts).forEach(([trait, count]) => {
                    counts.set(trait, count);
                });
            } else {
                for (const unitName of board.units) {
                    const unit = state.activeData.unitMap.get(unitName);
                    if (!unit) continue;
                    for (const trait of unit.traits) {
                        counts.set(trait, (counts.get(trait) || 0) + 1);
                    }
                }
            }

            if (!hasPrecomputedTraitCounts) {
                for (const emblem of state.lastSearchParams?.extraEmblems || []) {
                    counts.set(emblem, (counts.get(emblem) || 0) + 1);
                }
            }

            const activeTraits = [];
            counts.forEach((count, trait) => {
                const breakpoints = state.activeData.traitBreakpoints?.[trait] || [1];
                let levelReached = 0;
                for (const breakpoint of breakpoints) {
                    if (count >= breakpoint) levelReached = breakpoint;
                    else break;
                }

                const isUnique = breakpoints.length === 1 && breakpoints[0] === 1;
                if (!state.lastSearchParams?.includeUnique && isUnique) return;
                if (state.lastSearchParams?.onlyActive && levelReached === 0) return;

                const nextBreakpoint = breakpoints.find((breakpoint) => breakpoint > count) || breakpoints[breakpoints.length - 1];
                activeTraits.push({
                    trait,
                    count,
                    levelReached,
                    isActive: levelReached > 0,
                    label: levelReached > 0 ? `${trait} ${count}/${levelReached}` : `${trait} ${count}/${nextBreakpoint}`,
                    iconUrl: state.activeData?.traitIcons?.[trait] || null
                });
            });

            return activeTraits.sort((a, b) =>
                b.levelReached - a.levelReached ||
                b.count - a.count ||
                a.trait.localeCompare(b.trait)
            );
        }

        const sortFunctions = {
            mostTraits: (a, b) => getBoardMetric(b) - getBoardMetric(a) || b.totalCost - a.totalCost,
            lowestCost: (a, b) => a.totalCost - b.totalCost || getBoardMetric(b) - getBoardMetric(a),
            highestCost: (a, b) => b.totalCost - a.totalCost || getBoardMetric(b) - getBoardMetric(a),
            bestValue: (a, b) => (getBoardMetric(b) / b.totalCost) - (getBoardMetric(a) / a.totalCost)
        };

        function getActiveSortMode() {
            return document.getElementById('sortMode')?.value || 'mostTraits';
        }

        function getSortedResults(results) {
            const sortFn = sortFunctions[getActiveSortMode()] || sortFunctions.mostTraits;
            return [...results].sort(sortFn);
        }

        function getBoardSortLabel() {
            const labels = {
                mostTraits: 'Best Synergy',
                lowestCost: 'Lowest Cost',
                highestCost: 'Highest Cost',
                bestValue: 'Best Value'
            };

            return labels[getActiveSortMode()] || labels.mostTraits;
        }

        function renderBoardSpotlight(board, rankIndex) {
            if (!board) {
                renderEmptySpotlight();
                return;
            }

            const spotlight = document.getElementById('boardSpotlight');
            const traits = buildBoardTraitSummary(board);
            const unitsMarkup = board.units.map((name) => renderUnitPill(name, board)).join('');
            const traitMarkup = traits.length > 0
                ? traits.map((trait) => renderTraitChip(trait, trait.isActive ? 'trait-chip-active' : 'trait-chip-inactive')).join('')
                : '<span class="trait-chip trait-chip-empty">No qualifying traits</span>';
            const valueScore = (getBoardMetric(board) / Math.max(board.totalCost, 1)).toFixed(2);

            spotlight.className = 'board-spotlight';
            spotlight.innerHTML = `
                <div class="board-spotlight-header">
                    <div>
                        <span class="board-spotlight-label">Selected Board</span>
                        <h3 class="board-spotlight-title">Level ${board.units.length} board - ${getBoardMetric(board)} score</h3>
                    </div>
                    <span class="board-spotlight-rank">Rank #${rankIndex + 1} by ${getBoardSortLabel()}</span>
                </div>
                <div class="spotlight-inline">
                    <div class="spotlight-inline-block">
                        <div class="spotlight-metrics">
                            <span class="spotlight-metric">Score ${getBoardMetric(board)}</span>
                            <span class="spotlight-metric">1-Star ${board.totalCost}</span>
                            <span class="spotlight-metric">2-Star ${board.totalCost * 3}</span>
                            <span class="spotlight-metric">Value ${valueScore}</span>
                        </div>
                    </div>
                    <div class="spotlight-inline-block">
                        <div class="spotlight-unit-list">${unitsMarkup}</div>
                    </div>
                    <div class="spotlight-inline-block spotlight-inline-traits">
                        <div class="spotlight-traits">${traitMarkup}</div>
                    </div>
                </div>
            `;
        }

        function renderResults(results) {
            const tbody = document.getElementById('resBody');
            tbody.innerHTML = '';
            state.selectedBoardIndex = results.length > 0 ? 0 : -1;

            if (!results || results.length === 0) {
                renderEmptySummary('No results');
                tbody.innerHTML = renderResultsMessageRow('No results found for these constraints.', 'results-message-row results-message-row-error');
                renderEmptySpotlight('No boards matched the current filters. Relax constraints or widen the search.');
                return;
            }

            if (results[0].error) {
                renderEmptySummary('Search error');
                tbody.innerHTML = renderResultsMessageRow(results[0].error, 'results-message-row results-message-row-error');
                renderEmptySpotlight('Search failed before a board could be inspected.');
                return;
            }

            const bestValue = results.reduce((best, board) => Math.max(best, getBoardMetric(board) / Math.max(board.totalCost, 1)), 0);
            const lowestCost = results.reduce((best, board) => Math.min(best, board.totalCost), Number.POSITIVE_INFINITY);
            const topScore = results.reduce((best, board) => Math.max(best, getBoardMetric(board)), Number.NEGATIVE_INFINITY);
            app.queryUi.setResultsSummary(`
                <div class="summary-card">
                    <span class="summary-label">Status</span>
                    <span class="summary-value">${results.length} boards</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Top Score</span>
                    <span class="summary-value">${topScore}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Lowest Cost</span>
                    <span class="summary-value">${lowestCost}</span>
                </div>
                <div class="summary-card">
                    <span class="summary-label">Best Value</span>
                    <span class="summary-value">${bestValue.toFixed(2)}</span>
                </div>
            `);

            results.forEach((board, index) => {
                const tr = document.createElement('tr');
                tr.className = index === state.selectedBoardIndex ? 'result-row-selected' : '';
                const traits = buildBoardTraitSummary(board);
                const traitMarkup = traits.length > 0
                    ? traits.slice(0, 6).map((trait) =>
                        renderTraitChip(trait, trait.isActive ? 'trait-chip-active' : 'trait-chip-inactive')
                    ).join('')
                    : '<span class="trait-chip trait-chip-empty">No qualifying traits</span>';
                const unitsMarkup = board.units.map((name) => renderUnitPill(name, board)).join('');
                const valueScore = (getBoardMetric(board) / Math.max(board.totalCost, 1)).toFixed(2);

                tr.innerHTML = `
                    <td class="rank-cell">#${index + 1}</td>
                    <td>
                        <div class="score-stack">
                            <strong>${getBoardMetric(board)}</strong>
                            <span>Value ${valueScore}</span>
                        </div>
                    </td>
                    <td><div class="trait-chip-list">${traitMarkup}</div></td>
                    <td>${board.totalCost}</td>
                    <td>${board.totalCost * 3}</td>
                    <td><div class="unit-pill-list">${unitsMarkup}</div></td>
                `;
                tr.addEventListener('click', () => {
                    state.selectedBoardIndex = index;
                    renderBoardSpotlight(results[state.selectedBoardIndex], state.selectedBoardIndex);
                    Array.from(tbody.children).forEach((row, rowIndex) => {
                        row.classList.toggle('result-row-selected', rowIndex === state.selectedBoardIndex);
                    });
                });
                tbody.appendChild(tr);
            });

            renderBoardSpotlight(results[state.selectedBoardIndex], state.selectedBoardIndex);
        }

        return {
            renderEmptySummary,
            renderEstimateSummary,
            renderEmptySpotlight,
            renderSearchingSpotlight,
            renderResultsMessageRow,
            getSortedResults,
            renderResults,
            renderBoardSpotlight
        };
    };
})();
