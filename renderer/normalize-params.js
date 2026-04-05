(function defineNormalizeParams() {
    const UI_LIMITS = {
        MIN_BOARD_SIZE: 1,
        MAX_BOARD_SIZE: 20,
        MIN_RESULTS: 1,
        MAX_RESULTS: 10000
    };

    function normalizeBoolean(value) {
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
                return false;
            }
            if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
                return true;
            }
        }

        if (typeof value === 'number') {
            return value !== 0;
        }

        return !!value;
    }

    function normalizeStringList(values) {
        if (!Array.isArray(values)) return [];

        const seen = new Set();
        const normalized = [];

        values.forEach((value) => {
            let candidate = value;
            if (candidate && typeof candidate === 'object') {
                candidate = candidate.value ?? candidate.id ?? candidate.name ?? candidate.label ?? '';
            }

            const stringValue = String(candidate ?? '').trim();
            if (!stringValue || seen.has(stringValue)) return;

            seen.add(stringValue);
            normalized.push(stringValue);
        });

        return normalized;
    }

    function normalizeStringValue(value) {
        let candidate = value;
        if (candidate && typeof candidate === 'object') {
            candidate = candidate.value ?? candidate.id ?? candidate.name ?? candidate.label ?? '';
        }

        return String(candidate ?? '').trim();
    }

    function normalizeStringMap(values) {
        if (!values || typeof values !== 'object' || Array.isArray(values)) {
            return {};
        }

        const normalized = {};
        Object.keys(values).sort().forEach((rawKey) => {
            const key = String(rawKey ?? '').trim();
            const value = normalizeStringValue(values[rawKey]);
            if (!key || !value) {
                return;
            }

            normalized[key] = value;
        });

        return normalized;
    }

    function clampInteger(value, fallback, min, max) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) {
            return fallback;
        }

        return Math.min(Math.max(parsed, min), max);
    }

    const normalizeParams = {
        UI_LIMITS,
        normalizeBoolean,
        normalizeStringList,
        normalizeStringMap,
        clampInteger
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = normalizeParams;
    } else {
        const ns = window.TFTRenderer = window.TFTRenderer || {};
        ns.normalizeParams = normalizeParams;
    }
})();
