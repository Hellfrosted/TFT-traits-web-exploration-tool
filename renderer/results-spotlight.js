(function initializeResultsSpotlightFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    function requireResultsViewState() {
        const resultsViewState = ns.resultsViewState || ns.createResultsViewState?.();
        if (!resultsViewState) {
            throw new Error('Renderer results view state unavailable.');
        }

        return resultsViewState;
    }

    ns.createResultsSpotlight = function createResultsSpotlight(model, tooltipController, hooks = {}) {
        const resultsViewState = requireResultsViewState();
        const {
            resolveResultsShell,
            clearNode
        } = hooks;

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

        function renderEmptySpotlight(message = 'No selection') {
            const { boardSpotlight: spotlight } = resolveResultsShell();
            if (!spotlight) {
                return;
            }

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

        function renderBoardSpotlight(board, rankIndex) {
            tooltipController.hideTraitTooltip();
            if (!board) {
                renderEmptySpotlight();
                return;
            }

            const { boardSpotlight: spotlight } = resolveResultsShell();
            if (!spotlight) {
                return;
            }

            const traits = model.buildBoardTraitSummary(board, { showInactive: true });
            const spotlightState = resultsViewState.buildBoardSpotlightState(
                board,
                rankIndex,
                model.getBoardMetric,
                model.getBoardSortLabel
            );

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
            title.textContent = spotlightState.boardTitle;
            heading.appendChild(label);
            heading.appendChild(title);
            const rank = document.createElement('span');
            rank.className = 'board-spotlight-rank';
            rank.textContent = spotlightState.rankLabel;
            header.appendChild(heading);
            header.appendChild(rank);

            const inline = document.createElement('div');
            inline.className = 'spotlight-inline';

            const metricsBlock = document.createElement('div');
            metricsBlock.className = 'spotlight-inline-block';
            const metrics = document.createElement('div');
            metrics.className = 'spotlight-metrics';
            spotlightState.metricLabels.forEach((metricLabel) => {
                metrics.appendChild(createMetricBadge(metricLabel));
            });
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

        return {
            createTraitChipList,
            createUnitPillList,
            renderEmptySpotlight,
            renderSearchingSpotlight,
            renderBoardSpotlight
        };
    };
})();
