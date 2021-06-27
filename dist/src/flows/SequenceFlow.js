"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _ExecutionScope = _interopRequireDefault(require("../activity/ExecutionScope"));

var _messageHelper = require("../messageHelper");

var _shared = require("../shared");

var _EventBroker = require("../EventBroker");

var _Api = require("../Api");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _default = SequenceFlow;
exports.default = _default;
const brokerSymbol = Symbol.for('broker');
const eventBrokerSymbol = Symbol.for('eventBroker');
const countersSymbol = Symbol.for('counters');
const loopedSymbol = Symbol.for('loopedSymbol');

function SequenceFlow(flowDef, {
  environment
}) {
  if (!(this instanceof SequenceFlow)) {
    return new SequenceFlow(flowDef, {
      environment
    });
  }

  const {
    id,
    type = 'sequenceflow',
    name,
    parent: originalParent,
    targetId,
    sourceId,
    isDefault,
    behaviour = {}
  } = flowDef;
  const parent = (0, _messageHelper.cloneParent)(originalParent);
  const logger = environment.Logger(type.toLowerCase());
  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = parent;
  this.behaviour = behaviour;
  this.sourceId = sourceId;
  this.targetId = targetId;
  this.isDefault = isDefault;
  this.isSequenceFlow = true;
  this.environment = environment;
  this.logger = logger;
  environment.registerScript(this);
  this[countersSymbol] = {
    looped: 0,
    take: 0,
    discard: 0
  };
  const eventBroker = this[eventBrokerSymbol] = (0, _EventBroker.EventBroker)(this, {
    prefix: 'flow',
    durable: true,
    autoDelete: false
  });
  this[brokerSymbol] = eventBroker.broker;
  logger.debug(`<${id}> init, <${sourceId}> -> <${targetId}>`);
}

Object.defineProperty(SequenceFlow.prototype, 'broker', {
  enumerable: true,

  get() {
    return this[brokerSymbol];
  }

});
Object.defineProperty(SequenceFlow.prototype, 'counters', {
  enumerable: true,

  get() {
    return { ...this[countersSymbol]
    };
  }

});

SequenceFlow.prototype.on = function on(...args) {
  return this[eventBrokerSymbol].on(...args);
};

SequenceFlow.prototype.once = function once(...args) {
  return this[eventBrokerSymbol].once(...args);
};

SequenceFlow.prototype.waitFor = function waitFor(...args) {
  return this[eventBrokerSymbol].waitFor(...args);
};

SequenceFlow.prototype.emitFatal = function emitFatal(...args) {
  return this[eventBrokerSymbol].emitFatal(...args);
};

SequenceFlow.prototype.take = function take(content = {}) {
  this[loopedSymbol] = undefined;
  const {
    sequenceId
  } = content;
  this.logger.debug(`<${sequenceId} (${this.id})> take, target <${this.targetId}>`);
  ++this[countersSymbol].take;
  this.publishEvent('take', content);
  return true;
};

SequenceFlow.prototype.discard = function discard(content = {}) {
  const {
    sequenceId = (0, _shared.getUniqueId)(this.id)
  } = content;
  const discardSequence = content.discardSequence = (content.discardSequence || []).slice();
  const counters = this[countersSymbol];

  if (discardSequence.indexOf(this.targetId) > -1) {
    ++this[countersSymbol].looped;
    this.logger.debug(`<${this.id}> discard loop detected <${this.sourceId}> -> <${this.targetId}>. Stop.`);
    return this.publishEvent('looped', content);
  }

  discardSequence.push(this.sourceId);
  this.logger.debug(`<${sequenceId} (${this.id})> discard, target <${this.targetId}>`);
  ++counters.discard;
  this.publishEvent('discard', content);
};

SequenceFlow.prototype.publishEvent = function publishEvent(action, content) {
  const eventContent = this.createMessage({
    action,
    ...content
  });
  this[brokerSymbol].publish('event', `flow.${action}`, eventContent, {
    type: action
  });
};

SequenceFlow.prototype.createMessage = function createMessage(override) {
  return { ...override,
    id: this.id,
    type: this.type,
    name: this.name,
    sourceId: this.sourceId,
    targetId: this.targetId,
    isSequenceFlow: true,
    isDefault: this.isDefault,
    parent: (0, _messageHelper.cloneParent)(this.parent)
  };
};

SequenceFlow.prototype.getState = function getState() {
  const result = {
    id: this.id,
    type: this.type,
    name: this.name,
    sourceId: this.sourceId,
    targetId: this.targetId,
    isDefault: this.isDefault,
    counters: { ...this[countersSymbol]
    }
  };
  result.broker = this[brokerSymbol].getState();
  return result;
};

SequenceFlow.prototype.recover = function recover(state) {
  this[countersSymbol] = { ...this[countersSymbol],
    ...state.counters
  };
  this[brokerSymbol].recover(state.broker);
};

SequenceFlow.prototype.getApi = function getApi(message) {
  return (0, _Api.FlowApi)(this[brokerSymbol], message || {
    content: this.createMessage()
  });
};

SequenceFlow.prototype.stop = function stop() {
  this[brokerSymbol].stop();
};

SequenceFlow.prototype.shake = function shake(message) {
  const content = (0, _messageHelper.cloneContent)(message.content);
  content.sequence = content.sequence || [];
  content.sequence.push({
    id: this.id,
    type: this.type,
    isSequenceFlow: true,
    targetId: this.targetId
  });
  const broker = this[brokerSymbol];
  if (content.id === this.targetId) return broker.publish('event', 'flow.shake.loop', content, {
    persistent: false,
    type: 'shake'
  });

  for (const s of message.content.sequence) {
    if (s.id === this.id) return broker.publish('event', 'flow.shake.loop', content, {
      persistent: false,
      type: 'shake'
    });
  }

  broker.publish('event', 'flow.shake', content, {
    persistent: false,
    type: 'shake'
  });
};

SequenceFlow.prototype.evaluateCondition = function evaluateCondition(message, callback) {
  const condition = this.getCondition(message);
  if (!condition) return callback(null, true);
  return condition.execute(message, callback);
};

SequenceFlow.prototype.getCondition = function getCondition() {
  const conditionExpression = this.behaviour.conditionExpression;
  if (!conditionExpression) return null;
  const {
    language
  } = conditionExpression;
  const script = this.environment.getScript(language, this);

  if (script) {
    return ScriptCondition(this, script, language);
  }

  if (!conditionExpression.body) {
    const msg = language ? `Condition expression script ${language} is unsupported or was not registered` : 'Condition expression without body is unsupported';
    return this.emitFatal(new Error(msg), this.createMessage());
  }

  return ExpressionCondition(this, conditionExpression.body);
};

function ScriptCondition(flowApi, script, language) {
  return {
    language,

    execute(message, callback) {
      try {
        return script.execute((0, _ExecutionScope.default)(flowApi, message), callback);
      } catch (err) {
        if (!callback) throw err;
        flowApi.logger.error(`<${flowApi.id}>`, err);
        callback(err);
      }
    }

  };
}

function ExpressionCondition(flowApi, expression) {
  return {
    execute: (message, callback) => {
      const result = flowApi.environment.resolveExpression(expression, flowApi.createMessage(message));
      if (callback) return callback(null, result);
      return result;
    }
  };
}