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

const MODEL = "claude-sonnet-4-5-20250929";
const USAGE = { input_tokens: 12, output_tokens: 11 };

/** Split into a few deltas so the client exercises real streaming assembly. */
const CHUNKS = ["Thanks. ", "What problem does ", "this solve for users?"];

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamMessage(res) {
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
  res.write(
    sse("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
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
    try {
      wantsStream = JSON.parse(raw).stream === true;
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Invalid JSON" } }));
      return;
    }
    console.log(`[mock-anthropic] replying (stream=${wantsStream})`);
    if (wantsStream) streamMessage(res);
    else jsonMessage(res);
  });
});

server.listen(PORT, () => {
  console.log(`[mock-anthropic] listening on http://localhost:${PORT}`);
});
