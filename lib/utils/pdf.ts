import jsPDF from "jspdf"
import type { FeatureRequest } from "@/lib/types/database"
import type {
  DashboardSummary,
  StatusDistributionRow,
  PriorityDistributionRow,
  AverageTimeToDecision,
  TopRequesterRow,
  DecisionBreakdownRow,
  VoteSummaryStats,
} from "@/lib/db/queries/analytics"

/**
 * Layout constants in mm (jsPDF defaults to mm with format A4).
 */
const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const MARGIN_X = 18
const MARGIN_Y = 20
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ")
}

/**
 * Generate a single-page PDF report for a feature request.
 *
 * Layout is intentionally simple — title, status, metadata block, summary,
 * and stringified intake/assessment data. Returns a Uint8Array suitable for
 * streaming via a Response body.
 */
export function generateRequestPDF(
  request: Pick<
    FeatureRequest,
    | "id"
    | "title"
    | "summary"
    | "status"
    | "priorityScore"
    | "qualityScore"
    | "complexity"
    | "tags"
    | "businessScore"
    | "technicalScore"
    | "riskScore"
    | "intakeData"
    | "assessmentData"
    | "createdAt"
    | "updatedAt"
  >,
): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  let cursorY = MARGIN_Y

  function moveTo(y: number): void {
    if (y > PAGE_HEIGHT - MARGIN_Y) {
      doc.addPage()
      cursorY = MARGIN_Y
    } else {
      cursorY = y
    }
  }

  function heading(text: string, size = 16, gap = 8): void {
    doc.setFontSize(size).setFont("helvetica", "bold")
    doc.text(text, MARGIN_X, cursorY)
    moveTo(cursorY + gap)
  }

  function paragraph(text: string, size = 10, gap = 5): void {
    doc.setFontSize(size).setFont("helvetica", "normal")
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[]
    for (const line of lines) {
      if (cursorY > PAGE_HEIGHT - MARGIN_Y) {
        doc.addPage()
        cursorY = MARGIN_Y
      }
      doc.text(line, MARGIN_X, cursorY)
      cursorY += size * 0.45
    }
    moveTo(cursorY + gap)
  }

  function row(label: string, value: string): void {
    doc.setFontSize(10).setFont("helvetica", "bold")
    doc.text(label, MARGIN_X, cursorY)
    doc.setFont("helvetica", "normal")
    const valueLines = doc.splitTextToSize(value, CONTENT_WIDTH - 40) as string[]
    for (let i = 0; i < valueLines.length; i++) {
      doc.text(valueLines[i], MARGIN_X + 40, cursorY + i * 4.5)
    }
    moveTo(cursorY + Math.max(5, valueLines.length * 4.5 + 1))
  }

  heading(request.title, 18, 10)

  doc.setFontSize(10).setFont("helvetica", "normal")
  doc.text(`Request ID: ${request.id}`, MARGIN_X, cursorY)
  doc.text(
    `Status: ${formatStatus(request.status)}`,
    MARGIN_X + CONTENT_WIDTH - 50,
    cursorY,
  )
  moveTo(cursorY + 8)

  heading("Metadata", 12, 6)
  row("Priority Score", request.priorityScore != null ? `${request.priorityScore}/100` : "—")
  row("Quality Score", request.qualityScore != null ? `${request.qualityScore}%` : "—")
  row("Complexity", request.complexity ?? "—")
  row("Business Score", request.businessScore != null ? String(request.businessScore) : "—")
  row("Technical Score", request.technicalScore != null ? String(request.technicalScore) : "—")
  row("Risk Score", request.riskScore != null ? String(request.riskScore) : "—")
  row("Tags", request.tags.length > 0 ? request.tags.join(", ") : "—")
  row("Created", formatDate(request.createdAt))
  row("Last updated", formatDate(request.updatedAt))

  moveTo(cursorY + 4)

  if (request.summary) {
    heading("Summary", 12, 6)
    paragraph(request.summary)
  }

  if (request.intakeData && Object.keys(request.intakeData).length > 0) {
    heading("Intake Data", 12, 6)
    paragraph(JSON.stringify(request.intakeData, null, 2), 9)
  }

  if (
    request.assessmentData &&
    Object.keys(request.assessmentData).length > 0
  ) {
    heading("Assessment", 12, 6)
    paragraph(JSON.stringify(request.assessmentData, null, 2), 9)
  }

  // Footer with generation date.
  doc.setFontSize(8).setFont("helvetica", "italic")
  doc.text(
    `Generated ${new Date().toISOString().slice(0, 10)} · Virtual Product Owner`,
    MARGIN_X,
    PAGE_HEIGHT - 10,
  )

  // jsPDF returns ArrayBuffer when output('arraybuffer'); wrap as Uint8Array
  // for Response compatibility.
  const buffer = doc.output("arraybuffer") as ArrayBuffer
  return new Uint8Array(buffer)
}

/**
 * Draw a simple two-or-more-column table (bold header row + plain rows)
 * starting at `startY`, handling page breaks as it goes. Returns the
 * cursor Y position after the table so the caller can continue the layout.
 */
