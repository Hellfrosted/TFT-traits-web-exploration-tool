(function initializeRendererShared() {
    const ns = window.TFTRenderer = window.TFTRenderer || {};
    const REQUIRED_SHELL_IDS = [
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

    function hasRequiredShellElements() {
        return REQUIRED_SHELL_IDS.every((id) => !!document.getElementById(id));
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
        hasRequiredShellElements,
        formatSnapshotAge,
        getBoardMetric,
        escapeHtml,
        renderIconImage,
        formatBoardEstimate,
        summarizeParams,
        formatTimestamp
    };

    window.escapeHtml = escapeHtml;
    window.summarizeParams = summarizeParams;
    window.formatTimestamp = formatTimestamp;
})();
