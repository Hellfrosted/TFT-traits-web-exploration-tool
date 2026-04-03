const { DATA_SOURCES, NETWORK } = require('../constants.js');

module.exports = {
    async fetchAndParse(options = {}) {
        const source = this.normalizeDataSource(options.source);
        const urls = this.getSourceUrls(source);
        let rawData;
        let usedCachedSnapshot = false;
        const cachedSnapshot = options.readFallback
            ? this._normalizeRawDataSnapshot(await options.readFallback(), source)
            : null;

        if (this._isRawDataSnapshotFresh(cachedSnapshot, source)) {
            rawData = cachedSnapshot;
            usedCachedSnapshot = true;
        }

        if (!rawData) {
            try {
                const [rawChar, rawTraits] = await Promise.all([
                    this._fetchJsonWithRetry(urls.characters),
                    this._fetchJsonWithRetry(urls.cdragon)
                ]);

                const [rawTraitIconsHtml, rawChampionSplashesHtml] = await Promise.all([
                    this._fetchTextWithRetry(urls.traitIcons).catch((error) => {
                        console.warn('Failed to fetch trait icon directory:', error.message);
                        return null;
                    }),
                    this._fetchTextWithRetry(urls.championSplashes).catch((error) => {
                        console.warn('Failed to fetch champion splash directory:', error.message);
                        return null;
                    })
                ]);

                rawData = {
                    source,
                    fetchedAt: Date.now(),
                    rawChar,
                    rawTraits,
                    rawTraitIconsHtml,
                    rawChampionSplashesHtml
                };

                if (options.writeFallback) {
                    try {
                        await options.writeFallback(rawData);
                    } catch (cacheErr) {
                        console.warn('Failed to write data fallback cache:', cacheErr.message);
                    }
                }
            } catch (fetchErr) {
                if (cachedSnapshot) {
                    console.warn('Using cached raw data snapshot (CDragon unreachable)');
                    rawData = cachedSnapshot;
                } else {
                    throw new Error(`Network error and no offline data available: ${fetchErr.message}`, { cause: fetchErr });
                }
            }
        }

        if (!rawData?.rawChar || typeof rawData.rawChar !== 'object') {
            throw new Error('Invalid character data: expected a JSON object');
        }

        const parsed = this.parseData(rawData.rawChar, rawData.rawTraits, {
            rawTraitIconsHtml: rawData.rawTraitIconsHtml,
            rawChampionSplashesHtml: rawData.rawChampionSplashesHtml
        }, { source });

        return {
            ...parsed,
            snapshotFetchedAt: rawData.fetchedAt || null,
            usedCachedSnapshot
        };
    },

    async fetchAndParsePBE(options = {}) {
        return this.fetchAndParse({
            ...options,
            source: DATA_SOURCES.PBE
        });
    },

    async _fetchJsonWithRetry(url) {
        return this._fetchWithRetry(url, 'json');
    },

    async _fetchTextWithRetry(url) {
        return this._fetchWithRetry(url, 'text');
    },

    async _fetchWithRetry(url, responseType = 'json') {
        let lastError;
        for (let attempt = 0; attempt < NETWORK.MAX_RETRIES; attempt++) {
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                if (responseType === 'text') {
                    return await res.text();
                }
                return await res.json();
            } catch (err) {
                lastError = err;
                if (attempt < NETWORK.MAX_RETRIES - 1) {
                    const delay = NETWORK.RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                    console.warn(`Fetch attempt ${attempt + 1} failed for ${url}, retrying in ${delay}ms...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }
        throw new Error(`Failed to fetch ${url} after ${NETWORK.MAX_RETRIES} attempts: ${lastError.message}`);
    }
};
