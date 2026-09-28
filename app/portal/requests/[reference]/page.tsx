import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalContact } from "@/lib/auth/session";
import { getMyRequest } from "@/lib/db/queries/portal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalReply } from "@/components/portal/PortalReply";
import { replyToRequest } from "./actions";

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
          {request.files.length > 0 && <section aria-label="Your files">
            <h2 className="mb-1 font-medium">Your files</h2>
            <ul className="space-y-1">
              {request.files.map(file => <li key={file.id}>
                <a href={`/portal/requests/${request.reference}/files/${file.id}`} className="break-all underline">{file.filename}</a>
              </li>)}
            </ul>
          </section>}
          <section aria-label="Messages" className="space-y-3">
            <h2 className="font-medium">Messages</h2>
            {!request.messages.length && <p className="text-muted-foreground">No messages yet. The team will write here if they need anything from you.</p>}
            {request.messages.map((message, index) => <div key={index} className="space-y-1 border-l-2 pl-3">
              <p className="text-xs text-muted-foreground">{message.from === "team" ? "The team" : "You"} · {new Date(message.at).toLocaleString()}</p>
              <p className="whitespace-pre-line break-words">{message.body}</p>
            </div>)}
            <PortalReply reply={replyToRequest.bind(null, request.reference)} />
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
