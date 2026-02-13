import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getDashboardSummary,
  getStatusDistribution,
  getPriorityDistribution,
  getAverageTimeToDecision,
  getTopRequesters,
} from '@/lib/db/queries/analytics';
import { generateCSV } from '@/lib/utils/export';
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

  const [summary, statusDist, priorityDist, timeToDecision, topRequesters] =
    await Promise.all([
      getDashboardSummary(orgId),
      getStatusDistribution(orgId),
      getPriorityDistribution(orgId),
      getAverageTimeToDecision(orgId),
      getTopRequesters(orgId),
    ]);

  const sections: string[] = [];

  // Summary section
  const summaryCSV = generateCSV(
    ['Metric', 'Value'],
    [
      ['Total Requests', String(summary.totalRequests)],
      ['Pending Review', String(summary.pendingReview)],
      ['In Backlog', String(summary.inBacklog)],
      ['Completed', String(summary.completed)],
      ['Avg Quality Score', summary.avgQualityScore != null ? String(summary.avgQualityScore) : ''],
      ['Avg Time to Decision (days)', timeToDecision.avgDays != null ? String(timeToDecision.avgDays) : ''],
    ]
  );
  sections.push('Summary\r\n' + summaryCSV);

  // Status distribution
  const statusCSV = generateCSV(
    ['Status', 'Count'],
    statusDist.map((row) => [row.status, String(row.count)])
  );
  sections.push('Status Distribution\r\n' + statusCSV);

  // Priority distribution
  const priorityCSV = generateCSV(
    ['Priority Band', 'Count'],
    priorityDist.map((row) => [row.band, String(row.count)])
  );
  sections.push('Priority Distribution\r\n' + priorityCSV);

  // Top requesters
  if (topRequesters.length > 0) {
    const requesterCSV = generateCSV(
      ['Name', 'Request Count'],
      topRequesters.map((row) => [row.name, String(row.count)])
    );
    sections.push('Top Requesters\r\n' + requesterCSV);
  }

  const csv = sections.join('\r\n\r\n');
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="analytics-${date}.csv"`,
    },
  });
}
