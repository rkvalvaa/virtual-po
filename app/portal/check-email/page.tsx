import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PORTAL_LINK_MINUTES } from "@/lib/email/portal-sign-in";

export const metadata: Metadata = { title: "Check your email" };

// Shown for every request, known address or not, so it never reveals who has access.
export default function CheckEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle><h1>Check your email</h1></CardTitle>
          <CardDescription>
            If that address has access to the client portal, a sign-in link is on its way. It works once and expires in {PORTAL_LINK_MINUTES} minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/portal/login" className="text-sm underline">Use a different email address</Link>
        </CardContent>
      </Card>
    </main>
  );
}
