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
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="relative mx-auto max-w-6xl px-4 py-32 text-center sm:py-40">
          <Badge variant="secondary" className="mb-6 text-sm">
            AI-Powered Product Management
          </Badge>
          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Virtual Product Owner
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Transform vague feature requests into structured, prioritized epics
            and user stories — powered by AI agents
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/requests">
                Get Started
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#features">Learn More</a>
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t bg-muted/50 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              How It Works
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              From idea to actionable backlog in three steps
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {/* Step 1 */}
            <div className="relative text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold">
                1
              </div>
              <h3 className="mt-6 text-xl font-semibold text-foreground">
                Describe
              </h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Stakeholders describe their feature request in natural
                conversation. The AI guides them through structured intake with
                smart follow-up questions.
              </p>
              {/* Connector arrow (visible on md+) */}
              <div className="absolute right-0 top-8 hidden -translate-y-1/2 translate-x-1/2 md:block">
                <ArrowRight className="size-6 text-muted-foreground/50" />
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold">
                2
              </div>
              <h3 className="mt-6 text-xl font-semibold text-foreground">
                Assess
              </h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                AI analyzes business value, technical complexity, and risk using
                RICE and WSJF frameworks to generate priority recommendations.
              </p>
              {/* Connector arrow (visible on md+) */}
              <div className="absolute right-0 top-8 hidden -translate-y-1/2 translate-x-1/2 md:block">
                <ArrowRight className="size-6 text-muted-foreground/50" />
              </div>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold">
                3
              </div>
              <h3 className="mt-6 text-xl font-semibold text-foreground">
                Deliver
              </h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Structured epics and user stories are generated automatically
                with acceptance criteria, ready for your development team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="border-t py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Everything You Need
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A complete toolkit for transforming feature requests into
              development-ready work items
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <MessageSquare className="size-5 text-primary" />
                </div>
                <CardTitle className="mt-4">Intelligent Intake</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Conversational AI guides stakeholders through structured
                  feature request gathering with real-time quality scoring.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <BarChart3 className="size-5 text-primary" />
                </div>
                <CardTitle className="mt-4">Priority Scoring</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  RICE and WSJF framework analysis across business value,
                  technical feasibility, and risk dimensions.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="size-5 text-primary" />
                </div>
                <CardTitle className="mt-4">
                  Epic & Story Generation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Automatically generate well-structured epics with
                  INVEST-compliant user stories and Given/When/Then acceptance
                  criteria.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="size-5 text-primary" />
                </div>
                <CardTitle className="mt-4">Review Workflow</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Streamlined approval process with role-based access for
                  stakeholders, reviewers, and admins.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <Zap className="size-5 text-primary" />
                </div>
                <CardTitle className="mt-4">Smart Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  AI-powered analysis calibrated against your existing backlog
                  and historical estimates.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <Users className="size-5 text-primary" />
                </div>
                <CardTitle className="mt-4">Team Collaboration</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Multi-tenant workspaces with configurable scoring weights and
                  organization-specific priorities.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Agent Pipeline */}
      <section className="border-t bg-muted/50 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Three Specialized AI Agents
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A coordinated pipeline that processes requests from intake to
              delivery
            </p>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            <Card className="relative">
              <CardHeader>
                <Badge variant="secondary" className="w-fit">
                  Agent 1
                </Badge>
                <CardTitle className="mt-2 text-lg">Intake Agent</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Guides stakeholders through comprehensive feature request
                  submission using natural conversation.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">
                      Adaptive follow-up questions
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">
                      Real-time quality scoring
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">
                      Structured data extraction
                    </span>
                  </div>
                </div>
              </CardContent>
              {/* Connector arrow (visible on md+) */}
              <div className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 md:block">
                <div className="flex size-6 items-center justify-center rounded-full bg-background border">
                  <ArrowRight className="size-3 text-muted-foreground" />
                </div>
              </div>
            </Card>

            <Card className="relative">
              <CardHeader>
                <Badge variant="secondary" className="w-fit">
                  Agent 2
                </Badge>
                <CardTitle className="mt-2 text-lg">
                  Assessment Agent
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Analyzes completed requests and generates priority
                  recommendations with transparent reasoning.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">
                      RICE and WSJF scoring
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">
                      Risk identification
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">
                      Backlog comparison
                    </span>
                  </div>
                </div>
              </CardContent>
              {/* Connector arrow (visible on md+) */}
              <div className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 md:block">
                <div className="flex size-6 items-center justify-center rounded-full bg-background border">
                  <ArrowRight className="size-3 text-muted-foreground" />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <Badge variant="secondary" className="w-fit">
                  Agent 3
                </Badge>
                <CardTitle className="mt-2 text-lg">Output Agent</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Generates well-structured epics, user stories, and acceptance
                  criteria for development teams.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">
                      INVEST-compliant stories
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">
                      Given/When/Then criteria
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">
                      Technical notes included
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Ready to streamline your product backlog?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Stop losing time on unstructured feature requests. Let AI handle the
            heavy lifting so you can focus on building what matters.
          </p>
          <div className="mt-10">
            <Button asChild size="lg">
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
