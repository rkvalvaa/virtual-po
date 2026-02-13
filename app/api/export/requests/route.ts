import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listFeatureRequests } from '@/lib/db/queries/feature-requests';
import { generateCSV, formatRequestsForExport } from '@/lib/utils/export';
import '@/lib/auth/types';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 });
  }

  const { requests } = await listFeatureRequests(orgId, { limit: 10000 });
  const { headers, rows } = formatRequestsForExport(requests);
  const csv = generateCSV(headers, rows);

  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="requests-${date}.csv"`,
    },
  });
}
