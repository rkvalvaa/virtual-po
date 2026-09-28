import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalContact } from "@/lib/auth/session";
import { getPortalForm } from "@/lib/db/queries/portal";
import { PortalFormSubmission } from "@/components/portal/PortalFormSubmission";
import { Card, CardContent } from "@/components/ui/card";
import { submitPortalForm } from "./actions";

export const metadata: Metadata = { title: "Submit a request" };

export default async function PortalFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await requirePortalContact();
  // Scoped to the contact's client: another client's or a paused form is a 404.
  const form = /^[0-9a-f-]{36}$/i.test(id) ? await getPortalForm(id, contact.clientAccountId) : null;
  if (!form) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <Link href="/portal" className="text-sm underline">All forms</Link>
      <Card>
        <CardContent className="pt-6">
          <PortalFormSubmission formId={form.id} uploadBase={`portal/${contact.clientAccountId}/${form.id}/`} definition={form.definition}
            organizationName={form.organizationName} submit={submitPortalForm.bind(null, form.id)} />
        </CardContent>
      </Card>
    </main>
  );
}
