const DataEngine = require('../data.js');
const { DATA_SOURCES } = require('../constants.js');
const { getSetOverrides } = require('../setOverrides.js');

function countDuplicates(values) {
    const seen = new Set();
    const duplicates = new Set();

    values.forEach((value) => {
        if (seen.has(value)) {
            duplicates.add(value);
            return;
        }
        seen.add(value);
    });

    return [...duplicates].sort();
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} while fetching ${url}`);
    }
    return response.json();
}

async function validateSource(source) {
    const normalizedSource = DataEngine.normalizeDataSource(source);
    const urls = DataEngine.getSourceUrls(normalizedSource);
    const cdragon = await fetchJson(urls.cdragon);
    const parsed = await DataEngine.fetchAndParse({ source: normalizedSource });
    const latestSet = DataEngine._detectLatestSet(cdragon);
    const setOverrides = getSetOverrides({ setNumber: latestSet });
    const setData = DataEngine._getLatestSetData(cdragon);
    const setChampionRecords = DataEngine._buildSetChampionRecords(setData, normalizedSource, setOverrides);
    const canonicalIds = new Set(setChampionRecords.map((record) => record.cleanName));
    const parsedIds = parsed.units.map((unit) => unit.id);
    const parsedIdSet = new Set(parsedIds);
    const duplicateUnits = countDuplicates(parsedIds);
    const excludedTraitNames = new Set(setOverrides.excludedTraitNames || []);
    const placeholderTraits = parsed.units
        .filter((unit) => unit.traits.some((trait) => excludedTraitNames.has(trait)))
        .map((unit) => unit.id);
    const leakedUnits = parsedIds.filter((id) => !canonicalIds.has(id)).sort();
    const missingUnits = [...canonicalIds].filter((id) => !parsedIdSet.has(id)).sort();
    const allowedUnknownRoleUnits = new Set(setOverrides.allowedUnknownRoleUnits || []);
    const unknownRoleUnits = parsed.units
        .filter((unit) => unit.role === 'Unknown')
        .map((unit) => unit.id);
    const unexpectedUnknownRoleUnits = unknownRoleUnits
        .filter((id) => !allowedUnknownRoleUnits.has(id))
        .sort();
    const warnings = [];
    const failures = [];

    if (parsed.units.length === 0) {
        failures.push('No parsed units returned.');
    }
    if (duplicateUnits.length > 0) {
        failures.push(`Duplicate parsed unit ids: ${duplicateUnits.join(', ')}`);
    }
    if (placeholderTraits.length > 0) {
        failures.push(`Placeholder traits still present on: ${placeholderTraits.join(', ')}`);
    }
    if (leakedUnits.length > 0) {
        failures.push(`Parsed units not present in canonical set roster: ${leakedUnits.join(', ')}`);
    }
    if (missingUnits.length > 0) {
        failures.push(`Canonical set units missing from parsed output: ${missingUnits.join(', ')}`);
    }
    if (parsed.assetValidation?.missingChampionIcons?.length > 0) {
        warnings.push(
            `Missing champion icons: ${parsed.assetValidation.missingChampionIcons.slice(0, 10).join(', ')}`
        );
    }
    if (unexpectedUnknownRoleUnits.length > 0) {
        warnings.push(`Unexpected Unknown-role units: ${unexpectedUnknownRoleUnits.join(', ')}`);
    }
    if (unknownRoleUnits.length > 0 && unexpectedUnknownRoleUnits.length === 0) {
        warnings.push(`Tracked special-role units: ${unknownRoleUnits.join(', ')}`);
    }

    return {
        source: normalizedSource,
        latestSet,
        unitCount: parsed.units.length,
        traitCount: parsed.traits.length,
        roleCount: parsed.roles.length,
        canonicalUnitCount: canonicalIds.size,
        warnings,
        failures
    };
}

async function main() {
    const requestedSources = process.argv.slice(2);
    const sources = requestedSources.length > 0
        ? requestedSources
        : [DATA_SOURCES.PBE, DATA_SOURCES.LIVE];
    let hasFailures = false;

    for (const source of sources) {
        const result = await validateSource(source);
        console.log(`Source: ${result.source}`);
        console.log(`  Set: ${result.latestSet}`);
        console.log(`  Parsed units: ${result.unitCount}`);
        console.log(`  Canonical units: ${result.canonicalUnitCount}`);
        console.log(`  Traits: ${result.traitCount}`);
        console.log(`  Roles: ${result.roleCount}`);

        result.warnings.forEach((warning) => {
            console.log(`  Warning: ${warning}`);
        });
        result.failures.forEach((failure) => {
            console.log(`  Failure: ${failure}`);
            hasFailures = true;
        });
    }

    if (hasFailures) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
