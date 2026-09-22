import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  BarChart3,
  FileText,
  Shield,
  ShieldAlert,
  Zap,
  Users,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Ticket,
  Layers,
  Github,
  MessagesSquare,
  Webhook,
  Workflow,
  Coins,
  CalendarClock,
  Globe,
  ClipboardList,
  Clock,
  Scale,
  Inbox,
  UserCheck,
} from "lucide-react";

const benefits = [
  {
    icon: Clock,
    title: "Weeks become one session",
    description:
      "Chasing context, rewriting one-liners, estimating, security triage and story drafting used to take weeks of back-and-forth. Here it finishes in one guided conversation or form.",
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-100 dark:bg-indigo-950/60",
  },
  {
    icon: Scale,
    title: "Every priority is defensible",
    description:
      "Scores are reconstructible from stored inputs and the exact scoring policy version they were computed under. No more arguing about why something ranked where it did.",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-950/60",
  },
  {
    icon: Inbox,
    title: "Nothing falls through",
    description:
      "Every request gets a reference, an owner, a status and a durable delivery to the right tracker or queue. Requesters can see where it stands without asking.",
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-100 dark:bg-sky-950/60",
  },
  {
    icon: UserCheck,
    title: "Humans stay in the decision seat",
    description:
      "AI drafts, scores and classifies. People approve, reject and defer — with approval chains that cannot be bypassed and a full audit trail.",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-950/60",
  },
] as const;

const features = [
  {
    icon: MessageSquare,
    title: "Conversational Intake",
    description:
      "A streaming AI interview turns a one-line idea into a complete request — problem, solution, justification, success metrics — with server-validated quality scoring and resumable drafts.",
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-100 dark:bg-indigo-950/60",
  },
  {
    icon: BarChart3,
    title: "Defensible Prioritization",
    description:
      "RICE, WSJF or custom-weighted scoring across business value, complexity and risk. Every score is snapshotted against the policy version it was computed under.",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-950/60",
  },
  {
    icon: FileText,
    title: "Epics & User Stories",
    description:
      "Generated epics with INVEST-compliant stories and Given/When/Then acceptance criteria — editable with revision history before anything is exported.",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-950/60",
  },
  {
    icon: ShieldAlert,
    title: "Security Triage",
    description:
      "ISO 27001 and OWASP-aligned classification flags PII, auth, payments and compliance concerns before estimation, not during implementation.",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-950/60",
  },
  {
    icon: Shield,
    title: "Approvals & Review Cycles",
    description:
      "Multi-step approval chains that cannot be bypassed, recurring review cycles that sweep stale requests back into the queue, and a full audit trail on every decision.",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-950/60",
  },
  {
    icon: Zap,
    title: "Context-Aware Assessment",
    description:
      "Agents read your objectives, current backlog, historical estimates, supporting documents and codebase impact — with citations for what they relied on.",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-100 dark:bg-rose-950/60",
  },
  {
    icon: Users,
    title: "Collaboration",
    description:
      "Threaded comments, mentions and subscriptions, private attachments, custom fields, request templates and an immutable activity log.",
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-950/60",
  },
  {
    icon: CalendarClock,
    title: "Planning & Analytics",
    description:
      "Capacity-aware planning, priority distribution, decision breakdowns, burndown and agent cost — exportable as PDF, CSV and JSON.",
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-100 dark:bg-sky-950/60",
  },
  {
    icon: Coins,
    title: "AI Cost Controls",
    description:
      "Per-organization monthly budgets with alerts, per-run token accounting, and hard rate limits enforced in the database before any model call.",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-100 dark:bg-orange-950/60",
  },
] as const;

const steps = [
  {
    number: 1,
    title: "Describe",
    description:
      "Stakeholders describe what they need in a guided conversation; clients and departments use published forms. Every request gets a reference and a workflow.",
    gradient: "from-indigo-500 to-blue-600",
  },
  {
    number: 2,
    title: "Assess",
    description:
      "AI analyzes business value, technical complexity, and risk using RICE and WSJF frameworks to generate priority recommendations.",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    number: 3,
    title: "Secure",
    description:
      "A dedicated Security Agent scans for PII, auth, payments, and compliance concerns — tagging issues for security review per ISO 27001.",
    gradient: "from-red-500 to-rose-600",
  },
  {
    number: 4,
    title: "Deliver",
    description:
      "Approved work is delivered durably to Linear, Jira, GitHub or a service queue — with epics, stories and acceptance criteria where they apply, and status visible to the requester.",
    gradient: "from-emerald-500 to-teal-600",
  },
] as const;

