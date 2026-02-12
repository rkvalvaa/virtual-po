export interface GitHubIssue {
  id: number;
  node_id: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels: Array<{ id: number; name: string; color: string }>;
  milestone: { id: number; title: string; number: number } | null;
  created_at: string;
  updated_at: string;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface GitHubMilestone {
  id: number;
  number: number;
  title: string;
  state: string;
  description: string | null;
}

export interface GitHubProject {
  id: string;
  title: string;
  number: number;
  shortDescription: string | null;
}

export interface GitHubIssueSearchResult {
  total_count: number;
  items: GitHubIssue[];
}

export function createGitHubIssuesClient(config: { token: string }) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${config.token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GitHub API error ${response.status} ${response.statusText} on ${options.method ?? 'GET'} ${url}: ${body}`
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub GraphQL error ${response.status}: ${body}`);
    }

    const result = await response.json() as { data: T; errors?: Array<{ message: string }> };

    if (result.errors?.length) {
      throw new Error(`GitHub GraphQL error: ${result.errors[0].message}`);
    }

    return result.data;
  }

  return {
    async createIssue(
      owner: string,
      repo: string,
      title: string,
      body?: string,
      labels?: string[]
    ): Promise<GitHubIssue> {
      return request<GitHubIssue>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
        {
          method: 'POST',
          body: JSON.stringify({ title, body: body ?? null, labels: labels ?? [] }),
        }
      );
    },

    async updateIssue(
      owner: string,
      repo: string,
      issueNumber: number,
      fields: { title?: string; body?: string; state?: 'open' | 'closed'; labels?: string[]; milestone?: number | null }
    ): Promise<GitHubIssue> {
      return request<GitHubIssue>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
        {
          method: 'PATCH',
          body: JSON.stringify(fields),
        }
      );
    },

    async getIssue(
      owner: string,
      repo: string,
      issueNumber: number
    ): Promise<GitHubIssue> {
      return request<GitHubIssue>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`
      );
    },

    async addLabels(
      owner: string,
      repo: string,
      issueNumber: number,
      labels: string[]
    ): Promise<GitHubLabel[]> {
      return request<GitHubLabel[]>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`,
        {
          method: 'POST',
          body: JSON.stringify({ labels }),
        }
      );
    },

    async listLabels(
      owner: string,
      repo: string
    ): Promise<GitHubLabel[]> {
      return request<GitHubLabel[]>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels?per_page=100`
      );
    },

    async listMilestones(
      owner: string,
      repo: string
    ): Promise<GitHubMilestone[]> {
      return request<GitHubMilestone[]>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones?per_page=100&state=open`
      );
    },

    async searchIssues(
      owner: string,
      repo: string,
      query: string
    ): Promise<GitHubIssueSearchResult> {
      const q = encodeURIComponent(`repo:${owner}/${repo} ${query}`);
      return request<GitHubIssueSearchResult>(
        `https://api.github.com/search/issues?q=${q}&per_page=50`
      );
    },

    async addIssueToProject(
      projectId: string,
      issueNodeId: string
    ): Promise<{ id: string }> {
      const result = await graphql<{
        addProjectV2ItemById: { item: { id: string } };
      }>(
        `mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
            item { id }
          }
        }`,
        { projectId, contentId: issueNodeId }
      );
      return result.addProjectV2ItemById.item;
    },

    async listProjects(
      owner: string
    ): Promise<GitHubProject[]> {
      // Try as organization first, fall back to user
      try {
        const result = await graphql<{
          organization: { projectsV2: { nodes: GitHubProject[] } };
        }>(
          `query($owner: String!) {
            organization(login: $owner) {
              projectsV2(first: 50) {
                nodes { id title number shortDescription }
              }
            }
          }`,
          { owner }
        );
        return result.organization.projectsV2.nodes;
      } catch {
        const result = await graphql<{
          user: { projectsV2: { nodes: GitHubProject[] } };
        }>(
          `query($owner: String!) {
            user(login: $owner) {
              projectsV2(first: 50) {
                nodes { id title number shortDescription }
              }
            }
          }`,
          { owner }
        );
        return result.user.projectsV2.nodes;
      }
    },
  };
}

export function getGitHubIssuesClientFromToken(
  token: string
): ReturnType<typeof createGitHubIssuesClient> {
  return createGitHubIssuesClient({ token });
}
