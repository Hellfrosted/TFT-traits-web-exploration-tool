const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../engine.js');
const searchExecutionMethods = require('../engine/search-execution.js');

describe('search execution module', () => {
    it('owns the engine search interface', () => {
        assert.equal(Engine.search, searchExecutionMethods.search);
        assert.equal(Engine.prepareSearchContext, searchExecutionMethods.prepareSearchContext);
        assert.equal(Engine.getCombinationCount, searchExecutionMethods.getCombinationCount);
        assert.equal(Engine.countSearchSpaceCandidates, searchExecutionMethods.countSearchSpaceCandidates);
    });
});