const agents = [
  {
    badge: "Agent 1",
    title: "Intake Agent",
    description:
      "Guides stakeholders through comprehensive feature request submission using natural conversation.",
    features: [
      "Adaptive follow-up questions",
      "Real-time quality scoring",
      "Structured data extraction",
    ],
    accent: "border-t-indigo-500",
    badgeClass:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    checkColor: "text-indigo-500",
  },
  {
    badge: "Agent 2",
    title: "Assessment Agent",
    description:
      "Analyzes completed requests and generates priority recommendations with transparent reasoning.",
    features: [
      "RICE and WSJF scoring",
      "Risk identification",
      "Backlog comparison",
    ],
    accent: "border-t-violet-500",
    badgeClass:
      "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    checkColor: "text-violet-500",
  },
  {
    badge: "Agent 3",
    title: "Security Agent",
    description:
      "Scans feature requests for security implications and auto-tags work requiring specialist review.",
    features: [
      "ISO 27001-aligned triage",
      "PII & auth detection",
      "Compliance classification",
    ],
    accent: "border-t-red-500",
    badgeClass:
      "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    checkColor: "text-red-500",
  },
  {
    badge: "Agent 4",
    title: "Output Agent",
    description:
      "Generates well-structured epics, user stories, and acceptance criteria for development teams.",
    features: [
      "INVEST-compliant stories",
      "Given/When/Then criteria",
      "Security tags included",
    ],
    accent: "border-t-emerald-500",
    badgeClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    checkColor: "text-emerald-500",
  },
] as const;

const integrations = [
  {
    icon: Ticket,
    name: "Jira",
    badge: "Export · Import · Status sync",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    description: "Durable, idempotent export of epics and stories; import existing issues; conflict-aware status sync.",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-950/60",
  },
  {
    icon: Layers,
    name: "Linear",
    badge: "Export · Import · Status sync",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    description: "Export to Linear teams and projects, import backlogs, keep statuses in step both ways.",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-950/60",
  },
  {
    icon: Github,
    name: "GitHub Issues",
    badge: "Export · Import",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    description: "Create issues from epics and stories, import existing issues with source context.",
    color: "text-gray-800 dark:text-gray-300",
    bg: "bg-gray-100 dark:bg-gray-800/60",
  },
  {
    icon: MessageSquare,
    name: "Slack",
    badge: "Notifications",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    description: "Signed webhooks, /vpo slash commands, and approve/reject buttons that record real decisions.",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-950/60",
  },
  {
    icon: MessagesSquare,
    name: "Microsoft Teams",
    badge: "Notifications & Commands",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    description: "Channel notifications, authenticated request commands, and approve/reject actions from Teams.",
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-100 dark:bg-sky-950/60",
  },
  {
    icon: Webhook,
    name: "REST API & Webhooks",
    badge: "Versioned API",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    description: "API-key authenticated, rate-limited REST API plus signed, retried outbound webhooks for your own systems.",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-950/60",
  },
] as const;

