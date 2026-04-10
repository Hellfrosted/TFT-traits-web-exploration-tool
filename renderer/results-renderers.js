(function initializeResultsRenderersFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const { escapeHtml, formatBoardEstimate, resolveShellElements, setResultsBodyMessage } = ns.shared;

    ns.createResultsRenderers = function createResultsRenderers(app, model, tooltipController) {
        const { state } = app;

        function clearNode(node) {
            while (node.firstChild) {
                node.removeChild(node.firstChild);
            }
        }

        function resolveResultsShell() {
            return resolveShellElements(['boardSpotlight', 'resBody']).elements;
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
            const remainingSlots = estimate?.remainingSlots;
            const estimateLabel = estimateCount === null
                ? 'Variable search space'
                : Number.isFinite(estimateCount)
                    ? `~${formatBoardEstimate(estimateCount)} boards`
                : 'Variable / estimating';
            const openSlotsLabel = Number.isFinite(Number(remainingSlots))
                ? String(remainingSlots)
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
            const { boardSpotlight: spotlight } = resolveResultsShell();
            if (!spotlight) return;

            spotlight.className = 'board-spotlight empty';
            clearNode(spotlight);

            const header = document.createElement('div');
            header.className = 'board-spotlight-header';
            const heading = document.createElement('div');
            const label = document.createElement('span');
            label.className = 'board-spotlight-label';
            label.textContent = 'Selected Board';
            const title = document.createElement('h3');
            title.className = 'board-spotlight-title';
            title.textContent = 'No selection';
            heading.appendChild(label);
            heading.appendChild(title);
            const rank = document.createElement('span');
            rank.className = 'board-spotlight-rank';
            rank.textContent = 'Awaiting results';
            header.appendChild(heading);
            header.appendChild(rank);

            const body = document.createElement('p');
            body.className = 'board-spotlight-empty';
            body.textContent = message;

            spotlight.appendChild(header);
            spotlight.appendChild(body);
        }

        function renderSearchingSpotlight() {
            renderEmptySpotlight('Results will appear here when the search completes.');
        }

        function renderResultsMessageRow(message, className = 'results-message-row') {
            return `<tr><td colspan="6" class="${className}">${escapeHtml(message)}</td></tr>`;
        }

        function createMetricBadge(text) {
            const badge = document.createElement('span');
            badge.className = 'spotlight-metric';
            badge.textContent = text;
            return badge;
        }

        function createTraitChipList(traits) {
            const wrapper = document.createElement('div');
            wrapper.className = 'trait-chip-list';
            if (traits.length === 0) {
                const empty = document.createElement('span');
                empty.className = 'trait-chip trait-chip-empty';
                empty.textContent = 'No qualifying traits';
                wrapper.appendChild(empty);
                return wrapper;
            }

            traits.forEach((trait) => {
                wrapper.appendChild(model.createTraitChip(
                    trait,
                    trait.isActive ? 'trait-chip-active' : 'trait-chip-inactive'
                ));
            });
            return wrapper;
        }

        function createUnitPillList(board) {
            const wrapper = document.createElement('div');
            wrapper.className = 'unit-pill-list';
            board.units.forEach((name) => wrapper.appendChild(model.createUnitPill(name, board)));
            return wrapper;
        }

        function renderBoardSpotlight(board, rankIndex) {
            tooltipController.hideTraitTooltip();
            if (!board) {
                renderEmptySpotlight();
                return;
            }

            const { boardSpotlight: spotlight } = resolveResultsShell();
            if (!spotlight) return;
            const traits = model.buildBoardTraitSummary(board, { showInactive: true });
            const valueScore = (model.getBoardMetric(board) / Math.max(board.totalCost, 1)).toFixed(2);
            const occupiedSlots = Number.isFinite(Number(board.occupiedSlots))
                ? Number(board.occupiedSlots)
                : board.units.length;
            const boardTitle = occupiedSlots === board.units.length
                ? `Level ${occupiedSlots} board - ${model.getBoardMetric(board)} score`
                : `${occupiedSlots}-slot board (${board.units.length} units) - ${model.getBoardMetric(board)} score`;

            spotlight.className = 'board-spotlight';
            clearNode(spotlight);

            const header = document.createElement('div');
            header.className = 'board-spotlight-header';
            const heading = document.createElement('div');
            const label = document.createElement('span');
            label.className = 'board-spotlight-label';
            label.textContent = 'Selected Board';
            const title = document.createElement('h3');
            title.className = 'board-spotlight-title';
            title.textContent = boardTitle;
            heading.appendChild(label);
            heading.appendChild(title);
            const rank = document.createElement('span');
            rank.className = 'board-spotlight-rank';
            rank.textContent = `Rank #${rankIndex + 1} by ${model.getBoardSortLabel()}`;
            header.appendChild(heading);
            header.appendChild(rank);

            const inline = document.createElement('div');
            inline.className = 'spotlight-inline';

            const metricsBlock = document.createElement('div');
            metricsBlock.className = 'spotlight-inline-block';
            const metrics = document.createElement('div');
            metrics.className = 'spotlight-metrics';
            metrics.appendChild(createMetricBadge(`Score ${model.getBoardMetric(board)}`));
            metrics.appendChild(createMetricBadge(`1-Star ${board.totalCost}`));
            metrics.appendChild(createMetricBadge(`2-Star ${board.totalCost * 3}`));
            metrics.appendChild(createMetricBadge(`Value ${valueScore}`));
            metricsBlock.appendChild(metrics);

            const unitsBlock = document.createElement('div');
            unitsBlock.className = 'spotlight-inline-block';
            const unitList = document.createElement('div');
            unitList.className = 'spotlight-unit-list';
            board.units.forEach((name) => unitList.appendChild(model.createUnitPill(name, board)));
            unitsBlock.appendChild(unitList);

            const traitsBlock = document.createElement('div');
            traitsBlock.className = 'spotlight-inline-block spotlight-inline-traits';
            const traitsList = document.createElement('div');
            traitsList.className = 'spotlight-traits';
            if (traits.length === 0) {
                const empty = document.createElement('span');
                empty.className = 'trait-chip trait-chip-empty';
                empty.textContent = 'No qualifying traits';
                traitsList.appendChild(empty);
            } else {
                traits.forEach((trait) => {
                    traitsList.appendChild(model.createTraitChip(
                        trait,
                        trait.isActive ? 'trait-chip-active' : 'trait-chip-inactive'
                    ));
                });
            }
            traitsBlock.appendChild(traitsList);

            inline.appendChild(metricsBlock);
            inline.appendChild(unitsBlock);
            inline.appendChild(traitsBlock);

            spotlight.appendChild(header);
            spotlight.appendChild(inline);
        }

        function renderResults(results) {
            const { resBody: tbody } = resolveResultsShell();
            if (!tbody) return;
            tooltipController.hideTraitTooltip();
            clearNode(tbody);
            state.selectedBoardIndex = results.length > 0 ? 0 : -1;

            if (!results || results.length === 0) {
                renderEmptySummary('No results');
                setResultsBodyMessage(app, tbody, 'No results found for these constraints.', 'results-message-row results-message-row-error');
                renderEmptySpotlight('No boards matched the current filters. Relax constraints or widen the search.');
                return;
            }

            if (results[0].error) {
                renderEmptySummary('Search error');
                setResultsBodyMessage(app, tbody, results[0].error, 'results-message-row results-message-row-error');
                renderEmptySpotlight('Search failed before a board could be inspected.');
                return;
            }

            const bestValue = results.reduce((best, board) => Math.max(best, model.getBoardMetric(board) / Math.max(board.totalCost, 1)), 0);
            const lowestCost = results.reduce((best, board) => Math.min(best, board.totalCost), Number.POSITIVE_INFINITY);
            const topScore = results.reduce((best, board) => Math.max(best, model.getBoardMetric(board)), Number.NEGATIVE_INFINITY);
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

            let selectedRow = null;
            const fragment = document.createDocumentFragment();
            results.forEach((board, index) => {
                const row = document.createElement('tr');
                row.className = index === state.selectedBoardIndex ? 'result-row-selected' : '';
                if (index === state.selectedBoardIndex) {
                    selectedRow = row;
                }

                const traits = model.buildBoardTraitSummary(board, { showInactive: true });
                const valueScore = (model.getBoardMetric(board) / Math.max(board.totalCost, 1)).toFixed(2);

                const rankCell = document.createElement('td');
                rankCell.className = 'rank-cell';
                rankCell.textContent = `#${index + 1}`;

                const scoreCell = document.createElement('td');
                const scoreStack = document.createElement('div');
                scoreStack.className = 'score-stack';
                const score = document.createElement('strong');
                score.textContent = String(model.getBoardMetric(board));
                const value = document.createElement('span');
                value.textContent = `Value ${valueScore}`;
                scoreStack.appendChild(score);
                scoreStack.appendChild(value);
                scoreCell.appendChild(scoreStack);

                const traitCell = document.createElement('td');
                traitCell.appendChild(createTraitChipList(traits));

                const costCell = document.createElement('td');
                costCell.textContent = String(board.totalCost);

                const twoStarCell = document.createElement('td');
                twoStarCell.textContent = String(board.totalCost * 3);

                const unitsCell = document.createElement('td');
                unitsCell.appendChild(createUnitPillList(board));

                row.appendChild(rankCell);
                row.appendChild(scoreCell);
                row.appendChild(traitCell);
                row.appendChild(costCell);
                row.appendChild(twoStarCell);
                row.appendChild(unitsCell);

                row.addEventListener('click', () => {
                    if (selectedRow) {
                        selectedRow.classList.remove('result-row-selected');
                    }
                    state.selectedBoardIndex = index;
                    selectedRow = row;
                    selectedRow.classList.add('result-row-selected');
                    renderBoardSpotlight(results[state.selectedBoardIndex], state.selectedBoardIndex);
                });
                fragment.appendChild(row);
            });
            tbody.appendChild(fragment);

            tooltipController.bindTooltipListeners();
            renderBoardSpotlight(results[state.selectedBoardIndex], state.selectedBoardIndex);
        }

        return {
            renderEmptySummary,
            renderEstimateSummary,
            renderEmptySpotlight,
            renderSearchingSpotlight,
            renderResultsMessageRow,
            renderBoardSpotlight,
            renderResults
        };
    };
})();
