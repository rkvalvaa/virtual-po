// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { query } from '@/lib/db/pool';
import { createTestOrg, createTestUser, createTestRequest, cleanupTestOrg, hasDb } from '@/test/db-helpers';
const auth = vi.hoisted(() => ({ user: { id: '', orgId: '', role: 'ADMIN', name: 'Reviewer' } }));
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: auth.user }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { submitOutcome, submitActualComplexity } from '@/app/(dashboard)/requests/[id]/outcome-actions';
import { submitVote, removeVote } from '@/app/(dashboard)/requests/[id]/vote-actions';
import { updateCustomFields } from '@/app/(dashboard)/requests/[id]/actions';
import { setRequestArchived } from './archive';

describe.skipIf(!hasDb())('archived request mutation boundaries', () => {
  it('rejects foreign outcome IDs and archived outcomes, votes, and custom fields', async () => {
    const org = await createTestOrg('archive-mutations'), user = await createTestUser(org, 'ADMIN'), request = await createTestRequest(org, user);
    const foreign = await createTestOrg('foreign-outcome'), outsider = await createTestUser(foreign, 'ADMIN'), other = await createTestRequest(foreign, outsider);
    auth.user = { id: user.id, orgId: org.id, role: 'ADMIN', name: 'Reviewer' };
    const insertDecision = async (id: string, userId: string) => (await query("INSERT INTO decisions(request_id,user_id,decision,rationale) VALUES($1,$2,'APPROVE','Fixture') RETURNING id", [id, userId])).rows[0].id;
    try {
      const decision = await insertDecision(request.id, user.id), foreignDecision = await insertDecision(other.id, outsider.id);
      await expect(submitOutcome(foreignDecision, 'CORRECT')).rejects.toThrow(/not found|membership/);
      await expect(submitActualComplexity(other.id, 'M', 5)).rejects.toThrow(/not found|membership/);
      await setRequestArchived(request.id, org.id, user.id, true);
      for (const action of [() => submitOutcome(decision, 'CORRECT'), () => submitActualComplexity(request.id, 'M', 5),
        () => submitVote(request.id, 3, null), () => removeVote(request.id), () => updateCustomFields(request.id, {})]) {
        await expect(action()).rejects.toThrow(/archived|Restore/);
      }
      expect((await query('SELECT outcome FROM decisions WHERE id=ANY($1::uuid[])', [[decision, foreignDecision]])).rows.every(row => row.outcome === null)).toBe(true);
      expect((await query('SELECT id FROM stakeholder_votes WHERE request_id=$1', [request.id])).rowCount).toBe(0);
    } finally { await cleanupTestOrg(org, [user.id]); await cleanupTestOrg(foreign, [outsider.id]); }
  });
});
