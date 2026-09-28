import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/auth";
import { requirePortalContact } from "@/lib/auth/session";
import { listPortalForms } from "@/lib/db/queries/portal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Client portal" };

export default async function PortalPage() {
  const contact = await requirePortalContact();
  const forms = await listPortalForms(contact.clientAccountId);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/portal/login" });
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-4">
      <Card>
        <CardHeader>
          <CardTitle><h1>Client portal</h1></CardTitle>
          <CardDescription>Choose a form to send a request to the team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {forms.length ? (
            <ul className="space-y-2">
              {forms.map(form => <li key={form.id}><Link href={`/portal/forms/${form.id}`} className="underline">{form.title}</Link></li>)}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No request forms are available to you yet.</p>}
          <form action={handleSignOut}>
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
