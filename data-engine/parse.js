const parseSetDetectionMethods = require('./parse-set-detection.js');
const parseRoleResolutionMethods = require('./parse-role-resolution.js');
const parseFingerprintMethods = require('./parse-fingerprint.js');
const parseDataMethods = require('./parse-data.js');

module.exports = {
    ...parseSetDetectionMethods,
    ...parseRoleResolutionMethods,
    ...parseFingerprintMethods,
    ...parseDataMethods
};
