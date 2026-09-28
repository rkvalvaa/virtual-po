import type { Metadata } from "next";
import { signOut } from "@/auth";
import { requirePortalContact } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Client portal" };

// ponytail: placeholder landing for client contacts; forms (P5) and request
// tracking (P6) replace this content.
export default async function PortalPage() {
  await requirePortalContact();

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/portal/login" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle><h1>Client portal</h1></CardTitle>
          <CardDescription>You are signed in. Request forms and updates on your submissions will appear here.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSignOut}>
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
