(function initializeResultsTooltipFactory() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};

    ns.createResultsTooltip = function createResultsTooltip(app, model) {
        let tooltipElement = null;
        let activeTooltipChip = null;
        let tooltipListenersBound = false;

        function clearNode(node) {
            while (node.firstChild) {
                node.removeChild(node.firstChild);
            }
        }

        function ensureTooltipElement() {
            if (tooltipElement && document.body.contains(tooltipElement)) {
                return tooltipElement;
            }

            tooltipElement = document.createElement('div');
            tooltipElement.className = 'trait-tooltip hidden';
            tooltipElement.setAttribute('aria-hidden', 'true');
            document.querySelector('.workspace')?.appendChild(tooltipElement);
            return tooltipElement;
        }

        function getTooltipData(chip) {
            const rawPayload = chip?.dataset?.traitTooltip;
            if (!rawPayload) return null;

            try {
                return JSON.parse(decodeURIComponent(rawPayload));
            } catch (error) {
                console.warn('Failed to parse trait tooltip payload.', error);
                return null;
            }
        }

        function getClosestTooltipChip(target) {
            if (!target || target.nodeType !== 1) {
                return null;
            }

            return target.closest('.trait-chip[data-trait-tooltip]');
        }

        function appendContributorRow(container, contributor) {
            const row = document.createElement('div');
            row.className = 'trait-tooltip-row trait-tooltip-contributor-row';
            if (contributor?.iconUrl) {
                const iconContainer = document.createElement('span');
                iconContainer.innerHTML = model.renderIconImage(
                    contributor.iconUrl,
                    contributor.label || '',
                    'pill-icon trait-tooltip-unit-icon'
                );
                if (iconContainer.firstChild) {
                    row.appendChild(iconContainer.firstChild);
                }
            }
            const text = document.createElement('span');
            text.textContent = contributor?.label || '';
            row.appendChild(text);
            container.appendChild(row);
        }

        function renderTooltipContent(element, data) {
            clearNode(element);

            const header = document.createElement('div');
            header.className = 'trait-tooltip-header';
            const title = document.createElement('div');
            title.className = 'trait-tooltip-title';
            title.textContent = data.title || '';
            const subtitle = document.createElement('div');
            subtitle.className = 'trait-tooltip-subtitle';
            subtitle.textContent = data.label || '';
            header.appendChild(title);
            header.appendChild(subtitle);
            element.appendChild(header);

            const section = document.createElement('div');
            section.className = 'trait-tooltip-section';
            if (Array.isArray(data?.contributors) && data.contributors.length > 0) {
                data.contributors.forEach((contributor) => appendContributorRow(section, contributor));
            } else {
                const empty = document.createElement('div');
                empty.className = 'trait-tooltip-row trait-tooltip-muted';
                empty.textContent = 'No direct unit contributors tracked.';
                section.appendChild(empty);
            }
            element.appendChild(section);

            if (data?.extraCount > 0) {
                const extra = document.createElement('div');
                extra.className = 'trait-tooltip-row trait-tooltip-muted';
                extra.textContent = `+${data.extraCount} from emblems`;
                element.appendChild(extra);
            }

            if (Number.isFinite(data?.missingCount) && data.missingCount > 0) {
                const missing = document.createElement('div');
                missing.className = 'trait-tooltip-row trait-tooltip-muted';
                missing.textContent = `${data.missingCount} more needed for ${data.nextBreakpoint}`;
                element.appendChild(missing);
            }
        }

        function hideTraitTooltip() {
            const element = ensureTooltipElement();
            activeTooltipChip = null;
            element.classList.add('hidden');
            element.setAttribute('aria-hidden', 'true');
            clearNode(element);
        }

        function positionTooltip(chip) {
            const element = ensureTooltipElement();
            const workspace = document.querySelector('.workspace');
            if (!workspace) return;

            const chipRect = chip.getBoundingClientRect();
            const workspaceRect = workspace.getBoundingClientRect();
            const tooltipRect = element.getBoundingClientRect();
            const offset = 12;
            const minLeft = workspaceRect.left + 8;
            const maxLeft = Math.max(minLeft, workspaceRect.right - tooltipRect.width - 8);

            let left = chipRect.left;
            if ((left + tooltipRect.width) > (workspaceRect.right - 8)) {
                left = chipRect.right - tooltipRect.width;
            }
            left = Math.min(Math.max(left, minLeft), maxLeft);

            let top = chipRect.bottom + offset;
            if ((top + tooltipRect.height) > (workspaceRect.bottom - 8)) {
                top = chipRect.top - tooltipRect.height - offset;
            }
            top = Math.max(workspaceRect.top + 8, top);

            element.style.left = `${Math.round(left)}px`;
            element.style.top = `${Math.round(top)}px`;
        }

        function showTraitTooltip(chip) {
            const data = getTooltipData(chip);
            if (!data) {
                hideTraitTooltip();
                return;
            }

            const element = ensureTooltipElement();
            activeTooltipChip = chip;
            renderTooltipContent(element, data);
            element.classList.remove('hidden');
            element.setAttribute('aria-hidden', 'false');
            element.style.visibility = 'hidden';
            positionTooltip(chip);
            element.style.visibility = 'visible';
        }

        function bindTooltipListeners() {
            if (tooltipListenersBound) return;
            tooltipListenersBound = true;

            const workspace = document.querySelector('.workspace');
            const tooltipTargets = '.trait-chip[data-trait-tooltip]';
            if (!workspace) return;

            workspace.addEventListener('mouseover', (event) => {
                const chip = event.target.closest(tooltipTargets);
                if (!chip || !workspace.contains(chip) || chip === activeTooltipChip) {
                    return;
                }

                showTraitTooltip(chip);
            });

            workspace.addEventListener('mouseout', (event) => {
                const chip = event.target.closest(tooltipTargets);
                if (!chip || chip !== activeTooltipChip) {
                    return;
                }

                const nextChip = getClosestTooltipChip(event.relatedTarget);
                if (nextChip === chip) {
                    return;
                }

                hideTraitTooltip();
            });

            workspace.addEventListener('focusin', (event) => {
                const chip = event.target.closest(tooltipTargets);
                if (!chip || !workspace.contains(chip)) {
                    return;
                }

                showTraitTooltip(chip);
            });

            workspace.addEventListener('focusout', (event) => {
                const chip = event.target.closest(tooltipTargets);
                if (!chip || chip !== activeTooltipChip) {
                    return;
                }

                const nextChip = getClosestTooltipChip(event.relatedTarget);
                if (nextChip === chip) {
                    return;
                }

                hideTraitTooltip();
            });

            workspace.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    hideTraitTooltip();
                }
            });

            window.addEventListener('resize', () => {
                if (activeTooltipChip) {
                    positionTooltip(activeTooltipChip);
                }
            });

            document.addEventListener('scroll', () => {
                hideTraitTooltip();
            }, true);
        }

        return {
            bindTooltipListeners,
            hideTraitTooltip
        };
    };
})();
