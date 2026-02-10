# VPO Quick Start Implementation Guide

This guide provides the initial commands and code snippets to get started building VPO in Claude Code.

## Step 1: Project Initialization

```bash
# Create Next.js project with TypeScript
npx create-next-app@latest vpo --typescript --tailwind --eslint --app --src-dir

cd vpo

# Install core dependencies
npm install @anthropic-ai/sdk prisma @prisma/client next-auth
npm install @tanstack/react-query zod zustand

# Install UI dependencies
npm install class-variance-authority clsx tailwind-merge lucide-react
npx shadcn@latest init

# Install shadcn components you'll need
npx shadcn@latest add button card input textarea badge avatar dropdown-menu dialog tabs toast scroll-area separator

# Dev dependencies
npm install -D @types/node prisma
```

## Step 2: Environment Setup

Create `.env.local`:

```env
# Database (use Neon, Supabase, or local PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/vpo"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# Anthropic
ANTHROPIC_API_KEY="sk-ant-..."

# OAuth (start with one provider)
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
```

## Step 3: Initial Prisma Schema

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  createdAt     DateTime  @default(now())
  requests      FeatureRequest[]
  accounts      Account[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model FeatureRequest {
  id             String        @id @default(cuid())
  title          String
  status         String        @default("DRAFT")
  intakeData     Json          @default("{}")
  assessmentData Json?
  qualityScore   Float?
  priorityScore  Float?
  complexity     String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  userId         String
  user           User          @relation(fields: [userId], references: [id])
  conversations  Conversation[]
  epic           Epic?
}

model Conversation {
  id        String         @id @default(cuid())
  requestId String
  agentType String
  status    String         @default("ACTIVE")
  createdAt DateTime       @default(now())
  request   FeatureRequest @relation(fields: [requestId], references: [id])
  messages  Message[]
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  role           String
  content        String       @db.Text
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id])
}

model Epic {
  id          String         @id @default(cuid())
  requestId   String         @unique
  title       String
  description String         @db.Text
  createdAt   DateTime       @default(now())
  request     FeatureRequest @relation(fields: [requestId], references: [id])
  stories     UserStory[]
}

model UserStory {
  id                 String   @id @default(cuid())
  epicId             String
  title              String
  asA                String
  iWant              String
  soThat             String
  acceptanceCriteria String[]
  createdAt          DateTime @default(now())
  epic               Epic     @relation(fields: [epicId], references: [id])
}
```

Then run:

```bash
npx prisma generate
npx prisma db push
```

## Step 4: Anthropic Agent Setup

Create `src/lib/agents/client.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODELS = {
  FAST: "claude-sonnet-4-20250514",
  SMART: "claude-sonnet-4-20250514",
} as const;
```

Create `src/lib/agents/prompts/intake.ts`:

```typescript
export const INTAKE_SYSTEM_PROMPT = `You are an expert Product Owner assistant helping stakeholders submit well-defined feature requests through natural conversation.

## Your Personality
- Friendly and encouraging, not interrogative
- Ask 1-2 questions at a time
- Provide examples when users struggle
- Summarize understanding periodically

## Information to Gather

### Required
1. **Problem**: What problem does this solve? Who experiences it?
2. **Solution**: What's the desired outcome?
3. **Business Value**: Why important? Expected impact? Who benefits?
4. **Success Metrics**: How will we measure success?

### Optional but Valuable
- Timeline/deadlines
- Dependencies
- Technical constraints

## Process
1. Start by asking about the problem
2. Dig deeper with follow-up questions
3. When you have enough info, use save_intake_progress tool
4. Summarize and confirm before marking complete
5. Use mark_intake_complete when done

Be conversational, not like a form. Make the stakeholder feel heard.`;
```

Create `src/lib/agents/tools/intake.ts`:

```typescript
import { Tool } from "@anthropic-ai/sdk/resources/messages";

