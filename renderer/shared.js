(function initializeRendererShared() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const FALLBACK_REQUIRED_SHELL_IDS = [
        'dataSourceSelect',
        'fetchBtn',
        'status',
        'dataStats',
        'resultsQuerySummary',
        'boardSpotlight',
        'sortMode',
        'searchBtn',
        'cancelBtn',
        'resetFiltersBtn',
        'resBody'
    ];
    const REQUIRED_SHELL_IDS = Array.isArray(window.electronAPI?.rendererContract?.requiredShellIds)
        ? [...window.electronAPI.rendererContract.requiredShellIds]
        : FALLBACK_REQUIRED_SHELL_IDS;

    function getMissingRequiredShellIds(ids = REQUIRED_SHELL_IDS) {
        return (Array.isArray(ids) ? ids : [])
            .filter((id) => !document.getElementById(id));
    }

    function resolveShellElements(ids = REQUIRED_SHELL_IDS) {
        const elements = {};
        const missingIds = [];

        (Array.isArray(ids) ? ids : []).forEach((id) => {
            const element = document.getElementById(id);
            if (element) {
                elements[id] = element;
                return;
            }

            missingIds.push(id);
        });

        return { elements, missingIds };
    }

    function reportRendererIssue(app, reporterState, issueKey, {
        consoleMessage,
        consoleDetail = null,
        statusMessage = '',
        querySummary = null
    } = {}) {
        if (reporterState && issueKey) {
            if (reporterState[issueKey]) {
                return false;
            }
            reporterState[issueKey] = true;
        }

        if (consoleDetail !== null && consoleDetail !== undefined) {
            console.error(consoleMessage, consoleDetail);
        } else {
            console.error(consoleMessage);
        }

        if (statusMessage && typeof app?.queryUi?.setStatusMessage === 'function') {
            app.queryUi.setStatusMessage(statusMessage);
        }

        if (querySummary && typeof app?.queryUi?.renderQuerySummary === 'function') {
            app.queryUi.renderQuerySummary(querySummary.params ?? null, querySummary.meta ?? '');
        }

        return true;
    }

    function createDialogInvoker(app, reporterState, {
        methodName,
        issueKey = 'missingDialogDependency',
        consoleMessage = `[Renderer Dependency Missing] ${methodName} is unavailable.`,
        statusMessage = 'Renderer dependency mismatch: dialog controls unavailable.',
        fallbackValue = false
    } = {}) {
        return (...args) => {
            const dialogFn = app?.state?.dependencies?.[methodName];
            if (typeof dialogFn === 'function') {
                return dialogFn(...args);
            }

            const [message, title = methodName === 'showConfirm' ? 'Confirmation' : 'Attention'] = args;
            const resolvedStatusMessage = typeof statusMessage === 'function'
                ? statusMessage({ methodName, title, message })
                : statusMessage;
            reportRendererIssue(app, reporterState, issueKey, {
                consoleMessage,
                consoleDetail: { title, message },
                statusMessage: resolvedStatusMessage
            });

            return Promise.resolve(fallbackValue);
        };
    }

    function setResultsBodyMessage(app, tbody, message, className = 'results-message-row') {
        if (!tbody || typeof app?.results?.renderResultsMessageRow !== 'function') {
            return false;
        }

        tbody.innerHTML = app.results.renderResultsMessageRow(message, className);
        return true;
    }

    function hasRequiredShellElements() {
        return getMissingRequiredShellIds().length === 0;
    }

    function formatSnapshotAge(timestamp) {
        const parsedTimestamp = Number(timestamp);
        if (!Number.isFinite(parsedTimestamp) || parsedTimestamp <= 0) {
            return '';
        }

        const ageMs = Math.max(0, Date.now() - parsedTimestamp);
        const ageMinutes = Math.round(ageMs / 60000);
        if (ageMinutes < 1) {
            return 'freshly cached';
        }
        if (ageMinutes < 60) {
            return `${ageMinutes}m old`;
        }

        const ageHours = Math.round(ageMinutes / 60);
        if (ageHours < 24) {
            return `${ageHours}h old`;
        }

        const ageDays = Math.round(ageHours / 24);
        return `${ageDays}d old`;
    }

    function getBoardMetric(board) {
        return board.synergyScore ?? board.traitsCount ?? 0;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderIconImage(url, alt, className) {
        if (!url) return '';
        return `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy">`;
    }

    function formatBoardEstimate(count) {
        const numericCount = Number(count);
        if (!Number.isFinite(numericCount) || numericCount <= 0) {
            return '-';
        }

        return new Intl.NumberFormat('en-US', {
            notation: 'compact',
            maximumFractionDigits: numericCount < 1000 ? 0 : 1
        }).format(numericCount);
    }

    function summarizeParams(params) {
        if (!params) return 'Incomplete data';
        const parts = [];
        if (params.mustInclude?.length) parts.push(`Inc: ${params.mustInclude.join(', ')}`);
        if (params.mustExclude?.length) parts.push(`Exc: ${params.mustExclude.join(', ')}`);
        if (params.mustIncludeTraits?.length) parts.push(`Traits: ${params.mustIncludeTraits.join(', ')}`);
        if (Object.keys(params.variantLocks || {}).length) parts.push(`Modes: ${Object.keys(params.variantLocks).length}`);
        return parts.join(' | ') || `Level ${params.boardSize}`;
    }

    function formatTimestamp(timestamp) {
        if (!timestamp) return '-';
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    ns.shared = {
        REQUIRED_SHELL_IDS,
        getMissingRequiredShellIds,
        resolveShellElements,
        reportRendererIssue,
        createDialogInvoker,
        setResultsBodyMessage,
        hasRequiredShellElements,
        formatSnapshotAge,
        getBoardMetric,
        escapeHtml,
        renderIconImage,
        formatBoardEstimate,
        summarizeParams,
        formatTimestamp
    };
})();
