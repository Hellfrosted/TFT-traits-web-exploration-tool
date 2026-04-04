const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    deriveDefaultTankRoles,
    deriveDefaultCarryRoles
} = require('../roleDefaults.js');

describe('role default derivation', () => {
    it('derives tank roles from fetched role names', () => {
        assert.deepEqual(
            deriveDefaultTankRoles(['APTank', 'ADCarry', 'ADTank', 'Unknown']),
            ['APTank', 'ADTank']
        );
    });

    it('derives carry defaults from non-tank, non-unknown roles', () => {
        assert.deepEqual(
            deriveDefaultCarryRoles([
                'ADCarry',
                'ADCaster',
                'ADTank',
                'Unknown',
                'APFighter',
                'APTank',
                'ADCarry'
            ]),
            ['ADCarry', 'ADCaster', 'APFighter']
        );
    });
});
