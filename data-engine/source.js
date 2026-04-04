const { DATA_SOURCES, DEFAULT_DATA_SOURCE, NETWORK } = require('../constants.js');

const SOURCE_URLS = {
    [DATA_SOURCES.PBE]: {
        characters: 'https://raw.communitydragon.org/pbe/game/data/tftteamplanner/characters.bin.json',
        cdragon: 'https://raw.communitydragon.org/pbe/cdragon/tft/en_us.json',
        traitIcons: 'https://raw.communitydragon.org/pbe/game/assets/ux/traiticons/',
        championSplashes: 'https://raw.communitydragon.org/pbe/game/assets/ux/tft/championsplashes/patching/',
        assetBase: 'https://raw.communitydragon.org/pbe/game/assets/'
    },
    [DATA_SOURCES.LIVE]: {
        characters: 'https://raw.communitydragon.org/latest/game/data/tftteamplanner/characters.bin.json',
        cdragon: 'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json',
        traitIcons: 'https://raw.communitydragon.org/latest/game/assets/ux/traiticons/',
        championSplashes: 'https://raw.communitydragon.org/latest/game/assets/ux/tft/championsplashes/patching/',
        assetBase: 'https://raw.communitydragon.org/latest/game/assets/'
    }
};

module.exports = {
    SOURCE_URLS,

    normalizeDataSource(source = DEFAULT_DATA_SOURCE) {
        return source === DATA_SOURCES.LIVE ? DATA_SOURCES.LIVE : DEFAULT_DATA_SOURCE;
    },

    getSourceUrls(source = DEFAULT_DATA_SOURCE) {
        const normalizedSource = this.normalizeDataSource(source);
        return SOURCE_URLS[normalizedSource];
    },

    getRawDataCacheTtlMs(source = DEFAULT_DATA_SOURCE) {
        const normalizedSource = this.normalizeDataSource(source);
        const ttlBySource = NETWORK.DATA_CACHE_TTL_MS_BY_SOURCE || {};
        return ttlBySource[normalizedSource] ?? ttlBySource[DEFAULT_DATA_SOURCE] ?? 0;
    },

    _getTimeZoneParts(timestamp, timeZone) {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        const values = {};
        formatter.formatToParts(new Date(timestamp)).forEach((part) => {
            if (part.type !== 'literal') {
                values[part.type] = Number(part.value);
            }
        });

        return values;
    },

    _getTimeZoneOffsetMinutes(timestamp, timeZone) {
        const parts = this._getTimeZoneParts(timestamp, timeZone);
        const localAsUtc = Date.UTC(
            parts.year,
            (parts.month || 1) - 1,
            parts.day || 1,
            parts.hour || 0,
            parts.minute || 0,
            parts.second || 0
        );

        return Math.round((localAsUtc - timestamp) / 60000);
    },

    _getZonedDateTimestamp({
        year,
        month,
        day,
        hour = 0,
        minute = 0,
        second = 0
    }, timeZone) {
        const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
        let timestamp = localAsUtc;

        for (let attempt = 0; attempt < 3; attempt++) {
            const offsetMinutes = this._getTimeZoneOffsetMinutes(timestamp, timeZone);
            const adjustedTimestamp = localAsUtc - (offsetMinutes * 60000);
            if (adjustedTimestamp === timestamp) {
                break;
            }
            timestamp = adjustedTimestamp;
        }

        return timestamp;
    },

    _getPbeCacheExpiryTimestamp(fetchedAt) {
        const rollover = NETWORK.PBE_CACHE_ROLLOVER || {};
        const timeZone = rollover.timeZone || 'America/Los_Angeles';
        const rolloverHour = Number.isFinite(rollover.hour) ? rollover.hour : 11;
        const rolloverMinute = Number.isFinite(rollover.minute) ? rollover.minute : 0;
        const rolloverSecond = Number.isFinite(rollover.second) ? rollover.second : 0;
        const fetchedParts = this._getTimeZoneParts(fetchedAt, timeZone);

        const targetDay = new Date(Date.UTC(
            fetchedParts.year,
            (fetchedParts.month || 1) - 1,
            fetchedParts.day || 1
        ));

        const fetchedSecondsIntoDay = ((fetchedParts.hour || 0) * 3600)
            + ((fetchedParts.minute || 0) * 60)
            + (fetchedParts.second || 0);
        const rolloverSecondsIntoDay = (rolloverHour * 3600)
            + (rolloverMinute * 60)
            + rolloverSecond;

        if (fetchedSecondsIntoDay >= rolloverSecondsIntoDay) {
            targetDay.setUTCDate(targetDay.getUTCDate() + 1);
        }

        return this._getZonedDateTimestamp({
            year: targetDay.getUTCFullYear(),
            month: targetDay.getUTCMonth() + 1,
            day: targetDay.getUTCDate(),
            hour: rolloverHour,
            minute: rolloverMinute,
            second: rolloverSecond
        }, timeZone);
    },

    _normalizeRawDataSnapshot(snapshot, source = DEFAULT_DATA_SOURCE) {
        if (!snapshot || typeof snapshot !== 'object' || !snapshot.rawChar || typeof snapshot.rawChar !== 'object') {
            return null;
        }

        const fetchedAt = Number(snapshot.fetchedAt);

        return {
            source: this.normalizeDataSource(snapshot.source || source),
            fetchedAt: Number.isFinite(fetchedAt) && fetchedAt > 0 ? fetchedAt : 0,
            rawChar: snapshot.rawChar,
            rawTraits: snapshot.rawTraits || null,
            rawTraitIconsHtml: snapshot.rawTraitIconsHtml || null,
            rawChampionSplashesHtml: snapshot.rawChampionSplashesHtml || null
        };
    },

    _isRawDataSnapshotFresh(snapshot, source = DEFAULT_DATA_SOURCE, now = Date.now()) {
        const normalizedSnapshot = this._normalizeRawDataSnapshot(snapshot, source);
        if (!normalizedSnapshot || !normalizedSnapshot.fetchedAt) {
            return false;
        }

        if (this.normalizeDataSource(source) === DATA_SOURCES.PBE) {
            return now < this._getPbeCacheExpiryTimestamp(normalizedSnapshot.fetchedAt);
        }

        const ttlMs = this.getRawDataCacheTtlMs(source);
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            return false;
        }

        const ageMs = now - normalizedSnapshot.fetchedAt;
        return ageMs >= 0 && ageMs <= ttlMs;
    }
};
