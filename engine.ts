const traitMethods = require('./engine/trait-methods.js');
const conditionMethods = require('./engine/condition-methods.js');
const searchExecutionMethods = require('./engine/search-execution.js');

const Engine = Object.assign({}, traitMethods, conditionMethods, searchExecutionMethods);

module.exports = Engine;
