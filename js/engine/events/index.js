// Registers every event type. Adding a type = one new file + one line here.
import { registerEventType } from '../registry.js';
import newOrders from './new-orders.js';
import callLight from './call-light.js';
import vitalsChange from './vitals-change.js';
import findingsChange from './findings-change.js';
import staffMessage from './staff-message.js';
import labResult from './lab-result.js';
import code from './code.js';
import admission from './admission.js';

[newOrders, callLight, vitalsChange, findingsChange, staffMessage, labResult, code, admission].forEach(registerEventType);
