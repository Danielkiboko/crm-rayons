import { createChannelRouter } from '../channelFactory.js';
import { emailService } from './email.service.js';

export const emailRouter = createChannelRouter('email', emailService);
