import { registerChannelService } from '../../core/channelRegistry.js';
import { executeChannelSingle, executeChannelCampaign } from '../channelHelpers.js';

export const emailService = {
  channel: 'email',

  async sendSingle({ tenantId, userEmail, payload }) {
    return executeChannelSingle({ tenantId, userEmail, channel: 'email', payload });
  },

  async launchCampaign({ tenantId, userEmail, payload }) {
    return executeChannelCampaign({ tenantId, userEmail, channel: 'email', payload });
  }
};

registerChannelService('email', emailService);
