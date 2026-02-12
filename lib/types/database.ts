// Request status lifecycle
export const REQUEST_STATUSES = [
  'DRAFT',
  'INTAKE_IN_PROGRESS',
  'PENDING_ASSESSMENT',
  'UNDER_REVIEW',
  'NEEDS_INFO',
  'APPROVED',
  'REJECTED',
  'DEFERRED',
  'IN_BACKLOG',
  'IN_PROGRESS',
  'COMPLETED',
] as const;

export type RequestStatus = typeof REQUEST_STATUSES[number];

export const COMPLEXITY_VALUES = ['XS', 'S', 'M', 'L', 'XL', 'UNKNOWN'] as const;
export type Complexity = typeof COMPLEXITY_VALUES[number];

export const USER_ROLES = ['STAKEHOLDER', 'REVIEWER', 'ADMIN'] as const;
export type UserRole = typeof USER_ROLES[number];

export const AGENT_TYPES = ['INTAKE', 'ASSESSMENT', 'OUTPUT', 'GENERAL'] as const;
export type AgentType = typeof AGENT_TYPES[number];

export const DECISION_TYPES = ['APPROVE', 'REJECT', 'DEFER', 'REQUEST_INFO'] as const;
export type DecisionType = typeof DECISION_TYPES[number];

export const DECISION_OUTCOMES = ['CORRECT', 'INCORRECT', 'PARTIALLY_CORRECT', 'PENDING'] as const;
export type DecisionOutcome = typeof DECISION_OUTCOMES[number];

// Database row types (camelCase mapped from snake_case)
export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationUser {
  id: string;
  organizationId: string;
  userId: string;
  role: UserRole;
  createdAt: Date;
}

export interface FeatureRequest {
  id: string;
  organizationId: string;
  requesterId: string;
  assigneeId: string | null;
  title: string;
  summary: string | null;
  status: RequestStatus;
  intakeData: Record<string, unknown>;
  intakeComplete: boolean;
  qualityScore: number | null;
  assessmentData: Record<string, unknown> | null;
  businessScore: number | null;
  technicalScore: number | null;
  riskScore: number | null;
  priorityScore: number | null;
  complexity: Complexity | null;
  tags: string[];
  externalId: string | null;
  externalUrl: string | null;
  actualComplexity: Complexity | null;
  actualEffortDays: number | null;
  lessonsLearned: string | null;
  jiraIssueKey: string | null;
  jiraIssueUrl: string | null;
  linearIssueId: string | null;
  linearIssueUrl: string | null;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  requestId: string;
  agentType: AgentType;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  toolCalls: unknown | null;
  toolResults: unknown | null;
  createdAt: Date;
}

