import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { getRefinement } from '@/lib/db/queries/refinement';
import { RefinementEditor } from '@/components/requests/RefinementEditor';

export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (!session.user.orgId) notFound();
  const { id } = await params;
  const view = await getRefinement(id, session.user.orgId, session.user.id);
  return <RefinementEditor key={view.revision} requestId={id} view={view} />;
}
