# Anthropic Agent SDK Research

**Date:** February 2026
**Researcher:** SDK Research Agent
**Status:** Complete

---

## Executive Summary

Since the PRD was written in December 2024, Anthropic has released a **dedicated Agent SDK** (`@anthropic-ai/claude-agent-sdk`) that is entirely separate from the base client SDK (`@anthropic-ai/sdk`). This new SDK fundamentally changes how agents should be built -- it provides a built-in agent loop, tool execution, multi-agent orchestration, streaming, session management, and MCP integration out of the box. The PRD's approach of manual `messages.create()` calls with hand-rolled `while (response.stop_reason === 'tool_use')` loops is now obsolete.

**However**, there is a critical architectural consideration: the Claude Agent SDK is designed for **server-side autonomous agents** (CI/CD, automation, code editing), not for **web application conversational UIs** like our VPO project. For a Next.js web app with streaming chat, the **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`) is the better fit. The two SDKs serve different use cases.

**Recommendation:** Use the **Vercel AI SDK v6** for the VPO application's conversational agent layer (streaming chat, tool calling, multi-step loops in API routes, React hooks for the UI), with the Anthropic base SDK (`@anthropic-ai/sdk`) available as a fallback for any edge cases. The Claude Agent SDK is best reserved for backend automation tasks, not interactive web UIs.

---

## 1. Current State of Anthropic SDKs

### 1.1 Base Client SDK: `@anthropic-ai/sdk`

- **Package:** `@anthropic-ai/sdk`
- **Repository:** https://github.com/anthropics/anthropic-sdk-typescript
- **Purpose:** Direct API access to Claude models (messages.create, streaming, tool definitions)
- **Status:** Actively maintained, production-stable
- **Key API:** `client.messages.create()` and `client.messages.stream()`

This is what the PRD currently references. It provides low-level API access where **you implement the tool loop yourself**.

### 1.2 Claude Agent SDK: `@anthropic-ai/claude-agent-sdk`

- **Package:** `@anthropic-ai/claude-agent-sdk`
- **Repository:** https://github.com/anthropics/claude-agent-sdk-typescript
- **NPM:** https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk
- **Documentation:** https://platform.claude.com/docs/en/agent-sdk/overview
- **Purpose:** Build autonomous AI agents with built-in tool execution, agent loop, and context management
- **Status:** Production-ready (was renamed from "Claude Code SDK" to "Claude Agent SDK")
- **Stability:** V1 API is stable; V2 interface is in unstable preview

This is the infrastructure behind Claude Code, exposed as a library. It handles **everything automatically**: the agent loop, tool execution, context management, retries.

### 1.3 Vercel AI SDK: `ai` + `@ai-sdk/anthropic`

- **Packages:** `ai`, `@ai-sdk/react`, `@ai-sdk/anthropic`
- **Repository:** https://github.com/vercel/ai
- **Documentation:** https://ai-sdk.dev
- **Purpose:** Build AI-powered web applications with streaming, React hooks, and multi-provider support
- **Status:** AI SDK v6 released (production-ready), 20M+ monthly downloads
- **Key Feature:** Native Next.js App Router integration with `useChat` hook

---

## 2. Claude Agent SDK -- Deep Dive

### 2.1 Core Architecture

The Agent SDK's primary function is `query()`, which creates an async generator that streams messages as the agent works:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    permissionMode: "acceptEdits"
  }
})) {
  if (message.type === "assistant") {
    // Claude's reasoning and tool calls
  }
  if ("result" in message) {
    // Final result
    console.log(message.result);
  }
}
```

**Key difference from PRD approach:** No manual tool loop. The SDK handles tool execution, context management, and retries internally.

### 2.2 Built-in Tools

The SDK includes pre-built tools that execute automatically:

| Tool | What it does |
|------|--------------|
| **Read** | Read any file |
| **Write** | Create new files |
| **Edit** | Make precise edits to existing files |
| **Bash** | Run terminal commands |
| **Glob** | Find files by pattern |
| **Grep** | Search file contents with regex |
| **WebSearch** | Search the web |
| **WebFetch** | Fetch and parse web pages |
| **AskUserQuestion** | Ask users clarifying questions |
| **Task** | Spawn subagents |
| **NotebookEdit** | Edit Jupyter notebooks |
| **TodoWrite** | Track task progress |

### 2.3 Custom Tools via MCP

