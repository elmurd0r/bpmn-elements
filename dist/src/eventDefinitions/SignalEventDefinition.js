"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = SignalEventDefinition;

var _messageHelper = require("../messageHelper");

var _getPropertyValue = _interopRequireDefault(require("../getPropertyValue"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function SignalEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    isThrowing
  } = activity;
  const {
    type,
    behaviour = {}
  } = eventDefinition;
  const {
    debug
  } = environment.Logger(type.toLowerCase());
  const reference = behaviour.signalRef || {};
  const source = {
    id,
    type,
    reference: { ...reference,
      referenceType: 'signal'
    },
    execute: isThrowing ? executeThrow : executeCatch
  };
  return source;

  function executeCatch(executeMessage) {
    let completed;
    const messageContent = (0, _messageHelper.cloneContent)(executeMessage.content);
    const {
      executionId,
      parent
    } = messageContent;
    const parentExecutionId = parent && parent.executionId;
    if (completed) return;
    broker.subscribeTmp('api', '*.signal.#', onSignalApiMessage, {
      noAck: true,
      consumerTag: `_api-signal-${executionId}`
    });
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`
    });
    const signalMessage = getSignal(executeMessage);
    debug(`<${executionId} (${id})>`, reference.id ? `waiting for signal <${reference.id}> with name: ${signalMessage.name}` : 'wait for anonymous signal event');
    broker.publish('event', 'activity.wait', { ...messageContent,
      executionId: parentExecutionId,
      parent: (0, _messageHelper.shiftParent)(parent),
      signal: { ...signalMessage
      }
    });

    function onSignalApiMessage(routingKey, message) {
      if ((0, _getPropertyValue.default)(message, 'content.message.id') !== signalMessage.id) return;
      completed = true;
      stop();
      return signal(routingKey, {
        message: message.content.message
      });
    }

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'signal':
          {
            return onSignalApiMessage(routingKey, message);
          }

        case 'discard':
          {
            completed = true;
            stop();
            return broker.publish('execution', 'execute.discard', { ...messageContent
            });
          }

        case 'stop':
          {
            stop();
            break;
          }
      }
    }

    function signal(_, {
      message
    }) {
      completed = true;
      debug(`<${executionId} (${id})>`, reference.id ? `signaled with <${reference.id}> named ${message.name}` : 'signaled with anaonymous signal');
      return broker.publish('execution', 'execute.completed', { ...messageContent,
        output: message,
        state: 'signal'
      });
    }

    function stop() {
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_api-signal-${executionId}`);
    }
  }

  function executeThrow(executeMessage) {
    const messageContent = (0, _messageHelper.cloneContent)(executeMessage.content);
    const {
      executionId,
      parent
    } = messageContent;
    const parentExecutionId = parent && parent.executionId;
    const signalMessage = getSignal(executeMessage);
    debug(`<${executionId} (${id})> throw signal <${reference.id}> named ${signalMessage.name}`);
    debug(`<${executionId} (${id})>`, reference.id ? `throw signal <${reference.id}> with name: ${signalMessage.name}` : 'throw anonymous signal');
    broker.publish('event', 'activity.signal', { ...(0, _messageHelper.cloneContent)(messageContent),
      executionId: parentExecutionId,
      parent: (0, _messageHelper.shiftParent)(parent),
      message: { ...signalMessage
      },
      state: 'throw'
    }, {
      type: 'signal',
      bubbles: true
    });
    return broker.publish('execution', 'execute.completed', { ...messageContent
    });
  }

  function getSignal(message) {
    const result = { ...reference
    };
    if (result.name) result.name = environment.resolveExpression(reference.name, message);
    return result;
  }
}