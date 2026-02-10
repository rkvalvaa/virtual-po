# Virtual Product Owner (VPO)
## Product Requirements Document & Development Plan

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** December 2024  
**Open Source Project Name:** `vpo` (Virtual Product Owner)

---

## Executive Summary

Virtual Product Owner (VPO) is an AI-powered application that streamlines the feature request and prioritization process in software development organizations. It addresses the common bottleneck of the Product Owner role by providing intelligent intake forms, automated assessment, and structured output generation—while keeping humans in the loop for final decisions.

The application uses the Anthropic Agent SDK to create conversational, context-aware workflows that transform vague feature requests into well-structured epics and user stories, complete with prioritization recommendations based on business value, technical complexity, and strategic alignment.

---

## Problem Statement

### Current Pain Points

1. **PO Bottleneck**: Product Owners become overwhelmed with feature requests, creating delays in prioritization and planning
2. **Inconsistent Information Quality**: Stakeholders submit feature requests with varying levels of detail, often missing critical business justification
3. **Subjective Prioritization**: Without structured data, prioritization becomes opinion-based rather than value-driven
4. **Communication Gaps**: Disconnect between business stakeholders and development teams on requirements clarity
5. **Context Loss**: Historical decisions, technical constraints, and business priorities aren't consistently factored into new requests
6. **Manual Epic/Story Creation**: Converting requests into actionable work items is time-consuming and error-prone

### Solution

An AI-assisted workflow that:
- Guides stakeholders through comprehensive feature request intake
- Automatically assesses requests against business priorities and technical constraints
- Generates prioritization recommendations with transparent reasoning
- Creates structured epics, user stories, and acceptance criteria
- Facilitates async review and approval workflows
- Integrates with existing project management tools

---

## User Personas

### 1. Stakeholder (Feature Requester)
- **Role**: Business users, executives, customers, support team members
- **Goals**: Submit feature ideas efficiently, understand status, feel heard
- **Pain Points**: Unclear what information is needed, long wait times, lack of visibility

### 2. Virtual PO Agent
- **Role**: AI-powered assistant
- **Goals**: Gather complete information, assess objectively, generate quality outputs
- **Capabilities**: Conversational intake, document analysis, codebase awareness, priority modeling

### 3. Development Team Lead / Tech Lead
- **Role**: Reviews technical feasibility, estimates complexity
- **Goals**: Receive well-structured requirements, provide input on technical constraints
- **Pain Points**: Incomplete requirements, unrealistic expectations, context switching

### 4. Human Product Owner / Product Manager
- **Role**: Final decision maker, strategic oversight
- **Goals**: Efficient review process, data-driven decisions, stakeholder management
- **Pain Points**: Information overload, lack of structured data for decisions

### 5. Administrator
- **Role**: System configuration, integration management
- **Goals**: Customize workflows, manage integrations, maintain system
- **Pain Points**: Complex setup, integration maintenance

---

## Core Features

### Phase 1: Foundation (MVP)

#### 1.1 Authentication & User Management
- OAuth integration (Google, GitHub, Microsoft)
- Role-based access control (Stakeholder, Reviewer, Admin)
- Organization/workspace support
- User profile with notification preferences

