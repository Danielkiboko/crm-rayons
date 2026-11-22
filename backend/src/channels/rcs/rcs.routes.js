import { createChannelRouter } from '../channelFactory.js';
import { rcsService } from './rcs.service.js';

export const rcsRouter = createChannelRouter('rcs', rcsService);
