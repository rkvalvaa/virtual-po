import type { FeatureRequest } from '@/lib/types/database';

/**
 * Escape a CSV cell value: wrap in quotes if it contains commas,
 * double-quotes, or newlines; double any internal quotes.
 */
function escapeCSVCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate a CSV string from headers and rows.
 */
export function generateCSV(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCSVCell).join(',');
  const dataLines = rows.map((row) =>
    row.map(escapeCSVCell).join(',')
  );
  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Format feature requests into export-ready CSV rows.
 * Columns: Title, Status, Priority Score, Quality Score, Complexity, Tags, Created At, Updated At
 */
export function formatRequestsForExport(requests: FeatureRequest[]): {
  headers: string[];
  rows: string[][];
} {
  const headers = [
    'Title',
    'Status',
    'Priority Score',
    'Quality Score',
    'Complexity',
    'Tags',
    'Created At',
    'Updated At',
  ];

  const rows = requests.map((r) => [
    r.title,
    r.status,
    r.priorityScore != null ? String(r.priorityScore) : '',
    r.qualityScore != null ? String(r.qualityScore) : '',
    r.complexity ?? '',
    r.tags.length > 0 ? r.tags.join('; ') : '',
    r.createdAt.toISOString(),
    r.updatedAt.toISOString(),
  ]);

  return { headers, rows };
}
