import { runExport, type ExportInput, type ExportItem, type ExternalItem } from './durable';
import { exportContent, exportMarker } from './content';
import type { createLinearClient } from '@/lib/linear/client';
import type { createJiraClient } from '@/lib/jira/client';
import type { createGitHubIssuesClient, GitHubIssue } from '@/lib/github/issues-client';
import { updateEpicLinearKeys, updateStoryLinearKeys } from '@/lib/db/queries/linear-sync';
import { updateEpicJiraKeys, updateStoryJiraKeys } from '@/lib/db/queries/jira-sync';
import { updateEpicGitHubKeys, updateStoryGitHubKeys } from '@/lib/db/queries/github-sync';

type Scope = Pick<ExportInput, 'requestId' | 'orgId' | 'userId'>;
const body = (item: ExportItem) => `${item.body}\n\nExport reference: ${exportMarker(item.id)}`;

export async function exportLinear(scope: Scope, teamId: string, client: ReturnType<typeof createLinearClient>) {
  return runExport({ ...scope, provider: 'LINEAR', destination: teamId, items: () => exportContent(scope.requestId, scope.orgId, 'LINEAR') }, {
    create: async item => item.kind === 'EPIC'
      ? client.createProject(teamId, item.title, body(item), item.id)
      : client.createIssue(teamId, item.title, body(item), undefined, item.id),
    recover: async item => item.kind === 'EPIC' ? client.getProject(item.id) : client.getIssue(item.id),
    finish: async (item, parent) => {
      const external = item.external!;
      // Persist identity before linking. A link failure must never create a second issue.
      if (item.kind === 'EPIC') await updateEpicLinearKeys(item.entityId, external.id, external.url, scope);
      else {
        await updateStoryLinearKeys(item.entityId, external.id, external.url, scope);
        await client.updateIssue(external.id, { projectId: parent!.id });
      }
    },
  });
}

export async function exportJira(scope: Scope, projectKey: string, baseUrl: string, client: ReturnType<typeof createJiraClient>) {
  const external = (key: string): ExternalItem => ({ id: key, url: `${baseUrl.replace(/\/$/, '')}/browse/${key}` });
  return runExport({ ...scope, provider: 'JIRA', destination: JSON.stringify([baseUrl, projectKey]), items: () => exportContent(scope.requestId, scope.orgId, 'JIRA') }, {
    create: async (item, parent) => {
      const issue = await client.createIssue(projectKey, item.kind === 'EPIC' ? 'Epic' : 'Story', item.title, body(item),
        { labels: [exportMarker(item.id)], ...(item.kind === 'STORY' ? { parent: { key: parent!.id } } : {}) });
      return external(issue.key);
    },
    recover: async item => {
      // A stable exact label is recoverable even if the creation response was lost.
      const found = await client.searchIssues(`project = ${JSON.stringify(projectKey)} AND labels = ${JSON.stringify(exportMarker(item.id))}`, 2);
      if (found.issues.length > 1) throw new Error('Multiple tracker items have this export reference. Resolve them in Jira before retrying.');
      return found.issues[0] ? external(found.issues[0].key) : null;
    },
    finish: async item => {
      const value = item.external!;
      await (item.kind === 'EPIC' ? updateEpicJiraKeys : updateStoryJiraKeys)(item.entityId, value.id, value.url, scope);
    },
  });
}

export async function exportGitHub(scope: Scope, owner: string, repo: string, projectId: string | undefined, client: ReturnType<typeof createGitHubIssuesClient>) {
  const external = (issue: GitHubIssue): ExternalItem => ({ id: String(issue.number), url: issue.html_url, nodeId: issue.node_id });
  return runExport({ ...scope, provider: 'GITHUB_ISSUES', destination: JSON.stringify([owner, repo, projectId || null]), items: () => exportContent(scope.requestId, scope.orgId, 'GITHUB_ISSUES') }, {
    create: async (item, parent) => external(await client.createIssue(owner, repo, item.title,
      body(item) + (item.kind === 'STORY' ? `\n\nPart of epic #${parent!.id}` : ''), [item.kind === 'EPIC' ? 'epic' : 'user-story'])),
    recover: async item => {
      const issue = await client.findExport(owner, repo, exportMarker(item.id));
      return issue ? external(issue) : null;
    },
    finish: async item => {
      const value = item.external!;
      await (item.kind === 'EPIC' ? updateEpicGitHubKeys : updateStoryGitHubKeys)(item.entityId, Number(value.id), value.url, scope);
      if (projectId) {
        const nodeId = value.nodeId ?? (await client.getIssue(owner, repo, Number(value.id))).node_id;
        await client.addIssueToProject(projectId, nodeId);
      }
    },
  });
}
