// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { createAttachment } from '@/lib/db/queries/attachments';
import { createAssessmentTools } from '@/lib/agents/tools/assessment-tools';
import { beginAgentRun } from '@/lib/agents/runs';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';

describe.skipIf(!hasDb())('assessment document grounding', () => {
  it('requires reading selected documents and validated citations before saving', async () => {
    const org = await createTestOrg('cited-assessment'), user = await createTestUser(org, 'ADMIN'), request = await createTestRequest(org, user);
    const attachment = await createAttachment({ requestId: request.id, filename: 'evidence.txt', mimeType: 'text/plain', size: 8, url: 'https://unused.test', storageKey: 'fixture', uploadedBy: user.id });
    try {
      await query("INSERT INTO attachment_context(attachment_id,status,processing_token,extracted_text,content_hash,line_count) VALUES($1,'PROCESSED',gen_random_uuid(),'Evidence','hash',1)", [attachment.id]);
      await query("UPDATE feature_requests SET status='PENDING_ASSESSMENT',intake_complete=true WHERE id=$1", [request.id]);
      const run = await beginAgentRun({ requestId: request.id, orgId: org.id, userId: user.id, agent: 'assessment' });
      const tools = createAssessmentTools(request.id, org.id, user.id, run.id);
      const options = { toolCallId: 'document-test', messages: [] };
      const input = { businessScore: 50, technicalScore: 50, riskScore: 50, policyVersion: 0,
        scoringInputs: { reach: 5, impact: 1, confidence: 50, effort: 1 }, complexity: 'M' as const, assessmentData: { executive_summary: 'The document supports demand.' } };
      await expect(tools.save_assessment.execute!(input, options)).rejects.toThrow(/supporting documents/);
      expect(await tools.get_supporting_documents.execute!({}, options)).toMatchObject({ sources: [{ attachmentId: attachment.id, text: 'Evidence' }] });
      expect(JSON.stringify(await tools.get_supporting_documents.execute!({}, options))).not.toContain('"text":"Evidence"');
      await query('DELETE FROM attachment_context WHERE attachment_id=$1', [attachment.id]);
      await expect(tools.save_assessment.execute!(input, options)).rejects.toThrow(/supporting documents/);
      await query("INSERT INTO attachment_context(attachment_id,status,processing_token,extracted_text,content_hash,line_count) VALUES($1,'PROCESSED',gen_random_uuid(),'Evidence','hash',1)", [attachment.id]);
      await expect(tools.save_assessment.execute!({ ...input, citations: [{ attachmentId: attachment.id, startLine: 1, endLine: 2, claim: 'Demand exists' }] }, options)).rejects.toThrow(/line range/);
      await tools.save_assessment.execute!({ ...input, citations: [{ attachmentId: attachment.id, startLine: 1, endLine: 1, claim: 'Demand exists' }] }, options);
      const saved = await getFeatureRequestById(request.id);
      expect(saved?.assessmentData?.documentCitations).toMatchObject([{ attachmentId: attachment.id, filename: 'evidence.txt', claim: 'Demand exists' }]);
      expect(JSON.stringify(saved?.assessmentData?.documentSources)).not.toContain('Evidence');
    } finally { await cleanupTestOrg(org, [user.id]); }
  });
});
