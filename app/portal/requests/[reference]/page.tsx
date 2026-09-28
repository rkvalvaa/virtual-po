import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalContact } from "@/lib/auth/session";
import { getMyRequest } from "@/lib/db/queries/portal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Request" };

export default async function MyRequestPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const contact = await requirePortalContact();
  // Only the submitter sees a request; any other reference is a plain 404.
  const request = /^[A-Z2-9]{10}$/.test(reference) ? await getMyRequest(contact, reference) : null;
  if (!request) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <Link href="/portal/requests" className="text-sm underline">My requests</Link>
      <Card>
        <CardHeader>
          <CardTitle><h1 className="break-words">{request.title}</h1></CardTitle>
          <p className="text-sm text-muted-foreground">Reference <span className="font-mono">{request.reference}</span> · sent {new Date(request.submittedAt).toLocaleDateString()}</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>Status: <strong>{request.status}</strong></p>
          <section aria-label="Status history">
            <h2 className="mb-1 font-medium">History</h2>
            <ol className="space-y-1">
              {request.history.map((entry, index) => <li key={index} className="flex justify-between gap-2">
                <span>{entry.label}</span><span className="text-muted-foreground">{new Date(entry.at).toLocaleDateString()}</span>
              </li>)}
            </ol>
          </section>
          <section aria-label="Your answers">
            <h2 className="mb-1 font-medium">What you sent</h2>
            <dl className="space-y-2">
              {request.answers.map((answer, index) => <div key={index}>
                <dt className="text-muted-foreground">{answer.label}</dt>
                <dd className="whitespace-pre-line break-words">{answer.value === null ? "Not answered" : String(answer.value)}</dd>
              </div>)}
            </dl>
          </section>
        </CardContent>
      </Card>
    </main>
  );
}