function drawTable(
  doc: jsPDF,
  headers: string[],
  rows: string[][],
  startY: number,
): number {
  const colWidth = CONTENT_WIDTH / headers.length
  let y = startY

  function ensureSpace(): void {
    if (y > PAGE_HEIGHT - MARGIN_Y) {
      doc.addPage()
      y = MARGIN_Y
    }
  }

  ensureSpace()
  doc.setFontSize(9).setFont("helvetica", "bold")
  headers.forEach((header, i) => doc.text(header, MARGIN_X + i * colWidth, y))
  y += 5

  doc.setFont("helvetica", "normal")
  if (rows.length === 0) {
    ensureSpace()
    doc.setFont("helvetica", "italic")
    doc.text("No data", MARGIN_X, y)
    y += 5
    return y
  }

  for (const cells of rows) {
    ensureSpace()
    cells.forEach((cell, i) => doc.text(cell, MARGIN_X + i * colWidth, y))
    y += 5
  }
  return y
}

export interface AnalyticsPDFInput {
  orgName: string
  dateRange?: { from: string; to: string }
  summary: DashboardSummary
  statusDistribution: StatusDistributionRow[]
  priorityDistribution: PriorityDistributionRow[]
  timeToDecision: AverageTimeToDecision
  topRequesters: TopRequesterRow[]
  decisionBreakdown: DecisionBreakdownRow[]
  voteSummary: VoteSummaryStats
}

/**
 * Generate a PDF report for the analytics dashboard: a KPI summary block
 * plus one simple table per dataset. No charts — this mirrors what
 * generateRequestPDF does for a single request, just for aggregate data.
 */
export function generateAnalyticsPDF(input: AnalyticsPDFInput): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  let cursorY = MARGIN_Y

  function moveTo(y: number): void {
    if (y > PAGE_HEIGHT - MARGIN_Y) {
      doc.addPage()
      cursorY = MARGIN_Y
    } else {
      cursorY = y
    }
  }

  function heading(text: string, size = 16, gap = 8): void {
    doc.setFontSize(size).setFont("helvetica", "bold")
    doc.text(text, MARGIN_X, cursorY)
    moveTo(cursorY + gap)
  }

  function row(label: string, value: string): void {
    doc.setFontSize(10).setFont("helvetica", "bold")
    doc.text(label, MARGIN_X, cursorY)
    doc.setFont("helvetica", "normal")
    doc.text(value, MARGIN_X + 60, cursorY)
    moveTo(cursorY + 5)
  }

  heading("Analytics Report", 18, 10)

  doc.setFontSize(10).setFont("helvetica", "normal")
  doc.text(`Organization: ${input.orgName}`, MARGIN_X, cursorY)
  moveTo(cursorY + 5)
  doc.text(
    input.dateRange
      ? `Date range: ${input.dateRange.from} to ${input.dateRange.to}`
      : "Date range: All time",
    MARGIN_X,
    cursorY,
  )
  moveTo(cursorY + 5)
  doc.text(
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    MARGIN_X,
    cursorY,
  )
  moveTo(cursorY + 8)

  heading("Summary", 12, 6)
  row("Total Requests", String(input.summary.totalRequests))
  row("Pending Review", String(input.summary.pendingReview))
  row("In Backlog", String(input.summary.inBacklog))
  row("Completed", String(input.summary.completed))
  row(
    "Avg Quality Score",
    input.summary.avgQualityScore != null ? `${input.summary.avgQualityScore}%` : "—",
  )
  row(
    "Avg Time to Decision",
    input.timeToDecision.avgDays != null ? `${input.timeToDecision.avgDays} days` : "—",
  )
  moveTo(cursorY + 4)

  heading("Status Distribution", 12, 6)
  cursorY = drawTable(
    doc,
    ["Status", "Count"],
    input.statusDistribution.map((r) => [formatStatus(r.status), String(r.count)]),
    cursorY,
  )
  moveTo(cursorY + 6)

  heading("Priority Distribution", 12, 6)
  cursorY = drawTable(
    doc,
    ["Priority Band", "Count"],
    input.priorityDistribution.map((r) => [r.band, String(r.count)]),
    cursorY,
  )
  moveTo(cursorY + 6)

  heading("Top Requesters", 12, 6)
  cursorY = drawTable(
    doc,
    ["Name", "Request Count"],
    input.topRequesters.map((r) => [r.name, String(r.count)]),
    cursorY,
  )
  moveTo(cursorY + 6)

  heading("Decision Breakdown", 12, 6)
  cursorY = drawTable(
    doc,
    ["Decision", "Count"],
    input.decisionBreakdown.map((r) => [r.decision, String(r.count)]),
    cursorY,
  )
  moveTo(cursorY + 6)

  heading("Vote Summary", 12, 6)
  row("Total Votes", String(input.voteSummary.totalVotes))
  row("Unique Voters", String(input.voteSummary.uniqueVoters))
  row("Avg Score", String(input.voteSummary.avgScore))
  row(
    "Voted Requests",
    `${input.voteSummary.votedRequestsCount} / ${input.voteSummary.totalRequestsCount}`,
  )

  doc.setFontSize(8).setFont("helvetica", "italic")
  doc.text(
    `Generated ${new Date().toISOString().slice(0, 10)} · Virtual Product Owner`,
    MARGIN_X,
    PAGE_HEIGHT - 10,
  )

  const buffer = doc.output("arraybuffer") as ArrayBuffer
  return new Uint8Array(buffer)
}