Custom tools are defined using the `tool()` function with Zod schemas and `createSdkMcpServer()`:

```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const customServer = createSdkMcpServer({
  name: "vpo-tools",
  version: "1.0.0",
  tools: [
    tool(
      "save_intake_progress",
      "Save the current state of gathered information",
      {
        requestId: z.string(),
        section: z.enum(["problem", "solution", "business", "metrics", "context"]),
        data: z.record(z.any()),
        completeness: z.number().min(0).max(100)
      },
      async (args) => {
        // Save to database
        await db.featureRequest.update({
          where: { id: args.requestId },
          data: { intakeData: args.data }
        });
        return {
          content: [{ type: "text", text: `Saved ${args.section} data` }]
        };
      }
    )
  ]
});

// Use in query
for await (const message of query({
  prompt: generateMessages(), // Must use async generator for MCP
  options: {
    mcpServers: { "vpo-tools": customServer },
    allowedTools: ["mcp__vpo-tools__save_intake_progress"]
  }
})) {
  // handle messages
}
```

**Tool name format:** `mcp__{server_name}__{tool_name}`

**Important:** Custom MCP tools require streaming input mode (async generator), not a simple string prompt.

### 2.4 Multi-Agent Orchestration (Subagents)

The SDK supports spawning specialized subagents:

```typescript
for await (const message of query({
  prompt: "Assess this feature request for priority and generate stories",
  options: {
    allowedTools: ["Read", "Grep", "Glob", "Task"],
    agents: {
      "intake-agent": {
        description: "Guides stakeholders through feature request intake.",
        prompt: "You are an expert Product Owner assistant...",
        tools: ["Read", "Grep", "Glob"],
        model: "sonnet"
      },
      "assessment-agent": {
        description: "Analyzes requests and generates priority recommendations.",
        prompt: "You are an expert Product Owner analyst...",
        tools: ["Read", "Grep", "Glob"],
        model: "sonnet"
      },
      "output-agent": {
        description: "Generates epics, user stories, and acceptance criteria.",
        prompt: "You are an expert at writing user stories...",
        tools: ["Read", "Grep", "Glob"],
        model: "sonnet"
      }
    }
  }
})) {
  // Messages include parent_tool_use_id to track subagent context
}
```

**Key subagent properties:**
- `description` (required): When to use this agent
- `prompt` (required): The agent's system prompt
- `tools` (optional): Restricted tool set (inherits all if omitted)
- `model` (optional): `'sonnet' | 'opus' | 'haiku' | 'inherit'`

**Limitations:** Subagents cannot spawn their own subagents (no nesting).

### 2.5 Session Management

Sessions maintain context across multiple exchanges:

```typescript
let sessionId: string | undefined;

// First query
for await (const message of query({
  prompt: "Read the authentication module",
  options: { allowedTools: ["Read", "Glob"] }
})) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
  }
}

// Resume with full context
for await (const message of query({
  prompt: "Now find all places that call it",
  options: { resume: sessionId }
})) {
  if ("result" in message) console.log(message.result);
}
```

### 2.6 V2 Interface (Preview)

A simplified session-based API is available (unstable):

```typescript
import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";

await using session = unstable_v2_createSession({
  model: "claude-opus-4-6"
});

// Turn 1
await session.send("What is the feature about?");
for await (const msg of session.stream()) {
  // handle response
}

// Turn 2 (maintains context)
await session.send("Now assess its priority");
for await (const msg of session.stream()) {
  // handle response
}
```

### 2.7 Permission Modes

| Mode | Behavior | Use case |
|------|----------|----------|
| `default` | Requires `canUseTool` callback | Custom approval flows |
| `acceptEdits` | Auto-approves file edits | Trusted development |
| `bypassPermissions` | No prompts | CI/CD automation |
| `plan` | Planning mode, no execution | Plan review |

### 2.8 Hooks System

```typescript
const logFileChange: HookCallback = async (input) => {
  const filePath = (input as any).tool_input?.file_path ?? "unknown";
  appendFileSync("./audit.log", `${new Date().toISOString()}: ${filePath}\n`);
  return {};
};

for await (const message of query({
  prompt: "Refactor the module",
  options: {
    hooks: {
      PostToolUse: [{ matcher: "Edit|Write", hooks: [logFileChange] }]
    }
  }
})) { /* ... */ }
```