export const intakeTools: Tool[] = [
  {
    name: "save_intake_progress",
    description: "Save gathered information for the feature request",
    input_schema: {
      type: "object" as const,
      properties: {
        requestId: { type: "string", description: "The request ID" },
        section: {
          type: "string",
          enum: ["problem", "solution", "business", "metrics", "context"],
          description: "Which section of information",
        },
        data: {
          type: "object",
          description: "The gathered information",
        },
      },
      required: ["requestId", "section", "data"],
    },
  },
  {
    name: "mark_intake_complete",
    description: "Mark intake as complete when all required info is gathered",
    input_schema: {
      type: "object" as const,
      properties: {
        requestId: { type: "string" },
        summary: { type: "string", description: "Summary of the request" },
        qualityScore: {
          type: "number",
          description: "Completeness score 0-100",
        },
      },
      required: ["requestId", "summary", "qualityScore"],
    },
  },
];
```

## Step 5: Core API Route

Create `src/app/api/agents/intake/message/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODELS } from "@/lib/agents/client";
import { INTAKE_SYSTEM_PROMPT } from "@/lib/agents/prompts/intake";
import { intakeTools } from "@/lib/agents/tools/intake";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { conversationId, message } = await req.json();

    // Get conversation with messages
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Save user message
    await prisma.message.create({
      data: { conversationId, role: "user", content: message },
    });

    // Build messages array
    const messages = conversation.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    messages.push({ role: "user", content: message });

    // Call Claude
    let response = await anthropic.messages.create({
      model: MODELS.SMART,
      max_tokens: 2048,
      system: INTAKE_SYSTEM_PROMPT,
      tools: intakeTools,
      messages,
    });

    // Handle tool calls
    while (response.stop_reason === "tool_use") {
      const toolUse = response.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") break;

      // Process tool call
      const result = await handleToolCall(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        conversation.requestId
      );

      messages.push({ role: "assistant", content: response.content as any });
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          },
        ],
      } as any);

      response = await anthropic.messages.create({
        model: MODELS.SMART,
        max_tokens: 2048,
        system: INTAKE_SYSTEM_PROMPT,
        tools: intakeTools,
        messages,
      });
    }

    // Extract text response
    const textBlock = response.content.find((b) => b.type === "text");
    const assistantMessage =
      textBlock?.type === "text" ? textBlock.text : "I encountered an issue.";

    // Save assistant message
    await prisma.message.create({
      data: { conversationId, role: "assistant", content: assistantMessage },
    });

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error("Agent error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleToolCall(
  name: string,
  input: Record<string, unknown>,
  requestId: string
) {
  switch (name) {
    case "save_intake_progress": {
      const { section, data } = input as { section: string; data: object };
      const request = await prisma.featureRequest.findUnique({
        where: { id: requestId },
      });
      const currentData = (request?.intakeData as object) || {};
      await prisma.featureRequest.update({
        where: { id: requestId },
        data: {
          intakeData: { ...currentData, [section]: data },
        },
      });
      return { success: true, section };
    }

    case "mark_intake_complete": {
      const { summary, qualityScore } = input as {
        summary: string;
        qualityScore: number;
      };
      await prisma.featureRequest.update({
        where: { id: requestId },
        data: {
          title: summary.slice(0, 100),
          status: "PENDING_ASSESSMENT",
          qualityScore,
        },
      });
      await prisma.conversation.update({
        where: { id: requestId },
        data: { status: "COMPLETED" },
      });
      return { success: true, status: "PENDING_ASSESSMENT" };
    }

    default:
      return { error: "Unknown tool" };
  }
}
```

## Step 6: Basic Chat Component

Create `src/components/chat/ChatWindow.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatWindowProps {
  conversationId: string;
  initialMessages?: Message[];
}

export function ChatWindow({
  conversationId,
  initialMessages = [],
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/agents/intake/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: userMessage }),
      });

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] border rounded-lg">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your feature request..."
            className="min-h-[60px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <Button onClick={sendMessage} disabled={isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

## Step 7: Initial Pages

Create `src/app/(dashboard)/requests/new/page.tsx`:

```tsx
import { ChatWindow } from "@/components/chat/ChatWindow";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

// This would normally check auth and create request/conversation
async function createRequestAndConversation(userId: string) {
  const request = await prisma.featureRequest.create({
    data: {
      title: "New Feature Request",
      userId,
    },
  });

  const conversation = await prisma.conversation.create({
    data: {
      requestId: request.id,
      agentType: "INTAKE",
    },
  });

  return { request, conversation };
}

export default async function NewRequestPage() {
  // TODO: Get actual user from auth
  const userId = "temp-user-id";

  const { conversation } = await createRequestAndConversation(userId);

  const initialMessage = {
    role: "assistant" as const,
    content:
      "Hi! I'm here to help you submit a feature request. Let's start with the basics—what problem are you trying to solve, and who experiences this problem?",
  };

  return (
    <div className="container max-w-4xl py-8">
      <h1 className="text-2xl font-bold mb-6">Submit Feature Request</h1>
      <ChatWindow
        conversationId={conversation.id}
        initialMessages={[initialMessage]}
      />
    </div>
  );
}
```

## Next Steps in Claude Code

Once you have this foundation, tell Claude Code to:

1. **"Add authentication with NextAuth and GitHub provider"**
2. **"Create the request list page with status badges"**
3. **"Build the assessment agent that analyzes completed requests"**
4. **"Add the output agent for generating epics and user stories"**
5. **"Create the review queue interface"**
6. **"Add Jira integration for exporting stories"**

## Useful Claude Code Prompts

```
"Add the assessment agent - it should analyze the intake data and generate 
scores for business value, technical complexity, and risk. Use the RICE 
framework for priority calculation."

"Create a request detail page that shows the intake conversation, assessment 
results, and generated epic/stories in tabs."

"Add real-time updates using server-sent events so the chat feels responsive."

"Implement the Jira integration - OAuth flow and issue creation from stories."
```

Good luck building VPO! 🚀
