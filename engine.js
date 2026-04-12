const traitMethods = require('./engine/trait-methods.js');
const conditionMethods = require('./engine/condition-methods.js');
const searchContextMethods = require('./engine/search-context.js');
const searchMethods = require('./engine/search.js');

class Engine {}

Object.assign(
    Engine,
    traitMethods,
    conditionMethods,
    searchContextMethods,
    searchMethods
);

module.exports = Engine;
