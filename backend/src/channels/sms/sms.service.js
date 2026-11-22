import { q } from '../../db.js';
import { registerChannelService } from '../../core/channelRegistry.js';
import { executeChannelSingle, executeChannelCampaign } from '../channelHelpers.js';

export const smsService = {
  channel: 'sms',

  async getExtraOverview(tenantId) {
    const byOperator = await q(
      `SELECT COALESCE(operator, 'Passerelle Télécom Directe') AS operator,
              count(*)::int AS total,
              count(*) FILTER (WHERE status='delivered')::int AS delivered,
              COALESCE(sum(cost), 0)::float AS cost
       FROM messages
       WHERE tenant_id=$1 AND channel='sms' AND direction='out'
       GROUP BY operator
       ORDER BY total DESC`,
      [tenantId]
    );
    return { byOperator };
  },

  async sendSingle({ tenantId, userEmail, payload }) {
    return executeChannelSingle({ tenantId, userEmail, channel: 'sms', payload });
  },

  async launchCampaign({ tenantId, userEmail, payload }) {
    return executeChannelCampaign({ tenantId, userEmail, channel: 'sms', payload });
  }
};

registerChannelService('sms', smsService);
