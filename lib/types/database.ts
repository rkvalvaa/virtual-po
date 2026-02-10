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
  createdAt: Date;
}

export const INTEGRATION_TYPES = ['JIRA', 'LINEAR', 'GITHUB', 'SLACK', 'TEAMS', 'NOTION', 'CONFLUENCE'] as const;
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