Available hooks: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PermissionRequest`.

### 2.9 Key Options (Full Reference)

| Option | Type | Description |
|--------|------|-------------|
| `allowedTools` | `string[]` | List of allowed tool names |
| `disallowedTools` | `string[]` | List of disallowed tool names |
| `agents` | `Record<string, AgentDefinition>` | Subagent definitions |
| `mcpServers` | `Record<string, McpServerConfig>` | MCP server configurations |
| `systemPrompt` | `string` | Custom system prompt |
| `model` | `string` | Claude model to use |
| `maxTurns` | `number` | Maximum conversation turns |
| `maxBudgetUsd` | `number` | Maximum budget in USD |
| `maxThinkingTokens` | `number` | Max tokens for thinking |
| `permissionMode` | `PermissionMode` | Permission handling |
| `cwd` | `string` | Working directory |
| `resume` | `string` | Session ID to resume |
| `includePartialMessages` | `boolean` | Stream partial messages |
| `hooks` | `Record<HookEvent, HookCallbackMatcher[]>` | Lifecycle hooks |
| `outputFormat` | `{ type: 'json_schema', schema: JSONSchema }` | Structured output |
| `sandbox` | `SandboxSettings` | Sandbox configuration |
| `betas` | `SdkBeta[]` | Beta features (e.g., 1M context) |

---

## 3. Vercel AI SDK -- The Web Application Alternative

### 3.1 Why Vercel AI SDK for VPO

The Vercel AI SDK is purpose-built for what VPO needs:

1. **Streaming chat UI** with React hooks (`useChat`)
2. **Next.js App Router** integration (API routes, Server Components)
3. **Tool calling with automatic loop** (`stopWhen: stepCountIs(N)`)
4. **Multi-provider support** (can switch between Claude models easily)
5. **Production-tested** (20M+ monthly downloads)
6. **AI SDK v6** introduces the `Agent` abstraction

### 3.2 API Route Pattern (Replaces PRD's Manual Loop)

```typescript
// src/app/api/agents/intake/message/route.ts
import { streamText, tool, stepCountIs, UIMessage, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-5-20250929"),
    system: INTAKE_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5), // Auto tool-use loop up to 5 steps
    tools: {
      save_intake_progress: tool({
        description: "Save the current state of gathered information",
        parameters: z.object({
          requestId: z.string(),
          section: z.enum(["problem", "solution", "business", "metrics", "context"]),
          data: z.record(z.any()),
          completeness: z.number().min(0).max(100)
        }),
        execute: async ({ requestId, section, data, completeness }) => {
          await db.featureRequest.update({
            where: { id: requestId },
            data: { intakeData: data, qualityScore: completeness }
          });
          return { saved: true, section, completeness };
        }
      }),
      check_quality_score: tool({
        description: "Calculate the overall quality/completeness score",
        parameters: z.object({
          requestId: z.string()
        }),
        execute: async ({ requestId }) => {
          const request = await db.featureRequest.findUnique({
            where: { id: requestId }
          });
          return { qualityScore: request?.qualityScore ?? 0 };
        }
      }),
      mark_intake_complete: tool({
        description: "Mark intake as complete and trigger assessment",
        parameters: z.object({
          requestId: z.string(),
          summary: z.string()
        }),
        execute: async ({ requestId, summary }) => {
          await db.featureRequest.update({
            where: { id: requestId },
            data: { intakeComplete: true, summary, status: "PENDING_ASSESSMENT" }
          });
          return { completed: true };
        }
      })
    }
  });

  return result.toUIMessageStreamResponse();
}
```

### 3.3 React Chat Component

```typescript
// src/components/chat/ChatWindow.tsx
"use client";

import { useChat } from "@ai-sdk/react";

export function ChatWindow({ requestId }: { requestId: string }) {
  const { messages, sendMessage, isLoading } = useChat({
    api: "/api/agents/intake/message",
    body: { requestId }
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map((message) => (
          <div key={message.id} className={
            message.role === "user" ? "text-right" : "text-left"
          }>
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return <p key={i}>{part.text}</p>;
              }
              // Handle tool invocation displays if needed
              return null;
            })}
          </div>
        ))}
      </div>

      <form onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.querySelector("input");
        if (input?.value) {
          sendMessage({ text: input.value });
          input.value = "";
        }
      }}>
        <input
          type="text"
          placeholder="Describe your feature request..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}
