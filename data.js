const sourceMethods = require('./data-engine/source.js');
const fetchMethods = require('./data-engine/fetch.js');
const assetMethods = require('./data-engine/assets.js');
const overrideMethods = require('./data-engine/overrides.js');
const parseMethods = require('./data-engine/parse.js');

/**
 * @typedef {Object} UnitVariantData
 * @property {string} id
 * @property {string} label
 * @property {string} role
 * @property {number} [slotCost]
 * @property {string[]} traits
 * @property {Object<string, number>} [traitContributions]
 * @property {Object<string, any>} [conditions]
 * @property {{conditions?: Object<string, any>, traitContributions: Object<string, number>}[]} [conditionalEffects]
 * @property {{conditions?: Object<string, any>, traits: string[], traitContributions: Object<string, number>}[]} [conditionalProfiles]
 */

/**
 * @typedef {Object} UnitData
 * @property {string} id
 * @property {number} cost
 * @property {string} role
 * @property {number} [slotCost]
 * @property {string[]} traits
 * @property {Object<string, number>} [traitContributions]
 * @property {{conditions?: Object<string, any>, traitContributions: Object<string, number>}[]} [conditionalEffects]
 * @property {{conditions?: Object<string, any>, traits: string[], traitContributions: Object<string, number>}[]} [conditionalProfiles]
 * @property {string[]} traitIds
 * @property {string} displayName
 * @property {string|null} [iconUrl]
 * @property {UnitVariantData[]} [variants]
 * @property {Object<string, string>} traitIcons
 * @property {{championAssetCount: number, matchedChampionCount: number, totalUnits: number, missingChampionIcons: string[], unmatchedChampionAssets: number, traitIconCount: number, totalTraits: number}} assetValidation
 */

/**
 * @typedef {Object} ParsedData
 * @property {UnitData[]} units
 * @property {string[]} traits
 * @property {string[]} roles
 * @property {Object<string, number[]>} traitBreakpoints
 * @property {Object<string, string>} hashMap
 */

class DataEngine {}

Object.assign(
    DataEngine,
    sourceMethods,
    fetchMethods,
    assetMethods,
    overrideMethods,
    parseMethods
);

module.exports = DataEngine;
