import { query, transaction } from '@/lib/db/pool';
import { createConversation } from './conversations';

export async function createDraft(params: { orgId: string; userId: string; title: string; idempotencyKey: string }) {
  return transaction(async () => {
    const member = await query(`SELECT user_id FROM organization_users
      WHERE organization_id = $1 AND user_id = $2 FOR SHARE`, [params.orgId, params.userId]);
    if (!member.rows.length) throw new Error('Organization membership is required');
    const inserted = await query(`INSERT INTO feature_requests(organization_id, requester_id, title, creation_key)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (organization_id, requester_id, creation_key) WHERE creation_key IS NOT NULL DO NOTHING
      RETURNING id`, [params.orgId, params.userId, params.title, params.idempotencyKey]);
    if (inserted.rows.length) {
      const requestId = inserted.rows[0].id as string;
      const conversation = await createConversation(requestId, 'INTAKE');
      return { requestId, conversationId: conversation.id, created: true };
    }
    // A simultaneous insert waits for the winning transaction, including its
    // conversation. A retry observes the complete aggregate, never half a draft.
    const existing = await query(`SELECT r.id AS request_id, c.id AS conversation_id
      FROM feature_requests r JOIN conversations c ON c.request_id = r.id AND c.agent_type = 'INTAKE'
      WHERE r.organization_id = $1 AND r.requester_id = $2 AND r.creation_key = $3
      ORDER BY c.created_at LIMIT 1`, [params.orgId, params.userId, params.idempotencyKey]);
    if (!existing.rows[0]) throw new Error('Unable to restore the draft; retry');
    return { requestId: existing.rows[0].request_id as string,
      conversationId: existing.rows[0].conversation_id as string, created: false };
  });
}
