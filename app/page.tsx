import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  BarChart3,
  FileText,
  Shield,
  Zap,
  Users,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: MessageSquare,
    title: "Intelligent Intake",
    description:
      "Conversational AI guides stakeholders through structured feature request gathering with real-time quality scoring.",
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-100 dark:bg-indigo-950/60",
  },
  {
    icon: BarChart3,
    title: "Priority Scoring",
    description:
      "RICE and WSJF framework analysis across business value, technical feasibility, and risk dimensions.",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-950/60",
  },
  {
    icon: FileText,
    title: "Epic & Story Generation",
    description:
      "Automatically generate well-structured epics with INVEST-compliant user stories and Given/When/Then acceptance criteria.",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-950/60",
  },
  {
    icon: Shield,
    title: "Review Workflow",
    description:
      "Streamlined approval process with role-based access for stakeholders, reviewers, and admins.",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-950/60",
  },
  {
    icon: Zap,
    title: "Smart Assessment",
    description:
      "AI-powered analysis calibrated against your existing backlog and historical estimates.",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-100 dark:bg-rose-950/60",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description:
      "Multi-tenant workspaces with configurable scoring weights and organization-specific priorities.",
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-950/60",
  },
] as const;

const steps = [
  {
    number: 1,
    title: "Describe",
    description:
      "Stakeholders describe their feature request in natural conversation. The AI guides them through structured intake with smart follow-up questions.",
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
    title: "Deliver",
    description:
      "Structured epics and user stories are generated automatically with acceptance criteria, ready for your development team.",
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
    title: "Output Agent",
    description:
      "Generates well-structured epics, user stories, and acceptance criteria for development teams.",
    features: [
      "INVEST-compliant stories",
      "Given/When/Then criteria",
      "Technical notes included",
    ],
    accent: "border-t-emerald-500",
    badgeClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    checkColor: "text-emerald-500",
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
            Transform vague feature requests into structured, prioritized epics
            and user stories — powered by AI agents
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
              From idea to actionable backlog in three steps
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
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
              A complete toolkit for transforming feature requests into
              development-ready work items
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

      {/* Agent Pipeline */}
      <section className="border-t bg-muted/50 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <Badge className="mb-4 border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
              AI Pipeline
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Three Specialized AI Agents
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A coordinated pipeline that processes requests from intake to
              delivery
            </p>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
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
