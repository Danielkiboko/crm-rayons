import { createChannelRouter } from '../channelFactory.js';
import { smsService } from './sms.service.js';

export const smsRouter = createChannelRouter('sms', smsService);
