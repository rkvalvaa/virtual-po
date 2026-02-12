export interface LinearClientConfig {
  apiKey: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  state: { id: string; name: string } | null;
  priority: number;
  project: { id: string; name: string } | null;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearProject {
  id: string;
  name: string;
  url: string;
  state: string;
}

export interface LinearWorkflowState {
  id: string;
  name: string;
  type: string;
}

export function createLinearClient(config: LinearClientConfig) {
  const headers = {
    'Authorization': config.apiKey,
    'Content-Type': 'application/json',
  };

  async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Linear API error ${response.status}: ${body}`);
    }

    const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(`Linear GraphQL errors: ${json.errors.map(e => e.message).join(', ')}`);
    }
    if (!json.data) {
      throw new Error('Linear API returned no data');
    }
    return json.data;
  }

  return {
    async getTeams(): Promise<LinearTeam[]> {
      const data = await graphql<{ teams: { nodes: LinearTeam[] } }>(`
        query { teams { nodes { id name key } } }
      `);
      return data.teams.nodes;
    },

    async getProjects(teamId?: string): Promise<LinearProject[]> {
      if (teamId) {
        const data = await graphql<{ projects: { nodes: LinearProject[] } }>(`
          query($teamId: ID!) {
            projects(filter: { teams: { id: { eq: $teamId } } }) {
              nodes { id name url state }
            }
          }
        `, { teamId });
        return data.projects.nodes;
      }

      const data = await graphql<{ projects: { nodes: LinearProject[] } }>(`
        query { projects { nodes { id name url state } } }
      `);
      return data.projects.nodes;
    },

    async createIssue(
      teamId: string,
      title: string,
      description?: string,
      priority?: number
    ): Promise<LinearIssue> {
      const data = await graphql<{ issueCreate: { issue: LinearIssue } }>(`
        mutation($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            issue {
              id identifier title description url priority
              state { id name }
              project { id name }
            }
          }
        }
      `, {
        input: {
          teamId,
          title,
          description: description ?? undefined,
          priority: priority ?? 3,
        },
      });
      return data.issueCreate.issue;
    },

    async updateIssue(
      issueId: string,
      fields: {
        title?: string;
        description?: string;
        stateId?: string;
        priority?: number;
        projectId?: string;
      }
    ): Promise<LinearIssue> {
      const data = await graphql<{ issueUpdate: { issue: LinearIssue } }>(`
        mutation($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            issue {
              id identifier title description url priority
              state { id name }
              project { id name }
            }
          }
        }
      `, { id: issueId, input: fields });
      return data.issueUpdate.issue;
    },

    async getIssue(issueId: string): Promise<LinearIssue> {
      const data = await graphql<{ issue: LinearIssue }>(`
        query($id: String!) {
          issue(id: $id) {
            id identifier title description url priority
            state { id name }
            project { id name }
          }
        }
      `, { id: issueId });
      return data.issue;
    },

    async createProject(
      teamId: string,
      name: string,
      description?: string
    ): Promise<LinearProject> {
      const data = await graphql<{ projectCreate: { project: LinearProject } }>(`
        mutation($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            project { id name url state }
          }
        }
      `, {
        input: {
          name,
          description,
          teamIds: [teamId],
        },
      });
      return data.projectCreate.project;
    },

    async searchIssues(
      searchQuery: string,
      _teamId?: string,
      limit = 50
    ): Promise<LinearIssue[]> {
      const data = await graphql<{ issueSearch: { nodes: LinearIssue[] } }>(`
        query($query: String!, $first: Int) {
          issueSearch(query: $query, first: $first) {
            nodes {
              id identifier title description url priority
              state { id name }
              project { id name }
            }
          }
        }
      `, { query: searchQuery, first: limit });
      return data.issueSearch.nodes;
    },

    async getWorkflowStates(teamId: string): Promise<LinearWorkflowState[]> {
      const data = await graphql<{ workflowStates: { nodes: LinearWorkflowState[] } }>(`
        query($teamId: ID!) {
          workflowStates(filter: { team: { id: { eq: $teamId } } }) {
            nodes { id name type }
          }
        }
      `, { teamId });
      return data.workflowStates.nodes;
    },
  };
}

export function getLinearClientFromIntegration(
  integration: { config: Record<string, unknown> }
): ReturnType<typeof createLinearClient> {
  const { apiKey } = integration.config;
  if (typeof apiKey !== 'string') {
    throw new Error('Invalid Linear integration config: missing apiKey');
  }
  return createLinearClient({ apiKey });
}
