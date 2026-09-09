import { getEpicByRequestId, getStoriesByEpicId } from '@/lib/db/queries/epics';
import type { ExportInput, ExportInputItem, ExternalItem } from './durable';

export async function exportContent(requestId: string, orgId: string, provider: ExportInput['provider']): Promise<ExportInputItem[]> {
  const epic = await getEpicByRequestId(requestId, orgId);
  if (!epic) throw new Error('No epic found for this request.');
  const stories = await getStoriesByEpicId(epic.id, { requestId, orgId });
  function existing(id: string | number | null, url: string | null): ExternalItem | undefined { return id && url ? { id: String(id), url } : undefined; }
  return [{ entityId: epic.id, kind: 'EPIC', title: epic.title,
    body: [epic.description, '## Goals', ...epic.goals.map(g => `- ${g}`), '## Success criteria', ...epic.successCriteria.map(c => `- ${c}`), '## Technical notes', epic.technicalNotes ?? 'None'].join('\n\n'),
    existing: provider === 'LINEAR' ? existing(epic.linearProjectId, epic.linearProjectUrl) : provider === 'JIRA' ? existing(epic.jiraEpicKey, epic.jiraEpicUrl) : existing(epic.githubIssueNumber, epic.githubIssueUrl),
  }, ...stories.map((story, index): ExportInputItem => ({ entityId: story.id, kind: 'STORY', title: story.title,
    body: [`As ${story.asA}, I want ${story.iWant}, so that ${story.soThat}`, '## Acceptance criteria', ...story.acceptanceCriteria.map(c => `- [ ] ${c}`), '## Technical notes', story.technicalNotes ?? 'None', `Story points: ${story.storyPoints ?? 'Unestimated'}`, `Priority order: ${index + 1}`].join('\n\n'),
    existing: provider === 'LINEAR' ? existing(story.linearIssueId, story.linearIssueUrl) : provider === 'JIRA' ? existing(story.jiraStoryKey, story.jiraStoryUrl) : existing(story.githubIssueNumber, story.githubIssueUrl),
  }))];
}

export const exportMarker = (id: string) => `vpo-export-${id}`;
