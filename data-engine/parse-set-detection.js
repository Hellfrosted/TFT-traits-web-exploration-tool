module.exports = {
    _isChampionRecord(key, val) {
        if (!val || typeof val !== 'object') return false;

        const rawTags = val.unitTagsString;
        const hasChampionTag = Array.isArray(rawTags)
            ? rawTags.includes('Champion')
            : String(rawTags || '').includes('Champion');

        const looksLikeCharacterRecord =
            key.includes('CharacterRecords/Root') ||
            key.includes('Characters/');

        return looksLikeCharacterRecord && hasChampionTag && typeof val.mCharacterName === 'string';
    },

    _detectLatestSet(cdragonJSON) {
        if (!cdragonJSON || !cdragonJSON.sets) return null;

        const setKeys = Object.keys(cdragonJSON.sets)
            .map(Number)
            .filter((value) => !isNaN(value));

        if (setKeys.length === 0) return null;

        return String(Math.max(...setKeys));
    },

    _detectLatestSetFromRaw(rawJSON) {
        const setNumbers = new Set();

        for (const [key, val] of Object.entries(rawJSON || {})) {
            if (!this._isChampionRecord(key, val)) {
                if (val?.__type === 'TftShopData') {
                    this._extractSetNumbersFromText([
                        val.mName,
                        val.TeamPlannerPortraitPath,
                        val.SquareSplashPath,
                        val.TeamPlannerSplashPath,
                        val.PcSplashPath,
                        val.AbilityIconPath
                    ].join(' ')).forEach((setNumber) => setNumbers.add(Number(setNumber)));
                }

                if (val?.__type === 'TftTraitData') {
                    this._extractSetNumbersFromText([val.mName, val.mIconPath].join(' '))
                        .forEach((setNumber) => setNumbers.add(Number(setNumber)));
                }

                continue;
            }

            const setNumber = this._resolveHighestSetNumber([val.mCharacterName]);
            if (setNumber) {
                setNumbers.add(Number(setNumber));
            }
        }

        if (setNumbers.size === 0) {
            return null;
        }

        return String(Math.max(...setNumbers));
    },

    _getLatestSetData(cdragonJSON) {
        const latestSet = this._detectLatestSet(cdragonJSON);
        if (!latestSet || !cdragonJSON?.sets?.[latestSet]) {
            return null;
        }
        return cdragonJSON.sets[latestSet];
    },

    _detectRawUnitSetNumber(rawChampionRecord, rawJSON, rawShopDataLookup = null) {
        const rawName = rawChampionRecord?.mCharacterName || '';
        const cleanName = this._normalizeUnitAlias(rawName);
        const displayName = this._toDisplayName(cleanName) || cleanName;
        const shopData = this._findRawShopData(
            rawChampionRecord,
            rawJSON,
            rawShopDataLookup,
            rawName,
            cleanName,
            displayName
        );
        const linkedTraitSignals = (rawChampionRecord?.mLinkedTraits || []).flatMap((traitLink) => {
            const traitRecord = rawJSON?.[traitLink?.TraitData];
            if (!traitRecord || traitRecord.__type !== 'TftTraitData') {
                return [];
            }

            return [traitRecord.mName, traitRecord.mIconPath];
        });

        return this._resolveHighestSetNumber([
            rawName,
            shopData?.mName,
            shopData?.TeamPlannerPortraitPath,
            shopData?.SquareSplashPath,
            shopData?.TeamPlannerSplashPath,
            shopData?.PcSplashPath,
            shopData?.AbilityIconPath,
            ...linkedTraitSignals
        ]);
    }
};
