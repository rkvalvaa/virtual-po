import type { Metadata } from "next";
import Link from "next/link";
import { requirePortalContact } from "@/lib/auth/session";
import { listMyRequests } from "@/lib/db/queries/portal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "My requests" };

export default async function MyRequestsPage() {
  const contact = await requirePortalContact();
  const requests = await listMyRequests(contact);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <Link href="/portal" className="text-sm underline">Client portal</Link>
      <Card>
        <CardHeader><CardTitle><h1>My requests</h1></CardTitle></CardHeader>
        <CardContent>
          {requests.length ? (
            <ul className="divide-y">
              {requests.map(request => <li key={request.reference} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <Link href={`/portal/requests/${request.reference}`} className="min-w-0 break-words underline">{request.title}</Link>
                <span className="text-muted-foreground">{request.status} · {new Date(request.submittedAt).toLocaleDateString()}</span>
              </li>)}
            </ul>
          ) : <p className="text-sm text-muted-foreground">You have not sent any requests yet.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
