import { registerChannelService, getChannelService } from '../../core/channelRegistry.js';
import { executeChannelSingle, executeChannelCampaign } from '../channelHelpers.js';

export const rcsService = {
  channel: 'rcs',

  async sendSingle({ tenantId, userEmail, payload }) {
    const res = await executeChannelSingle({ tenantId, userEmail, channel: 'rcs', payload });
    // Interconnexion directe : si l'envoi RCS échoue et smsFallback est activé, bascule vers le backend SMS
    if (!res.ok && payload?.metadata?.smsFallback !== false) {
      try {
        const smsSvc = getChannelService('sms');
        const fallback = await smsSvc.sendSingle({
          tenantId,
          userEmail,
          payload: { ...payload, metadata: { ...(payload.metadata || {}), fallbackFrom: 'rcs' } }
        });
        return { ...fallback, fallbackUsed: 'sms' };
      } catch {
        return res;
      }
    }
    return res;
  },

  async launchCampaign({ tenantId, userEmail, payload }) {
    return executeChannelCampaign({ tenantId, userEmail, channel: 'rcs', payload });
  }
};

registerChannelService('rcs', rcsService);
