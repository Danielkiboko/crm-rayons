import { createChannelRouter } from '../channelFactory.js';
import { whatsappService } from './whatsapp.service.js';

export const whatsappRouter = createChannelRouter('whatsapp', whatsappService);
