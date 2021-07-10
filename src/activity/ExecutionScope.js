import {cloneMessage} from '../messageHelper';
import {ActivityError, BpmnError} from '../error/Errors';

export default class ExecutionScope {
  constructor(activity, initMessage) {
    const {id, type, environment, logger} = activity;
    const {fields, content, properties} = cloneMessage(initMessage);

    this.id = id;
    this.type = type;
    this.fields = fields;
    this.content = content;
    this.properties = properties;
    this.environment = environment;
    this.logger = logger;
    this.ActivityError = ActivityError;
    this.BpmnError = BpmnError;
  }
  resolveExpression(expression) {
    return this.environment.resolveExpression(expression, this);
  }
}