#### 1.2 Intelligent Feature Request Intake
- **Conversational Agent Flow**: AI-guided questionnaire that adapts based on responses
- **Required Information Gathering**:
  - Problem statement (what pain point does this solve?)
  - Target users (who benefits?)
  - Business value proposition (why now? what's the impact?)
  - Success metrics (how do we measure success?)
  - Market context (competitive pressure, customer requests)
  - Urgency and timeline expectations
  - Dependencies and constraints
  - Supporting documentation uploads
- **Smart Follow-up Questions**: Agent asks clarifying questions until sufficient detail is captured
- **Quality Score**: Real-time indicator showing request completeness

#### 1.3 Request Assessment Engine
- **Business Value Analysis**:
  - Strategic alignment scoring
  - Market impact assessment
  - Revenue/cost impact estimation
  - Customer satisfaction impact
- **Technical Assessment**:
  - Complexity estimation (T-shirt sizing or story points)
  - Risk identification
  - Dependency mapping
  - Affected systems/components
- **Priority Recommendation**:
  - Weighted scoring model (configurable)
  - RICE, WSJF, or custom frameworks
  - Comparative analysis against backlog
  - Confidence level indicator

#### 1.4 Epic & User Story Generation
- **Auto-generated Artifacts**:
  - Epic with description, goals, and success criteria
  - User stories in standard format (As a... I want... So that...)
  - Acceptance criteria (Given/When/Then)
  - Technical notes and considerations
  - Suggested labels/tags
- **Refinement Loop**: Allow human editing with AI assistance

#### 1.5 Review & Approval Workflow
- **Status Lifecycle**: Draft → Under Review → Approved → In Backlog → Rejected
- **Review Dashboard**: Pending items with priority recommendations
- **Commenting System**: Threaded discussions on requests
- **Decision Recording**: Capture rationale for accept/reject/defer

#### 1.6 Basic Notifications
- Email notifications for status changes
- In-app notification center
- @mentions in comments

---

### Phase 2: Intelligence & Context

#### 2.1 Codebase Integration
- **Repository Connection**: GitHub/GitLab integration
- **Code Context Agent**: Understands system architecture, existing features
- **Impact Analysis**: Identifies affected modules, potential conflicts
- **Technical Debt Awareness**: Factors in related technical debt items

#### 2.2 Historical Learning
- **Decision Memory**: Learn from past prioritization decisions
- **Pattern Recognition**: Identify similar past requests
- **Estimation Calibration**: Improve estimates based on actuals

#### 2.3 Business Context Integration
- **OKR/Goal Alignment**: Connect to strategic objectives
- **Roadmap Awareness**: Understand planned initiatives
- **Resource Constraints**: Factor in team capacity

#### 2.4 Advanced Analytics Dashboard
- Request volume and trends
- Time-to-decision metrics
- Accuracy of estimates vs. actuals
- Stakeholder engagement metrics

---

### Phase 3: Integrations & Automation

#### 3.1 Project Management Integrations
- **Jira**: 
  - Create epics/stories directly
  - Sync status bidirectionally
  - Import existing backlog for context
- **Linear**:
  - Issue creation
  - Project/cycle mapping
  - Status sync
- **GitHub Issues/Projects**:
  - Issue creation
  - Project board integration

#### 3.2 Communication Integrations
- **Slack**:
  - Submit requests via Slack
  - Notifications and updates
  - Approval workflows
  - Daily/weekly digests
- **Microsoft Teams**:
  - Similar capabilities to Slack
  - Adaptive cards for rich interactions

#### 3.3 Document Integrations
- **Notion**: Import/export documentation
- **Confluence**: Link to related documentation
- **Google Docs**: Attach supporting materials

#### 3.4 Webhook & API
- Public API for custom integrations
- Webhook events for status changes
- Zapier/Make compatibility

---

## Technical Architecture

### Stack Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  Next.js 14+ (App Router) │ TypeScript │ Tailwind │ shadcn/ui  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Layer (Next.js)                        │
│  Route Handlers │ Server Actions │ tRPC (optional)              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Orchestration                         │
│           Anthropic Agent SDK │ Tool Definitions                │
└─────────────────────────────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Intake Agent   │  │ Assessment Agent │  │  Output Agent    │
│  (Questionnaire) │  │   (Analysis)     │  │ (Story Gen)      │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer                                │
│  PostgreSQL (Neon/Supabase) │ Prisma ORM │ Redis (optional)    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                            │
│  Jira │ Linear │ Slack │ GitHub │ Auth Provider                │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
vpo/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth routes
│   │   │   ├── login/
│   │   │   └── callback/
│   │   ├── (dashboard)/              # Main app routes
│   │   │   ├── requests/             # Feature request management
│   │   │   │   ├── new/              # New request flow
│   │   │   │   ├── [id]/             # Request detail view
│   │   │   │   └── page.tsx          # Request list
│   │   │   ├── review/               # Review queue
│   │   │   ├── backlog/              # Approved items
│   │   │   ├── analytics/            # Dashboard & metrics
│   │   │   └── settings/             # Configuration
│   │   ├── api/                      # API routes
│   │   │   ├── auth/
│   │   │   ├── requests/
│   │   │   ├── agents/               # Agent endpoints
│   │   │   ├── integrations/
│   │   │   └── webhooks/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn components
│   │   ├── chat/                     # Agent chat interface
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── InputArea.tsx
│   │   │   └── TypingIndicator.tsx
│   │   ├── requests/                 # Request-specific components
│   │   │   ├── RequestCard.tsx
│   │   │   ├── RequestDetail.tsx
│   │   │   ├── PriorityBadge.tsx
│   │   │   └── StatusBadge.tsx
│   │   ├── review/                   # Review components
│   │   ├── forms/                    # Form components
│   │   └── layout/                   # Layout components
│   │
│   ├── lib/
│   │   ├── agents/                   # Agent SDK integration
│   │   │   ├── client.ts             # Anthropic client setup
│   │   │   ├── intake-agent.ts       # Intake questionnaire agent
│   │   │   ├── assessment-agent.ts   # Assessment/scoring agent
│   │   │   ├── output-agent.ts       # Story generation agent
│   │   │   ├── tools/                # Agent tools
│   │   │   │   ├── database.ts       # DB query tools
│   │   │   │   ├── codebase.ts       # Code analysis tools
│   │   │   │   ├── integrations.ts   # External service tools
│   │   │   │   └── index.ts
│   │   │   └── prompts/              # System prompts
│   │   │       ├── intake.ts
│   │   │       ├── assessment.ts
│   │   │       └── output.ts
│   │   ├── db/
│   │   │   ├── schema.prisma
│   │   │   ├── client.ts
│   │   │   └── migrations/
│   │   ├── integrations/             # External service clients
│   │   │   ├── jira.ts
│   │   │   ├── linear.ts
│   │   │   ├── slack.ts
│   │   │   ├── github.ts
│   │   │   └── teams.ts
│   │   ├── auth/                     # Auth utilities
│   │   ├── utils/                    # Helper functions
│   │   └── types/                    # TypeScript types
│   │
│   ├── hooks/                        # React hooks
│   │   ├── useAgent.ts
│   │   ├── useRequest.ts
│   │   └── useRealtime.ts
│   │
│   └── config/                       # Configuration
│       ├── scoring.ts                # Priority scoring config
│       ├── workflows.ts              # Workflow definitions
│       └── integrations.ts           # Integration config
│
├── prisma/
│   └── schema.prisma
│
├── public/
├── docs/                             # Documentation
│   ├── CONTRIBUTING.md
│   ├── DEPLOYMENT.md
│   └── INTEGRATIONS.md
│
├── .env.example
├── .env.local
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── README.md
```

---

## Data Model

### Core Entities

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// ORGANIZATION & USERS
// ============================================

model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  settings    Json     @default("{}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  users       OrganizationUser[]
  requests    FeatureRequest[]
  priorities  PriorityConfig[]
  integrations Integration[]
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  avatarUrl     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  organizations OrganizationUser[]
  requests      FeatureRequest[]    @relation("Requester")
  assignments   FeatureRequest[]    @relation("Assignee")
  comments      Comment[]
  decisions     Decision[]
}

model OrganizationUser {
  id             String       @id @default(cuid())
  organizationId String
  userId         String
  role           UserRole     @default(STAKEHOLDER)
  createdAt      DateTime     @default(now())
  
  organization   Organization @relation(fields: [organizationId], references: [id])
  user           User         @relation(fields: [userId], references: [id])
  
  @@unique([organizationId, userId])
}

enum UserRole {
  STAKEHOLDER
  REVIEWER
  ADMIN
}

// ============================================
// FEATURE REQUESTS
// ============================================

model FeatureRequest {
  id             String        @id @default(cuid())
  organizationId String
  requesterId    String
  assigneeId     String?
  
  // Basic Info
  title          String
  summary        String        @db.Text
  status         RequestStatus @default(DRAFT)
  
  // Intake Data (from agent conversation)
  intakeData     Json          @default("{}")
  intakeComplete Boolean       @default(false)
  qualityScore   Float?
  
  // Assessment Data (from assessment agent)
  assessmentData Json?
  businessScore  Float?
  technicalScore Float?
  riskScore      Float?
  priorityScore  Float?
  complexity     Complexity?
  
  // Generated Outputs
  epic           Epic?
  
  // Metadata
  tags           String[]
  externalId     String?       // ID in external system (Jira, Linear)
  externalUrl    String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  
  // Relations
  organization   Organization  @relation(fields: [organizationId], references: [id])
  requester      User          @relation("Requester", fields: [requesterId], references: [id])
  assignee       User?         @relation("Assignee", fields: [assigneeId], references: [id])
  conversations  Conversation[]
  comments       Comment[]
  decisions      Decision[]
  attachments    Attachment[]
}

enum RequestStatus {
  DRAFT
  INTAKE_IN_PROGRESS
  PENDING_ASSESSMENT
  UNDER_REVIEW
  NEEDS_INFO
  APPROVED
  REJECTED
  DEFERRED
  IN_BACKLOG
  IN_PROGRESS
  COMPLETED
}

enum Complexity {
  XS
  S
  M
  L
  XL
  UNKNOWN
}

// ============================================
// AI CONVERSATIONS
// ============================================

model Conversation {
  id              String         @id @default(cuid())
  requestId       String
  agentType       AgentType
  status          ConvStatus     @default(ACTIVE)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  completedAt     DateTime?
  
  request         FeatureRequest @relation(fields: [requestId], references: [id])
  messages        Message[]
}

enum AgentType {
  INTAKE
  ASSESSMENT
  OUTPUT
  GENERAL
}

enum ConvStatus {
  ACTIVE
  COMPLETED
  ABANDONED
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  role           MessageRole
  content        String       @db.Text
  toolCalls      Json?
  toolResults    Json?
  createdAt      DateTime     @default(now())
  
  conversation   Conversation @relation(fields: [conversationId], references: [id])
}

enum MessageRole {
  USER
  ASSISTANT
  SYSTEM
  TOOL
}

// ============================================
// GENERATED OUTPUTS
// ============================================

model Epic {
  id            String         @id @default(cuid())
  requestId     String         @unique
  title         String
  description   String         @db.Text
  goals         String[]
  successCriteria String[]
  technicalNotes String?       @db.Text
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  
  request       FeatureRequest @relation(fields: [requestId], references: [id])
  stories       UserStory[]
}

model UserStory {
  id                String   @id @default(cuid())
  epicId            String
  title             String
  asA               String   // As a [user type]
  iWant             String   // I want [functionality]
  soThat            String   // So that [benefit]
  acceptanceCriteria String[] // Given/When/Then format
  technicalNotes    String?  @db.Text
  priority          Int      @default(0)
  storyPoints       Int?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  epic              Epic     @relation(fields: [epicId], references: [id])
}

// ============================================
// COLLABORATION
// ============================================

model Comment {
  id        String         @id @default(cuid())
  requestId String
  authorId  String
  content   String         @db.Text
  parentId  String?
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  
  request   FeatureRequest @relation(fields: [requestId], references: [id])
  author    User           @relation(fields: [authorId], references: [id])
  parent    Comment?       @relation("CommentReplies", fields: [parentId], references: [id])
  replies   Comment[]      @relation("CommentReplies")
}

model Decision {
  id        String         @id @default(cuid())
  requestId String
  userId    String
  decision  DecisionType
  rationale String         @db.Text
  createdAt DateTime       @default(now())
  
  request   FeatureRequest @relation(fields: [requestId], references: [id])
  user      User           @relation(fields: [userId], references: [id])
}

enum DecisionType {
  APPROVE
  REJECT
  DEFER
  REQUEST_INFO
}

model Attachment {
  id        String         @id @default(cuid())
  requestId String
  filename  String
  mimeType  String
  size      Int
  url       String
  createdAt DateTime       @default(now())
  
  request   FeatureRequest @relation(fields: [requestId], references: [id])
}

// ============================================
// CONFIGURATION
// ============================================

model PriorityConfig {
  id             String       @id @default(cuid())
  organizationId String
  name           String
  framework      String       // RICE, WSJF, Custom
  weights        Json         // Weight configuration
  isDefault      Boolean      @default(false)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  
  organization   Organization @relation(fields: [organizationId], references: [id])
}

model Integration {
  id             String       @id @default(cuid())
  organizationId String
  type           IntegrationType
  name           String
  config         Json         // Encrypted credentials and settings
  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  
  organization   Organization @relation(fields: [organizationId], references: [id])
}

enum IntegrationType {
  JIRA
  LINEAR
  GITHUB
  SLACK
  TEAMS
  NOTION
  CONFLUENCE
}
```

---

## Agent Design

### Agent Architecture Overview

VPO uses three specialized agents that work together:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   INTAKE AGENT  │────▶│ ASSESSMENT AGENT│────▶│  OUTPUT AGENT   │
│                 │     │                 │     │                 │
│ • Guided Q&A    │     │ • Business eval │     │ • Epic creation │
│ • Clarification │     │ • Tech analysis │     │ • Story writing │
│ • Quality check │     │ • Priority calc │     │ • AC generation │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 1. Intake Agent

**Purpose**: Guide stakeholders through comprehensive feature request submission

**System Prompt Structure**:
```typescript
// src/lib/agents/prompts/intake.ts

export const INTAKE_SYSTEM_PROMPT = `You are an expert Product Owner assistant helping stakeholders 
submit well-defined feature requests. Your goal is to gather all necessary information 
through a natural, conversational flow.

## Your Approach
- Be friendly and encouraging, not interrogative
- Ask one or two questions at a time
- Adapt follow-up questions based on previous answers
- Provide examples when stakeholders struggle to articulate needs
- Summarize understanding periodically to confirm accuracy

## Information to Gather

### 1. Problem Definition (Required)
- What problem or pain point does this solve?
- Who experiences this problem?
- How are they currently working around it?
- How frequently does this occur?

### 2. Proposed Solution (Required)
- What is the desired outcome?
- Any specific ideas on how this should work?
- Are there examples from other products?

### 3. Business Justification (Required)
- Why is this important now?
- What is the expected business impact?
  - Revenue impact (increase/protect)
  - Cost savings
  - Customer satisfaction
  - Competitive positioning
  - Risk mitigation
- How many users/customers would benefit?
- Are there customer commitments tied to this?

### 4. Success Metrics (Required)
- How will we know this is successful?
- What metrics should improve?
- What is the target improvement?

### 5. Context & Constraints (Optional but Valuable)
- Timeline expectations or deadlines
- Dependencies on other work
- Technical constraints known
- Compliance or security requirements
- Budget constraints

### 6. Supporting Information
- Relevant documentation
- Mockups or wireframes
- Customer feedback or support tickets
- Competitive analysis

## Quality Assessment
After gathering information, assess completeness:
- HIGH: All required sections thoroughly covered
- MEDIUM: Required sections covered but could use more detail
- LOW: Missing critical information

## Completion
When you have gathered sufficient information, summarize the complete request 
and confirm with the stakeholder before marking intake as complete.

Use the provided tools to save progress and check quality.`;
```

**Tools Available**:
```typescript
// src/lib/agents/tools/intake-tools.ts

export const intakeTools = [
  {
    name: "save_intake_progress",
    description: "Save the current state of gathered information",
    input_schema: {
      type: "object",
      properties: {
        requestId: { type: "string" },
        section: { 
          type: "string",
          enum: ["problem", "solution", "business", "metrics", "context", "supporting"]
        },
        data: { type: "object" },
        completeness: { type: "number", minimum: 0, maximum: 100 }
      },
      required: ["requestId", "section", "data"]
    }
  },
  {
    name: "check_quality_score",
    description: "Calculate the overall quality/completeness score of the request",
    input_schema: {
      type: "object",
      properties: {
        requestId: { type: "string" }
      },
      required: ["requestId"]
    }
  },
  {
    name: "mark_intake_complete",
    description: "Mark the intake process as complete and trigger assessment",
    input_schema: {
      type: "object",
      properties: {
        requestId: { type: "string" },
        summary: { type: "string" }
      },
      required: ["requestId", "summary"]
    }
  },
  {
    name: "get_similar_requests",
    description: "Find similar past requests for context",
    input_schema: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" } }
      },
      required: ["keywords"]
    }
  }
];
```

### 2. Assessment Agent

**Purpose**: Analyze completed requests and generate priority recommendations

**System Prompt Structure**:
```typescript
// src/lib/agents/prompts/assessment.ts

export const ASSESSMENT_SYSTEM_PROMPT = `You are an expert Product Owner analyst 
responsible for objectively assessing feature requests and providing priority recommendations.

## Assessment Framework

### Business Value Analysis (40% weight default)
Score 1-10 on each dimension:

1. **Strategic Alignment**: How well does this align with company OKRs/goals?
2. **Revenue Impact**: Direct or indirect revenue potential
3. **Customer Value**: Impact on customer satisfaction/retention
4. **Market Position**: Competitive advantage or necessity
5. **Risk Mitigation**: Does this address critical risks?

### Technical Assessment (30% weight default)
Score 1-10 on each dimension:

1. **Complexity**: Implementation difficulty (inverse scoring - lower complexity = higher score)
2. **Technical Debt**: Does this add or reduce debt?
3. **Architecture Fit**: How well does it fit current architecture?
4. **Reusability**: Can components be reused?
5. **Maintainability**: Long-term maintenance burden

### Effort Estimation
- XS: < 1 week
- S: 1-2 weeks
- M: 2-4 weeks
- L: 1-2 months
- XL: > 2 months

### Risk Analysis (30% weight default)
Identify and score risks:
- Technical risks
- Business risks
- Timeline risks
- Resource risks
- Dependency risks

## Priority Calculation

Use the configured framework (RICE, WSJF, or custom) to calculate final priority.

### RICE Framework
- Reach: How many users affected per quarter?
- Impact: 3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal
- Confidence: 100%=high, 80%=medium, 50%=low
- Effort: Person-months

RICE Score = (Reach × Impact × Confidence) / Effort

### WSJF Framework
- Business Value
- Time Criticality  
- Risk Reduction / Opportunity Enablement
- Job Size (inverse)

WSJF = (Business Value + Time Criticality + Risk Reduction) / Job Size

## Output Format

Provide a comprehensive assessment with:
1. Executive summary (2-3 sentences)
2. Detailed scores with rationale
3. Priority recommendation with confidence level
4. Risks and mitigations
5. Recommended next steps

Use the provided tools to access historical data and save assessments.`;
```

**Tools Available**:
```typescript
// src/lib/agents/tools/assessment-tools.ts

export const assessmentTools = [
  {
    name: "get_organization_context",
    description: "Retrieve organization OKRs, priorities, and configuration",
    input_schema: {
      type: "object",
      properties: {
        organizationId: { type: "string" }
      },
      required: ["organizationId"]
    }
  },
  {
    name: "get_current_backlog",
    description: "Retrieve current backlog for comparative analysis",
    input_schema: {
      type: "object",
      properties: {
        organizationId: { type: "string" },
        limit: { type: "number", default: 20 }
      },
      required: ["organizationId"]
    }
  },
  {
    name: "analyze_codebase_impact",
    description: "Analyze potential impact on codebase (if GitHub integrated)",
    input_schema: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" } },
        affectedAreas: { type: "array", items: { type: "string" } }
      },
      required: ["keywords"]
    }
  },
  {
    name: "get_historical_estimates",
    description: "Get accuracy of past estimates for calibration",
    input_schema: {
      type: "object",
      properties: {
        complexity: { type: "string" },
        category: { type: "string" }
      }
    }
  },
  {
    name: "save_assessment",
    description: "Save the complete assessment for a request",
    input_schema: {
      type: "object",
      properties: {
        requestId: { type: "string" },
        businessScore: { type: "number" },
        technicalScore: { type: "number" },
        riskScore: { type: "number" },
        complexity: { type: "string" },
        priorityScore: { type: "number" },
        framework: { type: "string" },
        rationale: { type: "string" },
        risks: { type: "array", items: { type: "object" } },
        recommendations: { type: "array", items: { type: "string" } }
      },
      required: ["requestId", "priorityScore", "complexity", "rationale"]
    }
  }
];
```

### 3. Output Agent

**Purpose**: Generate well-structured epics, user stories, and acceptance criteria

**System Prompt Structure**:
```typescript
// src/lib/agents/prompts/output.ts

export const OUTPUT_SYSTEM_PROMPT = `You are an expert at writing clear, actionable 
user stories and acceptance criteria. Your output will be used directly by development teams.

## Epic Structure

### Title
Clear, concise title describing the initiative

### Description
- Problem statement
- Proposed solution
- Expected outcomes
- Success metrics

### Goals
Bulleted list of specific goals this epic achieves

### Success Criteria
Measurable criteria for epic completion

### Technical Notes
Architecture considerations, dependencies, constraints

## User Story Format

### Title
[Action] [Object] - Brief description

### Story
As a [specific user type],
I want [specific functionality],
So that [specific benefit].

### Guidelines for Good Stories
- User type should be specific (not just "user")
- Functionality should be atomic and testable
- Benefit should tie to business value
- Each story should be independently deliverable

## Acceptance Criteria Format

Use Given/When/Then (Gherkin) format:

Given [precondition/context]
When [action/trigger]
Then [expected outcome]

### Guidelines for Good AC
- Be specific and measurable
- Cover happy path and edge cases
- Include error scenarios
- Avoid implementation details
- One behavior per criterion

## Story Sizing Guidelines

Based on complexity assessment, suggest story breakdown:
- XS: 1-2 stories
- S: 2-4 stories
- M: 4-8 stories
- L: 8-15 stories
- XL: Consider epic breakdown first

## Output Quality Checklist
Before finalizing, verify:
- [ ] Stories are independent
- [ ] Stories are negotiable (not too prescriptive)
- [ ] Stories are valuable to users
- [ ] Stories are estimable
- [ ] Stories are small enough
- [ ] Stories are testable

Use the provided tools to save generated outputs.`;
```

---

## API Design

### Core Endpoints

```typescript
// Feature Requests
POST   /api/requests                    // Create new request
GET    /api/requests                    // List requests (with filters)
GET    /api/requests/:id                // Get request details
PATCH  /api/requests/:id                // Update request
DELETE /api/requests/:id                // Delete request

// Agent Interactions
POST   /api/agents/intake/start         // Start intake conversation
POST   /api/agents/intake/message       // Send message to intake agent
POST   /api/agents/assess/:requestId    // Trigger assessment
POST   /api/agents/generate/:requestId  // Generate epic/stories

// Review & Decisions
GET    /api/review/queue                // Get review queue
POST   /api/review/:requestId/decision  // Submit decision
GET    /api/review/:requestId/history   // Get decision history

// Comments
POST   /api/requests/:id/comments       // Add comment
GET    /api/requests/:id/comments       // Get comments

// Integrations
POST   /api/integrations/:type/connect  // Connect integration
POST   /api/integrations/:type/sync     // Sync with external system
DELETE /api/integrations/:type          // Disconnect integration

// Webhooks
POST   /api/webhooks/jira               // Jira webhook receiver
POST   /api/webhooks/linear             // Linear webhook receiver
POST   /api/webhooks/slack              // Slack events receiver
```

### Example: Agent Message Endpoint

```typescript
// src/app/api/agents/intake/message/route.ts

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { intakeTools } from '@/lib/agents/tools/intake-tools';
import { INTAKE_SYSTEM_PROMPT } from '@/lib/agents/prompts/intake';
import { processToolCall } from '@/lib/agents/tools/processor';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { conversationId, message } = await req.json();
  
  // Get conversation history
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: 'asc' } } }
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Save user message
  await db.message.create({
    data: {
      conversationId,
      role: 'USER',
      content: message
    }
  });

  // Build message history for Claude
  const messages = conversation.messages.map(m => ({
    role: m.role.toLowerCase() as 'user' | 'assistant',
    content: m.content
  }));
  messages.push({ role: 'user', content: message });

  // Call Claude with tools
  let response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: INTAKE_SYSTEM_PROMPT,
    tools: intakeTools,
    messages
  });

  // Handle tool use loop
  while (response.stop_reason === 'tool_use') {
    const toolUseBlock = response.content.find(
      block => block.type === 'tool_use'
    );
    
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') break;

    const toolResult = await processToolCall(
      toolUseBlock.name,
      toolUseBlock.input,
      { conversationId, requestId: conversation.requestId }
    );

    messages.push({ 
      role: 'assistant', 
      content: response.content 
    });
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseBlock.id,
        content: JSON.stringify(toolResult)
      }]
    });

    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: INTAKE_SYSTEM_PROMPT,
      tools: intakeTools,
      messages
    });
  }

  // Extract text response
  const textContent = response.content.find(block => block.type === 'text');
  const assistantMessage = textContent?.type === 'text' ? textContent.text : '';

  // Save assistant response
  await db.message.create({
    data: {
      conversationId,
      role: 'ASSISTANT',
      content: assistantMessage
    }
  });

  return NextResponse.json({
    message: assistantMessage,
    conversationId
  });
}
```

---

## UI/UX Design Guidelines

### Design Principles

1. **Progressive Disclosure**: Show complexity only when needed
2. **Conversation-First**: Agent interactions feel natural, not form-like
3. **Status Clarity**: Always clear where a request is in the workflow
4. **Actionable Insights**: AI recommendations are clear and actionable
5. **Human Control**: Easy to override AI suggestions

### Key Screens

#### 1. New Request Flow
- Chat interface with intake agent
- Side panel showing progress/completeness
- Ability to upload attachments mid-conversation
- Quality score indicator

#### 2. Request Detail View
- Header with status, priority badge, assignee
- Tabs: Overview | Assessment | Epic & Stories | Discussion | History
- Action buttons based on current status

#### 3. Review Queue
- Kanban or list view of pending reviews
- Filters by priority, requester, date
- Bulk actions for similar requests
- Quick preview without leaving list

#### 4. Analytics Dashboard
- Request volume trends
- Average time-to-decision
- Priority distribution
- Requester activity

---

## Development Phases

### Phase 1: Foundation (Weeks 1-4)

**Week 1: Project Setup**
- [ ] Initialize Next.js project with TypeScript
- [ ] Set up Tailwind CSS and shadcn/ui
- [ ] Configure Prisma with PostgreSQL
- [ ] Set up authentication (NextAuth.js)
- [ ] Create basic layout and navigation

**Week 2: Core Data Model**
- [ ] Implement Prisma schema
- [ ] Create database migrations
- [ ] Build CRUD API routes for requests
- [ ] Implement basic request list/detail views

**Week 3: Intake Agent**
- [ ] Set up Anthropic SDK integration
- [ ] Implement intake system prompt
- [ ] Build chat interface component
- [ ] Create intake tools and handlers
- [ ] Store conversation history

**Week 4: Assessment & Output**
- [ ] Implement assessment agent
- [ ] Build assessment tools
- [ ] Create output generation agent
- [ ] Build epic/story display components
- [ ] Implement status workflow

### Phase 2: Polish & Collaboration (Weeks 5-6)

**Week 5: Review Workflow**
- [ ] Build review queue interface
- [ ] Implement decision recording
- [ ] Create comment system
- [ ] Add notification system

**Week 6: UX Polish**
- [ ] Refine chat experience
- [ ] Add loading states and error handling
- [ ] Implement responsive design
- [ ] Add keyboard shortcuts
- [ ] Write end-to-end tests

### Phase 3: Integrations (Weeks 7-8)

**Week 7: Jira & Linear**
- [ ] Jira OAuth flow
- [ ] Jira issue creation
- [ ] Linear OAuth flow
- [ ] Linear issue creation

**Week 8: Communication**
- [ ] Slack app setup
- [ ] Slack notifications
- [ ] Optional: Teams integration
- [ ] Webhook infrastructure

### Phase 4: Open Source Prep (Week 9)

- [ ] Write comprehensive README
- [ ] Create deployment documentation
- [ ] Add contribution guidelines
- [ ] Set up GitHub Actions CI/CD
- [ ] Create demo environment
- [ ] License selection (MIT recommended)

---

## Configuration & Customization

### Environment Variables

```env
# .env.example

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/vpo"

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"

# OAuth Providers
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

# Anthropic
ANTHROPIC_API_KEY=""

# Integrations (optional)
JIRA_CLIENT_ID=""
JIRA_CLIENT_SECRET=""
LINEAR_API_KEY=""
SLACK_CLIENT_ID=""
SLACK_CLIENT_SECRET=""
SLACK_SIGNING_SECRET=""

# Feature Flags
ENABLE_CODEBASE_ANALYSIS="false"
ENABLE_SLACK_INTEGRATION="false"
ENABLE_JIRA_INTEGRATION="false"
```

### Scoring Configuration

```typescript
// src/config/scoring.ts

export interface ScoringConfig {
  framework: 'RICE' | 'WSJF' | 'CUSTOM';
  weights: {
    business: number;
    technical: number;
    risk: number;
  };
  thresholds: {
    highPriority: number;
    mediumPriority: number;
  };
}

export const defaultScoringConfig: ScoringConfig = {
  framework: 'RICE',
  weights: {
    business: 0.4,
    technical: 0.3,
    risk: 0.3
  },
  thresholds: {
    highPriority: 75,
    mediumPriority: 50
  }
};
```

---

## Open Source Considerations

### Repository Structure

```
vpo/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── release.yml
│   └── CODEOWNERS
├── docs/
│   ├── getting-started.md
│   ├── deployment.md
│   ├── configuration.md
│   ├── integrations/
│   │   ├── jira.md
│   │   ├── linear.md
│   │   └── slack.md
│   └── contributing.md
├── LICENSE (MIT)
├── README.md
├── CHANGELOG.md
└── SECURITY.md
```

### README Sections

1. Overview and features
2. Quick start guide
3. Screenshots/demo
4. Configuration options
5. Deployment guides (Vercel, Railway, Docker)
6. Integration setup
7. Contributing guidelines
8. Roadmap
9. License

### Community Building

- Create Discord or GitHub Discussions
- Write launch blog post
- Submit to Hacker News, Reddit, relevant communities
- Create demo video
- Prepare Product Hunt launch

---

## Success Metrics

### Product Metrics

1. **Intake Quality**: % of requests with quality score > 80%
2. **Time to First Decision**: Average time from submission to decision
3. **Stakeholder Satisfaction**: NPS from requesters
4. **Accuracy**: % of priority predictions aligned with final decisions
5. **Adoption**: Active users / total users

### Technical Metrics

1. **Response Time**: P95 latency for agent responses < 3s
2. **Availability**: 99.9% uptime
3. **Error Rate**: < 0.1% failed requests

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AI generates poor quality output | Medium | High | Human review required; feedback loops for improvement |
| Stakeholders don't adopt | Medium | High | Focus on UX; show clear value; provide training |
| Integration complexity | High | Medium | Start with one integration; modular design |
| API costs | Medium | Medium | Implement caching; use appropriate model sizes |
| Data privacy concerns | Medium | High | Clear data policies; on-premise option |

---

## Future Roadmap (Post-MVP)

### v1.1 - Intelligence
- Machine learning on decision patterns
- Improved estimation accuracy
- Smart duplicate detection

### v1.2 - Collaboration
- Real-time collaboration on requests
- Video/voice recording for context
- Stakeholder voting/ranking

### v1.3 - Enterprise
- SAML/SSO support
- Audit logging
- Custom deployment options
- Advanced analytics

### v2.0 - Ecosystem
- Marketplace for custom agents
- Plugin architecture
- Multi-product support
- AI-assisted roadmap planning

---

## Getting Started (For Development)

```bash
# Clone the repository
git clone https://github.com/your-org/vpo.git
cd vpo

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your values

# Set up database
npx prisma generate
npx prisma db push

# Run development server
npm run dev
```

---

## Appendix

### A. Example Intake Conversation

**Agent**: Hi! I'm here to help you submit a feature request. Let's start with the basics—what problem are you trying to solve?

**User**: Our customers keep asking for dark mode.

**Agent**: Dark mode is a popular request! To help prioritize this effectively, I need to understand more about the impact. Can you tell me:
1. How many customers have requested this?
2. Have any customers mentioned it as a blocker for their adoption?

**User**: About 50 tickets in the last quarter. Two enterprise prospects mentioned it's on their requirements list.

**Agent**: That's helpful context—50 support tickets suggests significant demand, and enterprise prospects with it on their requirements list indicates potential revenue impact.

Let's dig into the business case. If we built dark mode:
- What's the estimated deal size for those enterprise prospects?
- Do you believe it would reduce support tickets?

*[Conversation continues until all required information is gathered]*

### B. Example Assessment Output

```json
{
  "summary": "Dark mode feature has strong business justification with clear customer demand and potential enterprise revenue. Medium technical complexity with well-understood implementation patterns.",
  "scores": {
    "business": {
      "strategicAlignment": 7,
      "revenueImpact": 8,
      "customerValue": 8,
      "marketPosition": 6,
      "riskMitigation": 5,
      "overall": 7.2
    },
    "technical": {
      "complexity": 6,
      "technicalDebt": 7,
      "architectureFit": 8,
      "reusability": 7,
      "maintainability": 7,
      "overall": 7.0
    },
    "risk": {
      "overall": 7.5,
      "factors": [
        {"type": "technical", "description": "CSS variable implementation across legacy components", "severity": "medium"},
        {"type": "timeline", "description": "Q4 deadline pressure from sales", "severity": "medium"}
      ]
    }
  },
  "complexity": "M",
  "priorityScore": 78,
  "framework": "RICE",
  "recommendation": "HIGH PRIORITY - Schedule for next sprint planning",
  "confidence": 0.85
}
```

### C. Example Generated User Story

**Epic**: Dark Mode Support

**Story: Enable dark mode toggle**

As a **user who prefers dark interfaces**,
I want **to toggle between light and dark color themes**,
So that **I can use the application comfortably in low-light environments and reduce eye strain**.

**Acceptance Criteria:**

1. Given I am on any page of the application
   When I click the theme toggle in the navigation
   Then the interface should switch to dark mode within 200ms

2. Given I have selected dark mode
   When I close and reopen the application
   Then my theme preference should be preserved

3. Given I am using dark mode
   When I view any page including modals and dropdowns
   Then all UI elements should use the dark color palette with sufficient contrast (WCAG AA)

4. Given I am on a page with user-generated content
   When dark mode is active
   Then the content should remain readable with appropriate background treatment

**Technical Notes:**
- Implement using CSS custom properties
- Store preference in localStorage and user profile
- Consider system preference detection (`prefers-color-scheme`)
- Audit all components for hardcoded colors

---

*This PRD is a living document. Update as requirements evolve.*