```

### 3.4 AI SDK v6 Agent Abstraction

```typescript
// src/lib/agents/intake-agent.ts
import { Agent, ToolLoopAgent } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export const intakeAgent = new ToolLoopAgent({
  model: anthropic("claude-sonnet-4-5-20250929"),
  system: INTAKE_SYSTEM_PROMPT,
  tools: { /* tool definitions */ },
  maxSteps: 10
});

// Usage in route handler:
const result = await intakeAgent.stream(messages);
return result.toUIMessageStreamResponse();
```

---

## 4. Key Differences from PRD Approach

### 4.1 What the PRD Does (December 2024)

```typescript
// PRD approach: manual tool loop with base SDK
const client = new Anthropic();

let response = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  system: INTAKE_SYSTEM_PROMPT,
  tools: intakeTools,       // Raw JSON tool definitions
  messages
});

// Manual tool use loop
while (response.stop_reason === "tool_use") {
  const toolUseBlock = response.content.find(b => b.type === "tool_use");
  const toolResult = await processToolCall(toolUseBlock.name, toolUseBlock.input);
  messages.push({ role: "assistant", content: response.content });
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolUseBlock.id, content: JSON.stringify(toolResult) }]
  });
  response = await client.messages.create({ /* same params */ });
}
```

### 4.2 What Has Changed

| Aspect | PRD (Dec 2024) | Claude Agent SDK | Vercel AI SDK |
|--------|---------------|------------------|---------------|
| **Package** | `@anthropic-ai/sdk` | `@anthropic-ai/claude-agent-sdk` | `ai` + `@ai-sdk/anthropic` |
| **Tool loop** | Manual `while` loop | Automatic via `query()` | Automatic via `stepCountIs()` |
| **Tool definitions** | Raw JSON `input_schema` | Zod schemas + `tool()` | Zod schemas + `tool()` |
| **Streaming** | Manual `client.messages.stream()` | Built-in via async generator | Built-in `streamText()` |
| **Multi-agent** | Not supported | Built-in subagents | Manual (multiple routes) |
| **Session mgmt** | Manual DB storage | Built-in sessions | Via `useChat` state |
| **React integration** | None | None (server-side only) | `useChat`, `useCompletion` hooks |
| **Next.js integration** | Manual API routes | Not designed for web apps | Native App Router support |
| **Permission system** | Manual | Built-in modes | N/A (you control server-side) |
| **Best for** | Low-level API access | Autonomous server agents | Web application chat UIs |

### 4.3 Tool Definition Comparison

**PRD (raw JSON):**
```typescript
{
  name: "save_intake_progress",
  description: "Save the current state of gathered information",
  input_schema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
      section: { type: "string", enum: ["problem", "solution", "business"] },
      data: { type: "object" }
    },
    required: ["requestId", "section", "data"]
  }
}
```

**Modern (Zod + type safety):**
```typescript
tool({
  description: "Save the current state of gathered information",
  parameters: z.object({
    requestId: z.string(),
    section: z.enum(["problem", "solution", "business"]),
    data: z.record(z.any())
  }),
  execute: async (args) => {
    // args is fully typed!
    await db.featureRequest.update({ where: { id: args.requestId }, data: { intakeData: args.data } });
    return { saved: true };
  }
})
```

---

## 5. Recommended Approach for VPO

### 5.1 Architecture Decision

**Use the Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`) as the primary agent framework because:

1. **VPO is a web application** -- it needs streaming chat UI, React hooks, and Next.js API route integration
2. **The Claude Agent SDK** is designed for server-side autonomous tasks (code editing, file manipulation, CI/CD), not for conversational web UIs
3. **Vercel AI SDK v6** provides the `Agent` abstraction with automatic tool loops, Zod-based tool definitions, and streaming -- everything the PRD needs without the manual loop
4. **Native Next.js App Router support** with `streamText()` + `toUIMessageStreamResponse()` + `useChat()`

### 5.2 Recommended Package Stack

```json
{
  "dependencies": {
    "ai": "^6.x",
    "@ai-sdk/react": "^2.x",
    "@ai-sdk/anthropic": "^3.x",
    "zod": "^3.24",
    "next": "^15.x"
  }
}
```

### 5.3 Recommended Architecture