const platform = [
  {
    icon: Globe,
    title: "Client portal",
    description:
      "External clients submit, track and discuss requests through published forms and a portal — without ever seeing the internal workspace.",
    items: [
      "Configurable published request forms",
      "Client organizations with portal-only access",
      "Private by default; publication is explicit and audited",
      "Curated roadmaps and controlled upvotes per audience",
      "Submission tracking with public-safe updates and replies",
    ],
    accent: "border-t-sky-500",
    iconColor: "text-sky-500",
  },
  {
    icon: Workflow,
    title: "Service workflows",
    description:
      "One intake platform for every department, not only product. Each request type follows its own versioned workflow.",
    items: [
      "Versioned workflows by request type",
      "Service groups with accountable queues",
      "Rule-based routing to projects, people or groups",
      "Reliable delivery of routed requests to Linear and Jira",
      "Response targets, escalation and queue monitoring",
    ],
    accent: "border-t-violet-500",
    iconColor: "text-violet-500",
  },
  {
    icon: ClipboardList,
    title: "Beyond product requests",
    description:
      "Operational requests skip scoring and story generation and follow their own configured path.",
    items: [
      "Invoice queries and approval requests to Finance",
      "Change requests with implementation evidence",
      "Restricted security incident reports with responder escalation",
    ],
    accent: "border-t-amber-500",
    iconColor: "text-amber-500",
  },
] as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-violet-50 dark:from-indigo-950/30 dark:via-background dark:to-violet-950/30" />
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-900/20" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-violet-200/40 blur-3xl dark:bg-violet-900/20" />

        <div className="relative mx-auto max-w-6xl px-4 py-32 text-center sm:py-40">
          <Badge className="mb-6 gap-1.5 border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
            <Sparkles className="size-3.5" />
            AI-Powered Product Management
          </Badge>
          <h1 className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-5xl font-bold tracking-tight text-transparent dark:from-indigo-400 dark:via-violet-400 dark:to-purple-400 sm:text-6xl lg:text-7xl">
            Virtual Product Owner
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Turn any request — from a stakeholder, a client or a department —
            into structured, prioritized, review-ready work in one session
            instead of weeks. AI drafts; your team decides.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/25 hover:from-indigo-700 hover:to-violet-700 dark:shadow-indigo-500/10"
            >
              <Link href="/requests">
                Get Started
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-indigo-200 dark:border-indigo-800"
            >
              <a href="#features">Learn More</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-t py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <Badge className="mb-4 border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
              Why It Matters
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              The Front of the Funnel, Fixed
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Product and service owners lose most of their time before work
              even starts. This removes that cost.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <Card key={benefit.title}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${benefit.bg}`}
                    >
                      <benefit.icon className={`size-5 ${benefit.color}`} />
                    </div>
                    <CardTitle className="text-lg">{benefit.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {benefit.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t bg-muted/50 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <Badge className="mb-4 border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
              Simple Process
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              How It Works
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              From request to security-reviewed, delivered work in four steps
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-4">
            {steps.map((step, i) => (
              <div key={step.number} className="relative text-center">
                <div
                  className={`mx-auto flex size-16 items-center justify-center rounded-full bg-gradient-to-br ${step.gradient} text-2xl font-bold text-white shadow-lg`}
                >
                  {step.number}
                </div>
                <h3 className="mt-6 text-xl font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
                {/* Connector arrow (visible on md+) */}
                {i < steps.length - 1 && (
                  <div className="absolute right-0 top-8 hidden -translate-y-1/2 translate-x-1/2 md:block">
                    <ArrowRight className="size-6 text-violet-400/60 dark:text-violet-500/40" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="border-t py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <Badge className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              Full Toolkit
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Everything You Need
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              From first conversation to delivered backlog — intake, scoring,
              security, approvals, delivery and cost control in one place
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="group transition-shadow hover:shadow-md"
              >
                <CardHeader>
                  <div
                    className={`flex size-11 items-center justify-center rounded-lg ${feature.bg}`}
                  >
                    <feature.icon className={`size-5 ${feature.color}`} />
                  </div>
                  <CardTitle className="mt-4">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="border-t bg-muted/50 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <Badge className="mb-4 border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
              Integrations
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Works With Your Tools
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Durable, idempotent delivery to the trackers and chat tools your
              team already uses
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
            {integrations.map((integration) => (
              <Card
                key={integration.name}
                className="group text-center transition-shadow hover:shadow-md"
              >
                <CardContent className="pt-6">
                  <div
                    className={`mx-auto flex size-12 items-center justify-center rounded-lg ${integration.bg}`}
                  >
                    <integration.icon
                      className={`size-6 ${integration.color}`}
                    />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">
                    {integration.name}
                  </h3>
                  <span
                    className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${integration.badgeClass}`}
                  >
                    {integration.badge}
                  </span>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {integration.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Agent Pipeline */}
      <section className="border-t bg-muted/50 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <Badge className="mb-4 border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
              AI Pipeline
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Four Specialized AI Agents
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A coordinated pipeline that processes requests from intake through
              security review to delivery
            </p>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {agents.map((agent, i) => (
              <Card
                key={agent.title}
                className={`relative border-t-4 ${agent.accent}`}
              >
                <CardHeader>
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${agent.badgeClass}`}
                  >
                    {agent.badge}
                  </span>
                  <CardTitle className="mt-2 text-lg">{agent.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {agent.description}
                  </p>
                  <div className="space-y-2">
                    {agent.features.map((feat) => (
                      <div
                        key={feat}
                        className="flex items-start gap-2 text-sm"
                      >
                        <CheckCircle2
                          className={`mt-0.5 size-4 shrink-0 ${agent.checkColor}`}
                        />
                        <span className="text-muted-foreground">{feat}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
                {/* Connector arrow (visible on md+) */}
                {i < agents.length - 1 && (
                  <div className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 md:block">
                    <div className="flex size-6 items-center justify-center rounded-full border bg-background shadow-sm">
                      <ArrowRight className="size-3 text-violet-500" />
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Whole-organization intake */}
      <section className="border-t py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <Badge className="mb-4 border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
              Across the Organization
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              One Front Door for Every Request
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              External clients, internal departments and product teams share one
              intake platform — each with the workflow, visibility and routing
              they need
            </p>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {platform.map((theme) => (
              <Card key={theme.title} className={`border-t-4 ${theme.accent}`}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <theme.icon className={`size-5 ${theme.iconColor}`} />
                    <CardTitle className="text-lg">{theme.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {theme.description}
                  </p>
                  <div className="space-y-2">
                    {theme.items.map((item) => (
                      <div
                        key={item}
                        className="flex items-start gap-2 text-sm"
                      >
                        <CheckCircle2
                          className={`mt-0.5 size-4 shrink-0 ${theme.iconColor}`}
                        />
                        <span className="text-muted-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative overflow-hidden border-t py-24 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 dark:from-indigo-950/20 dark:via-violet-950/20 dark:to-purple-950/20" />
        <div className="relative mx-auto max-w-6xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Ready to streamline your product backlog?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Stop losing time on unstructured feature requests. Let AI handle the
            heavy lifting so you can focus on building what matters.
          </p>
          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/25 hover:from-indigo-700 hover:to-violet-700 dark:shadow-indigo-500/10"
            >
              <Link href="/login">
                Get Started
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Free to try. No credit card required.
          </p>
        </div>
      </section>
    </div>
  );
}
