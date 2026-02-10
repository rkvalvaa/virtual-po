import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Virtual Product Owner
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          AI-powered feature request intake, assessment, and prioritization for
          your development team.
        </p>
      </div>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/requests">Get Started</Link>
        </Button>
      </div>
    </div>
  );
}
