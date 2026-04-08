const { DATA_SOURCES, NETWORK } = require('../constants.js');

const RESPONSE_TOO_LARGE_CODE = 'ERR_RESPONSE_TOO_LARGE';
const textEncoder = new TextEncoder();

function getResponseByteLimit(responseType, networkConfig) {
    const limit = networkConfig?.MAX_RESPONSE_BYTES_BY_TYPE?.[responseType];
    return Number.isFinite(limit) ? limit : Infinity;
}

function getHeaderValue(headers, name) {
    if (!headers) {
        return null;
    }

    if (typeof headers.get === 'function') {
        return headers.get(name);
    }

    const normalizedName = String(name).toLowerCase();
    return headers[normalizedName] ?? headers[name] ?? null;
}

function parseContentLength(headers) {
    const contentLength = Number.parseInt(getHeaderValue(headers, 'content-length'), 10);
    return Number.isFinite(contentLength) && contentLength >= 0
        ? contentLength
        : null;
}

function createResponseTooLargeError(responseType, actualBytes, limitBytes) {
    const error = new Error(`Response too large for ${responseType}: ${actualBytes} bytes exceeds limit of ${limitBytes} bytes.`);
    error.code = RESPONSE_TOO_LARGE_CODE;
    error.responseType = responseType;
    error.actualBytes = actualBytes;
    error.limitBytes = limitBytes;
    return error;
}

function isResponseTooLargeError(error) {
    return error?.code === RESPONSE_TOO_LARGE_CODE;
}

async function cancelReader(reader, reason) {
    if (typeof reader?.cancel !== 'function') {
        return;
    }

    try {
        await reader.cancel(reason);
    } catch {
        // Ignore cancellation failures after enforcing the byte limit.
    }
}

async function readResponseTextWithinLimit(res, responseType, limitBytes, controller) {
    const contentLength = parseContentLength(res?.headers);
    if (contentLength !== null && contentLength > limitBytes) {
        throw createResponseTooLargeError(responseType, contentLength, limitBytes);
    }

    const stream = res?.body;
    if (stream && typeof stream.getReader === 'function') {
        const reader = stream.getReader();
        const decoder = new TextDecoder('utf-8');
        let totalBytes = 0;
        let text = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                const chunk = value instanceof Uint8Array
                    ? value
                    : new Uint8Array(value || []);

                totalBytes += chunk.byteLength;
                if (totalBytes > limitBytes) {
                    const error = createResponseTooLargeError(responseType, totalBytes, limitBytes);
                    controller?.abort();
                    await cancelReader(reader, error);
                    throw error;
                }

                text += decoder.decode(chunk, { stream: true });
            }

            text += decoder.decode();
            return text;
        } finally {
            reader.releaseLock?.();
        }
    }

    const text = await res.text();
    const totalBytes = textEncoder.encode(text).byteLength;
    if (totalBytes > limitBytes) {
        throw createResponseTooLargeError(responseType, totalBytes, limitBytes);
    }
    return text;
}

module.exports = {
    async fetchAndParse(options = {}) {
        const source = this.normalizeDataSource(options.source);
        const urls = this.getSourceUrls(source);
        const fetchJson = options.fetchJson || (async (url) => await this._fetchJsonWithRetry(url));
        const fetchText = options.fetchText || (async (url) => await this._fetchTextWithRetry(url));
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
                    fetchJson(urls.characters),
                    fetchJson(urls.cdragon)
                ]);

                const [rawTraitIconsHtml, rawChampionSplashesHtml] = await Promise.all([
                    fetchText(urls.traitIcons).catch((error) => {
                        console.warn('Failed to fetch trait icon directory:', error.message);
                        return null;
                    }),
                    fetchText(urls.championSplashes).catch((error) => {
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

    async _fetchWithRetry(url, responseType = 'json', fetchImpl = fetch, networkConfig = NETWORK) {
        let lastError;
        for (let attempt = 0; attempt < networkConfig.MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timeoutMs = Number.isFinite(networkConfig.FETCH_TIMEOUT_MS) ? networkConfig.FETCH_TIMEOUT_MS : 15000;
            const responseByteLimit = getResponseByteLimit(responseType, networkConfig);
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, timeoutMs);
            try {
                const res = await fetchImpl(url, {
                    signal: controller.signal
                });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                const responseText = await readResponseTextWithinLimit(res, responseType, responseByteLimit, controller);
                if (responseType === 'text') {
                    return responseText;
                }
                return JSON.parse(responseText);
            } catch (err) {
                const timedOut = controller.signal.aborted && (err?.name === 'AbortError' || err?.code === 'ABORT_ERR');
                lastError = timedOut ? new Error(`Request timed out after ${timeoutMs}ms`) : err;
                if (isResponseTooLargeError(lastError)) {
                    throw lastError;
                }
                if (attempt < networkConfig.MAX_RETRIES - 1) {
                    const delay = networkConfig.RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                    console.warn(`Fetch attempt ${attempt + 1} failed for ${url}, retrying in ${delay}ms...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            } finally {
                clearTimeout(timeoutId);
            }
        }
        throw new Error(`Failed to fetch ${url} after ${networkConfig.MAX_RETRIES} attempts: ${lastError.message}`);
    }
};
