import {cloneMessage} from './messageHelper';
import {getUniqueId} from './shared';

export {
  ActivityApi,
  DefinitionApi,
  ProcessApi,
  FlowApi,
  Api,
};

const brokerSymbol = Symbol.for('broker');
const messageSymbol = Symbol.for('message');
const prefixSymbol = Symbol.for('prefix');

function ActivityApi(broker, apiMessage, environment) {
  return new Api('activity', broker, apiMessage, environment);
}

function DefinitionApi(broker, apiMessage, environment) {
  return new Api('definition', broker, apiMessage, environment);
}

function ProcessApi(broker, apiMessage, environment) {
  return new Api('process', broker, apiMessage, environment);
}

function FlowApi(broker, apiMessage, environment) {
  return new Api('flow', broker, apiMessage, environment);
}

function Api(pfx, broker, sourceMessage, environment) {
  if (!sourceMessage) throw new Error('Api requires message');

  if (!(this instanceof Api)) {
    return new Api(pfx, broker, sourceMessage, environment);
  }

  const apiMessage = this[messageSymbol] = cloneMessage(sourceMessage);
  const apiContent = apiMessage.content;

  this[prefixSymbol] = pfx;
  this[brokerSymbol] = broker;

  this.id = apiContent.id;
  this.name = apiContent.name;
  this.type = apiContent.type;
  this.executionId = apiContent.executionId;
  this.environment = environment || broker.owner.environment;
  this.fields = apiMessage.fields;
  this.content = apiContent;
  this.messageProperties = apiMessage.properties;
}

Object.defineProperty(Api.prototype, 'owner', {
  enumerable: true,
  get() {
    return this[brokerSymbol].owner;
  },
});

Api.prototype.cancel = function cancel(message, options) {
  this.sendApiMessage('cancel', {message}, options);
};

Api.prototype.discard = function discard() {
  this.sendApiMessage('discard');
};

Api.prototype.signal = function signal(message, options) {
  this.sendApiMessage('signal', {message}, options);
};

Api.prototype.stop = function stop() {
  this.sendApiMessage('stop');
};

Api.prototype.resolveExpression = function resolveExpression(expression) {
  return this.environment.resolveExpression(expression, this[messageSymbol], this[brokerSymbol].owner);
};

Api.prototype.sendApiMessage = function sendApiMessage(action, content, options = {}) {
  const pfx = this[prefixSymbol];
  if (!options.correlationId) options = {...options, correlationId: getUniqueId(`${this.id || pfx}_signal`)};
  let key = `${pfx}.${action}`;
  if (this.executionId) key += `.${this.executionId}`;
  this[brokerSymbol].publish('api', key, this.createMessage(content), {...options, type: action});
};

Api.prototype.getPostponed = function getPostponed(...args) {
  const owner = this[brokerSymbol].owner;
  if (owner.getPostponed) return owner.getPostponed(...args);
  if (owner.isSubProcess && owner.execution) return owner.execution.getPostponed(...args);
  return [];
};

Api.prototype.createMessage = function createMessage(content = {}) {
  return {
    ...this.content,
    ...content,
  };
};

