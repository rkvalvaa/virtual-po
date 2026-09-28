import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requestPortalLink } from "./actions";

export const metadata: Metadata = { title: "Client portal sign-in" };

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle><h1>Client portal sign-in</h1></CardTitle>
          <CardDescription>Enter the email address your contact at the company gave access to. We will email you a one-time sign-in link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={requestPortalLink} className="space-y-3">
            <div>
              <label htmlFor="portal-email" className="text-sm">Email</label>
              <Input id="portal-email" name="email" type="email" autoComplete="email" required />
            </div>
            {error === "email" && <p role="alert" className="text-sm text-destructive">Enter a valid email address.</p>}
            {error === "unavailable" && <p role="alert" className="text-sm text-destructive">Sign-in links are unavailable right now. Try again later.</p>}
            <Button type="submit" className="w-full">Email me a sign-in link</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
