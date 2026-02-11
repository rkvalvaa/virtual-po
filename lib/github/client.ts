import { query } from "@/lib/db/pool";

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  isPrivate: boolean;
  description: string | null;
  language: string | null;
  updatedAt: string;
}

export interface GitHubTreeEntry {
  path: string;
  size: number;
}

export async function getGitHubToken(
  userId: string
): Promise<string | null> {
  const result = await query<{ access_token: string }>(
    "SELECT access_token FROM accounts WHERE user_id = $1 AND provider = 'github' LIMIT 1",
    [userId]
  );
  return result.rows[0]?.access_token ?? null;
}

export async function getUserRepos(token: string): Promise<GitHubRepo[]> {
  const response = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();

  return data.map(
    (repo: Record<string, unknown>) => ({
      id: repo.id as number,
      name: repo.name as string,
      fullName: repo.full_name as string,
      owner: (repo.owner as Record<string, unknown>).login as string,
      defaultBranch: repo.default_branch as string,
      isPrivate: repo.private as boolean,
      description: (repo.description as string) ?? null,
      language: (repo.language as string) ?? null,
      updatedAt: repo.updated_at as string,
    })
  );
}

export async function getRepoTree(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubTreeEntry[]> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();

  return (data.tree as Record<string, unknown>[])
    .filter((entry) => entry.type === "blob")
    .map((entry) => ({
      path: entry.path as string,
      size: entry.size as number,
    }));
}

export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string | null> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (data.size > 100 * 1024) {
    return null;
  }

  if (data.encoding !== "base64" || typeof data.content !== "string") {
    return null;
  }

  return Buffer.from(data.content, "base64").toString("utf-8");
}