export interface Epic {
  id: string;
  requestId: string;
  title: string;
  description: string | null;
  goals: string[];
  successCriteria: string[];
  technicalNotes: string | null;
  jiraEpicKey: string | null;
  jiraEpicUrl: string | null;
  linearProjectId: string | null;
  linearProjectUrl: string | null;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStory {
  id: string;
  epicId: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  technicalNotes: string | null;
  priority: number;
  storyPoints: number | null;
  jiraStoryKey: string | null;
  jiraStoryUrl: string | null;
  linearIssueId: string | null;
  linearIssueUrl: string | null;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  requestId: string;
  authorId: string;
  content: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Decision {
  id: string;
  requestId: string;
  userId: string;
  decision: DecisionType;
  rationale: string;
  outcome: DecisionOutcome | null;
  outcomeNotes: string | null;
  outcomeRecordedAt: Date | null;
  createdAt: Date;
}

export const OKR_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type OkrStatus = typeof OKR_STATUSES[number];

export interface Objective {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  timeFrame: string;
  status: OkrStatus;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamCapacity {
  id: string;
  organizationId: string;
  quarter: string;
  totalCapacityDays: number;
  allocatedDays: number;
  notes: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const INTEGRATION_TYPES = ['JIRA', 'LINEAR', 'GITHUB', 'GITHUB_ISSUES', 'SLACK', 'TEAMS', 'NOTION', 'CONFLUENCE'] as const;
export type IntegrationType = typeof INTEGRATION_TYPES[number];

export interface Attachment {
  id: string;
  requestId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: Date;
}

export interface PriorityConfig {
  id: string;
  organizationId: string;
  name: string;
  framework: string;
  weights: Record<string, number>;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Integration {
  id: string;
  organizationId: string;
  type: IntegrationType;
  name: string;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Repository {
  id: string;
  organizationId: string;
  githubRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isActive: boolean;
  connectedBy: string | null;
  connectedAt: Date;
  updatedAt: Date;
}

export interface RequestSimilarity {
  id: string;
  sourceRequestId: string;
  similarRequestId: string;
  similarityScore: number;
  matchReasons: string[];
  createdAt: Date;
}

export const JIRA_SYNC_DIRECTIONS = ['PUSH', 'PULL'] as const;
export type JiraSyncDirection = typeof JIRA_SYNC_DIRECTIONS[number];

export const JIRA_SYNC_STATUSES = ['SUCCESS', 'FAILED', 'PENDING'] as const;
export type JiraSyncStatus = typeof JIRA_SYNC_STATUSES[number];

export const JIRA_SYNC_ENTITY_TYPES = ['FEATURE_REQUEST', 'EPIC', 'STORY'] as const;
export type JiraSyncEntityType = typeof JIRA_SYNC_ENTITY_TYPES[number];

export interface JiraSyncLog {
  id: string;
  organizationId: string;
  entityType: JiraSyncEntityType;
  entityId: string;
  jiraKey: string;
  syncDirection: JiraSyncDirection;
  syncStatus: JiraSyncStatus;
  errorMessage: string | null;
  syncedAt: Date;
}

export interface LinearSyncLog {
  id: string;
  organizationId: string;
  entityType: JiraSyncEntityType;
  entityId: string;
  linearId: string;
  syncDirection: JiraSyncDirection;
  syncStatus: JiraSyncStatus;
  errorMessage: string | null;
  syncedAt: Date;
}

export const GITHUB_SYNC_DIRECTIONS = ['PUSH', 'PULL'] as const;
export type GitHubSyncDirection = typeof GITHUB_SYNC_DIRECTIONS[number];

export const GITHUB_SYNC_STATUSES = ['SUCCESS', 'FAILED', 'PENDING'] as const;
export type GitHubSyncStatus = typeof GITHUB_SYNC_STATUSES[number];

export const GITHUB_SYNC_ENTITY_TYPES = ['FEATURE_REQUEST', 'EPIC', 'STORY'] as const;
export type GitHubSyncEntityType = typeof GITHUB_SYNC_ENTITY_TYPES[number];

export interface GitHubSyncLog {
  id: string;
  organizationId: string;
  entityType: GitHubSyncEntityType;
  entityId: string;
  githubIssueNumber: number | null;
  syncDirection: GitHubSyncDirection;
  syncStatus: GitHubSyncStatus;
  errorMessage: string | null;
  syncedAt: Date;
}

export const API_KEY_SCOPES = ['read', 'write', 'admin'] as const;
export type ApiKeyScope = typeof API_KEY_SCOPES[number];

export const WEBHOOK_EVENTS = [
  'request.created',
  'request.updated',
  'request.status_changed',
  'assessment.completed',
  'decision.made',
  'epic.created',
  'story.created',
] as const;
export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

export interface ApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookSubscription {
  id: string;
  organizationId: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  isActive: boolean;
  lastTriggeredAt: Date | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export const SLACK_EVENT_TYPES = ['REQUEST_CREATED', 'STATUS_CHANGED', 'DECISION_MADE', 'ASSESSMENT_COMPLETE', 'REVIEW_NEEDED'] as const;
export type SlackEventType = typeof SLACK_EVENT_TYPES[number];

export interface SlackNotification {
  id: string;
  organizationId: string;
  channelId: string;
  channelName: string;
  eventType: SlackEventType;
  isActive: boolean;
  createdAt: Date;
}
