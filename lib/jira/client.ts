export interface JiraClientConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: unknown;
    status?: { name: string };
    issuetype?: { name: string };
    project?: { key: string };
    [key: string]: unknown;
  };
}

export function createJiraClient(config: JiraClientConfig) {
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  const headers: Record<string, string> = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  const baseUrl = config.baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${baseUrl}/rest/api/3${path}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Jira API error ${response.status} ${response.statusText} on ${options.method ?? 'GET'} ${path}: ${body}`
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return {
    async createIssue(
      projectKey: string,
      issueType: string,
      summary: string,
      description?: string,
      extraFields?: Record<string, unknown>
    ): Promise<JiraIssue> {
      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        issuetype: { name: issueType },
        summary,
        ...extraFields,
      };

      if (description) {
        fields.description = textToAdf(description);
      }

      const created = await request<{ id: string; key: string; self: string }>('/issue', {
        method: 'POST',
        body: JSON.stringify({ fields }),
      });

      return request<JiraIssue>(`/issue/${created.key}`);
    },

    async updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void> {
      await request<void>(`/issue/${encodeURIComponent(issueKey)}`, {
        method: 'PUT',
        body: JSON.stringify({ fields }),
      });
    },

    async getIssue(issueKey: string): Promise<JiraIssue> {
      return request<JiraIssue>(`/issue/${encodeURIComponent(issueKey)}`);
    },

    async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
      await request<void>(`/issue/${encodeURIComponent(issueKey)}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ transition: { id: transitionId } }),
      });
    },

    async getTransitions(issueKey: string): Promise<Array<{ id: string; name: string }>> {
      const result = await request<{ transitions: Array<{ id: string; name: string }> }>(
        `/issue/${encodeURIComponent(issueKey)}/transitions`
      );
      return result.transitions;
    },

    async searchIssues(jql: string, maxResults = 50): Promise<{ issues: JiraIssue[]; total: number }> {
      return request<{ issues: JiraIssue[]; total: number }>('/search', {
        method: 'POST',
        body: JSON.stringify({ jql, maxResults }),
      });
    },

    async getProjects(): Promise<Array<{ id: string; key: string; name: string }>> {
      return request<Array<{ id: string; key: string; name: string }>>('/project');
    },
  };
}

/**
 * Convert plain text to Jira Atlassian Document Format (ADF).
 * Splits on double newlines for paragraphs.
 */
export function textToAdf(text: string) {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);

  return {
    version: 1,
    type: 'doc',
    content: paragraphs.map((para) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: para.replace(/\n/g, ' ') }],
    })),
  };
}

/**
 * Create a JiraClient from an Integration record's config.
 * Expects config to have baseUrl, email, and apiToken.
 */
export function getJiraClientFromIntegration(
  integration: { config: Record<string, unknown> }
): ReturnType<typeof createJiraClient> {
  const { baseUrl, email, apiToken } = integration.config;

  if (typeof baseUrl !== 'string' || typeof email !== 'string' || typeof apiToken !== 'string') {
    throw new Error('Invalid Jira integration config: missing baseUrl, email, or apiToken');
  }

  return createJiraClient({ baseUrl, email, apiToken });
}
