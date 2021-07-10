"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _messageHelper = require("../messageHelper");

var _Errors = require("../error/Errors");

class ExecutionScope {
  constructor(activity, initMessage) {
    const {
      id,
      type,
      environment,
      logger
    } = activity;
    const {
      fields,
      content,
      properties
    } = (0, _messageHelper.cloneMessage)(initMessage);
    this.id = id;
    this.type = type;
    this.fields = fields;
    this.content = content;
    this.properties = properties;
    this.environment = environment;
    this.logger = logger;
    this.ActivityError = _Errors.ActivityError;
    this.BpmnError = _Errors.BpmnError;
  }

  resolveExpression(expression) {
    return this.environment.resolveExpression(expression, this);
  }

}

exports.default = ExecutionScope;