const traitMethods = require('./engine/trait-methods.js');
const conditionMethods = require('./engine/condition-methods.js');
const searchExecutionMethods = require('./engine/search-execution.js');

class Engine {}

Object.assign(Engine, traitMethods, conditionMethods, searchExecutionMethods);

module.exports = Engine;
