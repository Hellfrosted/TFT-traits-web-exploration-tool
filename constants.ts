const {
    IPC_CHANNELS,
    DATA_SOURCES,
    DEFAULT_DATA_SOURCE,
    LIMITS,
    SMOKE_TEST_FLAG,
    RENDERER_CONTRACT
} = require('./bridge-contract.js');

/**
 * Shared constants for the TFT Board Explorer application.
 * Bridge contract values live in bridge-contract.js; this module adds
 * runtime-specific configuration shared by Node-side modules.
 */

const NETWORK = {
    MAX_RETRIES: 3,
    RETRY_BASE_DELAY_MS: 1000,
    FETCH_TIMEOUT_MS: 15000,
    MAX_RESPONSE_BYTES_BY_TYPE: {
        json: 24 * 1024 * 1024,
        text: 5 * 1024 * 1024
    },
    DATA_CACHE_TTL_MS_BY_SOURCE: {
        [DATA_SOURCES.LIVE]: 13 * 24 * 60 * 60 * 1000
    },
    PBE_CACHE_ROLLOVER: {
        timeZone: 'America/Los_Angeles',
        hour: 11,
        minute: 0,
        second: 0
    }
};

module.exports = {
    IPC_CHANNELS,
    DATA_SOURCES,
    DEFAULT_DATA_SOURCE,
    LIMITS,
    NETWORK,
    SMOKE_TEST_FLAG,
    RENDERER_CONTRACT
};
