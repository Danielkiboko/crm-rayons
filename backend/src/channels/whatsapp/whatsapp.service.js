import { registerChannelService } from '../../core/channelRegistry.js';
import { executeChannelSingle, executeChannelCampaign } from '../channelHelpers.js';

export const whatsappService = {
  channel: 'whatsapp',

  async sendSingle({ tenantId, userEmail, payload }) {
    return executeChannelSingle({ tenantId, userEmail, channel: 'whatsapp', payload });
  },

  async launchCampaign({ tenantId, userEmail, payload }) {
    return executeChannelCampaign({ tenantId, userEmail, channel: 'whatsapp', payload });
  }
};

registerChannelService('whatsapp', whatsappService);
