import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getDashboardSummary,
  getStatusDistribution,
  getPriorityDistribution,
  getAverageTimeToDecision,
  getTopRequesters,
  getDecisionBreakdown,
  getVoteSummaryStats,
  type DateRange,
} from '@/lib/db/queries/analytics';
import { getOrganizationById } from '@/lib/db/queries/organizations';
import { generateCSV } from '@/lib/utils/export';
import { generateAnalyticsPDF } from '@/lib/utils/pdf';
import '@/lib/auth/types';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') ?? 'csv';
  if (format !== 'csv' && format !== 'pdf') {
    return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
  }

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const dateRange: DateRange | undefined = from && to ? { from, to } : undefined;

  const [summary, statusDist, priorityDist, timeToDecision, topRequesters] =
    await Promise.all([
      getDashboardSummary(orgId, dateRange),
      getStatusDistribution(orgId, dateRange),
      getPriorityDistribution(orgId, dateRange),
      getAverageTimeToDecision(orgId, dateRange),
      getTopRequesters(orgId, 5, dateRange),
    ]);

  if (format === 'pdf') {
    const [org, decisionBreakdown, voteSummary] = await Promise.all([
      getOrganizationById(orgId),
      getDecisionBreakdown(orgId, dateRange),
      getVoteSummaryStats(orgId, dateRange),
    ]);

    const pdfBytes = generateAnalyticsPDF({
      orgName: org?.name ?? 'Unknown organization',
      dateRange,
      summary,
      statusDistribution: statusDist,
      priorityDistribution: priorityDist,
      timeToDecision,
      topRequesters,
      decisionBreakdown,
      voteSummary,
    });

    const date = new Date().toISOString().slice(0, 10);
    return new Response(pdfBytes as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="analytics-${date}.pdf"`,
      },
    });
  }

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
