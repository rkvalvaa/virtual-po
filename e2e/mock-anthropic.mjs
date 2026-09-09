// Offline stand-in for the Anthropic Messages API, used by the E2E suite so the
// intake chat can be driven end to end without network access or an API key.
//
// Plain .mjs rather than .ts on purpose: Playwright's `webServer.command` is a
// raw shell command with no TypeScript transform, and CI runs Node 20, which
// has no `--experimental-strip-types`.
//
// ponytail: one fixed reply, no tool_use blocks. Add request-aware replies when
// a spec needs the agent to branch.
import http from "node:http";

const PORT = Number(process.env.MOCK_ANTHROPIC_PORT ?? 4010);

/** Keep in sync with the expectation in e2e/intake.spec.ts. */
const REPLY = "Thanks. What problem does this solve for users?";

const MODEL = "claude-opus-5";
const USAGE = { input_tokens: 12, output_tokens: 11 };

/** Split into a few deltas so the client exercises real streaming assembly. */
const CHUNKS = ["Thanks. ", "What problem does ", "this solve for users?"];

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamMessage(res, calls = []) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  res.write(
    sse("message_start", {
      type: "message_start",
      message: {
        id: "msg_e2e_mock",
        type: "message",
        role: "assistant",
        model: MODEL,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: USAGE.input_tokens, output_tokens: 0 },
      },
    }),
  );
  if (calls.length) {
    for (const [index, call] of calls.entries()) {
      res.write(sse("content_block_start", { type: "content_block_start", index,
        content_block: { type: "tool_use", id: `tool_${call.name}_${index}`, name: call.name, input: {} } }));
      res.write(sse("content_block_delta", { type: "content_block_delta", index,
        delta: { type: "input_json_delta", partial_json: JSON.stringify(call.input) } }));
      res.write(sse("content_block_stop", { type: "content_block_stop", index }));
    }
  } else {
  res.write(
    sse("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
  );
  for (const text of CHUNKS) {
    res.write(
      sse("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text },
      }),
    );
  }
  res.write(sse("content_block_stop", { type: "content_block_stop", index: 0 }));
  }
  res.write(
    sse("message_delta", {
      type: "message_delta",
      delta: { stop_reason: calls.length ? "tool_use" : "end_turn", stop_sequence: null },
      usage: { output_tokens: USAGE.output_tokens },
    }),
  );
  res.write(sse("message_stop", { type: "message_stop" }));
  res.end();
}

function jsonMessage(res) {
  const body = JSON.stringify({
    id: "msg_e2e_mock",
    type: "message",
    role: "assistant",
    model: MODEL,
    content: [{ type: "text", text: REPLY }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: USAGE,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(body);
}

const failedAssessments = new Set();
function workflowCalls(body) {
  const serialized = JSON.stringify(body);
  if (!serialized.includes("E2E_WORKFLOW")) return [];
  const tools = new Set(body.tools?.map(tool => tool.name));
  const blocks = body.messages.flatMap(message => Array.isArray(message.content) ? message.content : []);
  const used = name => blocks.some(block => block.type === "tool_use" && block.name === name);
  if (tools.has("save_intake_progress")) {
    if (!used("save_intake_progress")) return ["problem_statement", "target_users", "proposed_solution", "business_value", "success_metrics", "urgency_timeline", "constraints"].map(section => ({ name: "save_intake_progress", input: { section, data: { detail: "E2E_WORKFLOW CSV export for product managers" }, completeness: 100 } }));
    if (!used("check_quality_score")) return [{ name: "check_quality_score", input: {} }];
    if (!used("mark_intake_complete")) return [{ name: "mark_intake_complete", input: { summary: "E2E_WORKFLOW CSV export" } }];
  } else if (tools.has("save_assessment")) {
    if (!used("save_assessment")) return [{ name: "save_assessment", input: { businessScore: 70, technicalScore: 80, riskScore: 20, priorityScore: 75, policyVersion: 0, scoringInputs: { reach: 5, impact: 3, confidence: 100, effort: 2 }, complexity: "S", assessmentData: { executive_summary: "E2E_WORKFLOW useful CSV export" } } }];
  } else if (tools.has("save_security_review")) {
    if (!used("save_security_review")) return [{ name: "save_security_review", input: { categories: [], overallSeverity: "none", summary: "E2E_WORKFLOW no additional concerns", recommendations: [], requiresSecurityReview: false, gaps: [] } }];
  } else if (tools.has("save_epic")) {
    if (!used("save_epic")) return [{ name: "save_epic", input: { title: "CSV backlog export", description: "Export the filtered backlog", goals: ["Save time"], successCriteria: ["Valid CSV download"] } }];
    const epicCall = blocks.find(block => block.type === "tool_use" && block.name === "save_epic");
    const result = blocks.find(block => block.type === "tool_result" && block.tool_use_id === epicCall?.id);
    const content = typeof result?.content === "string" ? result.content : result?.content?.filter(p => p.type === "text").map(p => p.text).join("");
    const epicId = content ? JSON.parse(content).epicId : undefined;
    if (epicId && !used("save_user_story")) return [{ name: "save_user_story", input: { epicId, title: "Download backlog CSV", asA: "product manager", iWant: "a CSV export", soThat: "I can analyze requests", acceptanceCriteria: ["Given requests, when exporting, then download valid CSV"], priority: 1, storyPoints: 3 } }];
    if (used("save_user_story") && !used("complete_output")) return [{ name: "complete_output", input: { storyCount: 1 } }];
  }
  return [];
}

const server = http.createServer((req, res) => {
  console.log(`[mock-anthropic] ${req.method} ${req.url}`);

  if (req.method === "GET") {
    // Playwright probes this to decide the server is up.
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method !== "POST" || !req.url?.endsWith("/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "Not found" } }));
    return;
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    let wantsStream = false;
    let body;
    try {
      body = JSON.parse(raw);
      wantsStream = body.stream === true;
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Invalid JSON" } }));
      return;
    }
    console.log(`[mock-anthropic] replying (stream=${wantsStream})`);
    const scenarioKey = JSON.stringify(body.system);
    if (raw.includes("E2E_WORKFLOW") && body.tools?.some(tool => tool.name === "save_assessment") && !failedAssessments.has(scenarioKey)) {
      failedAssessments.add(scenarioKey);
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Simulated stage failure; retry the saved request" } }));
      return;
    }
    if (wantsStream) streamMessage(res, workflowCalls(body));
    else jsonMessage(res);
  });
});

server.listen(PORT, () => {
  console.log(`[mock-anthropic] listening on http://localhost:${PORT}`);
});