```
src/
  lib/
    agents/
      intake-agent.ts       # Agent definition + tools (Vercel AI SDK)
      assessment-agent.ts   # Agent definition + tools
      output-agent.ts       # Agent definition + tools
      tools/
        database.ts         # DB-backed tool implementations
        integrations.ts     # External service tools
      prompts/
        intake.ts           # System prompts (unchanged from PRD)
        assessment.ts
        output.ts
  app/
    api/
      agents/
        intake/
          message/route.ts  # streamText() + tool definitions
        assess/
          [requestId]/route.ts
        generate/
          [requestId]/route.ts
  components/
    chat/
      ChatWindow.tsx        # useChat() hook
```

### 5.4 When to Use Each SDK

| Use Case | SDK |
|----------|-----|
| Conversational chat (intake agent) | Vercel AI SDK |
| Streaming responses to browser | Vercel AI SDK |
| Tool execution in API routes | Vercel AI SDK |
| Background assessment processing | Vercel AI SDK or base Anthropic SDK |
| Autonomous code analysis (Phase 2) | Claude Agent SDK |
| CI/CD integrations | Claude Agent SDK |
| Codebase impact analysis (Phase 2) | Claude Agent SDK |

### 5.5 Migration Path from PRD

1. **Replace** `@anthropic-ai/sdk` with `ai` + `@ai-sdk/anthropic` for all agent routes
2. **Remove** manual `while (response.stop_reason === 'tool_use')` loops
3. **Convert** JSON `input_schema` tool definitions to Zod schemas with `tool()`
4. **Replace** manual message history management with `useChat()` state management
5. **Replace** `client.messages.create()` calls with `streamText()` + `toUIMessageStreamResponse()`
6. **Keep** system prompts largely unchanged (they are model-agnostic)
7. **Keep** the multi-agent architecture concept (intake -> assessment -> output) but implement as separate API routes rather than subagents

---

## 6. Alternative Consideration: Hybrid Approach

For Phase 2 features (codebase integration, impact analysis), consider using the Claude Agent SDK alongside the Vercel AI SDK:

```typescript
// Phase 2: Codebase analysis using Claude Agent SDK
import { query } from "@anthropic-ai/claude-agent-sdk";

export async function analyzeCodebaseImpact(keywords: string[]) {
  const results: string[] = [];

  for await (const message of query({
    prompt: `Analyze the codebase for impact related to: ${keywords.join(", ")}`,
    options: {
      allowedTools: ["Read", "Grep", "Glob"],
      permissionMode: "bypassPermissions",
      maxTurns: 10,
      cwd: "/path/to/connected/repo"
    }
  })) {
    if ("result" in message) {
      results.push(message.result);
    }
  }

  return results.join("\n");
}
```

This hybrid approach uses:
- **Vercel AI SDK** for all user-facing conversational interactions
- **Claude Agent SDK** for backend autonomous tasks that need file system access

---

## 7. Security and Compliance Notes

- The Claude Agent SDK supports sandbox mode for command execution
- The Vercel AI SDK runs tool execution server-side (in API routes), keeping secrets safe
- Both SDKs support environment-variable-based API key configuration
- The Claude Agent SDK supports Bedrock, Vertex AI, and Azure as alternative providers
- Zod schemas in both SDKs provide runtime input validation, reducing injection risks

---

## 8. Sources and References

### Official Documentation
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude Agent SDK Quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart)
- [Claude Agent SDK Custom Tools](https://platform.claude.com/docs/en/agent-sdk/custom-tools)
- [Claude Agent SDK Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [Claude Agent SDK V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview)
- [Claude Agent SDK Streaming](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)

### GitHub Repositories
- [Claude Agent SDK TypeScript](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Claude Agent SDK Demos](https://github.com/anthropics/claude-agent-sdk-demos)
- [Anthropic Base SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript)
- [Vercel AI SDK](https://github.com/vercel/ai)

### NPM Packages
- [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk)
- [ai (Vercel AI SDK)](https://www.npmjs.com/package/ai)
- [@ai-sdk/anthropic](https://www.npmjs.com/package/@ai-sdk/anthropic)

### Guides and Articles
- [Building agents with the Claude Agent SDK (Anthropic Engineering)](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Complete Guide to Building Agents (Nader Dabit)](https://nader.substack.com/p/the-complete-guide-to-building-agents)
- [AI SDK 6 Announcement (Vercel)](https://vercel.com/blog/ai-sdk-6)
- [Vercel AI SDK Next.js App Router Guide](https://ai-sdk.dev/docs/getting-started/nextjs-app-router)
