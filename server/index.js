import express from "express";
import fetch from "node-fetch";
import { extractContent } from "./extractContent.js";
import OpenAI from "openai";
import { TextDecoder } from "util";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// load .env from ./server
dotenv.config({ path: path.join(__dirname, ".env") });

const CHAT_APP_SERVER_PORT = process.env.PORT || 3500;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";
const MCP_ENDPOINT = process.env.MCP_ENDPOINT;
const MCP = MCP_ENDPOINT;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log("MCP endpoint:", MCP);

const AUTH = "Bearer local-dev"; // dev token

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.use((req, res, next) => {
  console.log("REQ URL →", req.url);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(3000, () => console.log("Static server ▶ http://localhost:3000"));

/* helper: return JSON, even when reply is SSE ------------------- */
async function safeJson(res) {
  const ctype = (res.headers.get("content-type") || "").toLowerCase();

  /* 1) Plain JSON */
  if (ctype.includes("application/json")) return res.json();

  /* 2) Assume SSE for anything else (incl. empty header) */
  const decoder = new TextDecoder();
  let buffer = "";

  // Works for Node.js Readable (fetch v2) & ReadableStream (v3)
  for await (const chunk of res.body) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk);

    const eventEnd = buffer.indexOf("\n\n"); // end of first event
    if (eventEnd !== -1) {
      const event = buffer.slice(0, eventEnd);
      const dataRow = event.split("\n").find((l) => l.startsWith("data:"));
      if (dataRow) {
        const jsonText = dataRow.replace(/^data:\s*/, "");
        try {
          return JSON.parse(jsonText);
        } catch {
          /* fall through */
        }
      }
      break;
    }
  }

  /* 3) If we get here the stream wasn’t JSON — return empty object */
  console.warn("↩ SSE stream contained no JSON payload");
  return {};
}

/* ────────── session state ────────── */
let sessionId;
let nextId = 1;
let catalog = { tools: [], prompts: [] };

/* ────────── helper: generic MCP call with logging ────────── */
async function callMcp(method, params = {}, id = nextId++) {
  console.log(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      ...(params ? { params } : {}),
    }),
    "\n"
  );
  const res = await fetch(MCP, {
    method: "POST",
    headers: {
      Authorization: AUTH,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Session-Id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      ...(Object.keys(params).length ? { params } : {}),
    }),
  });
  return safeJson(res); // ← instead of res.json()
}

/* ────────── helper: fetch an entire paged list ────────── */
async function listAll(method) {
  let cursor;
  const out = [];

  do {
    const res = await callMcp(method, cursor ? { cursor } : {});
    if (res.error) {
      console.warn(`⚠️  ${method} failed:`, res.error.message);
      return out;
    }
    out.push(...(res.result?.tools ?? res.result?.prompts ?? []));
    cursor = res.result?.nextCursor ?? null;
  } while (cursor);

  return out;
}

/* ────────── open MCP session & cache catalogs ────────── */
async function openSession() {
  /* 1️⃣  try initialize */
  console.log("=== STEP 1: initialize ===");
  const initRes = await fetch(MCP, {
    method: "POST",
    headers: {
      Authorization: AUTH,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {
          roots: {},
          sampling: {},
        },
        clientInfo: {
          name: "Example Local Client",
          version: "1.0.0",
        },
      },
    }),
  });
  const initBody = await safeJson(initRes);
  sessionId = initRes.headers.get("Mcp-Session-Id");

  if (initBody.error?.message?.includes("already initialized")) {
    console.warn("⚠️  server says already initialized — reusing old session");
    // we *must* already have a working sessionId or nothing will work:
    if (!sessionId) {
      console.error(
        "No session header in error response. Restart the hub or delete old sessions."
      );
      process.exit(1);
    }
  } else if (initBody.error) {
    console.error("Initialize failed:", initBody.error);
    process.exit(1);
  } else {
    console.log("← initialize OK:", initBody);
    console.log("   Session-ID:", sessionId, "\n");

    /* 2️⃣  notifications/initialized (only on fresh session) */
    await fetch(MCP, {
      method: "POST",
      headers: {
        Authorization: AUTH,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });
  }

  /* 3️⃣  full catalogs */
  console.log("=== STEP 3: list catalogs ===");
  catalog.tools = await listAll("tools/list");
  //catalog.prompts = await listAll("prompts/list");

  console.log(
    `✅ MCP session ${sessionId}\n` +
      `🛠  tools:   ${catalog.tools.map((t) => t.name).join(", ") || "(none)"}\n`
  );
}

await openSession();

/* ────────── /api/chat — main route ────────── */
app.post("/api/chat", async (req, res) => {
  const userText = req.body?.text ?? "";
  console.log("\n=== /api/chat  user:", userText);

  /* 1️⃣ ask GPT-4o for routing decision */
  const sys = `
You decide whether to
• call an MCP tool       (action:"callTool")
Return ONLY json:

{ "action":"callTool", "name":"...", "arguments":{...} }

Available tools:
${catalog.tools.map((t) => `- ${t.name}: ${t.description ?? ""}`).join("\n")}


`.trim();

  const funcSchema = {
    name: "route",
    description: "Choose tool or prompt",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["callTool", "getPrompt"] },
        name: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["action", "name", "arguments"],
    },
  };

  const gpt = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userText },
    ],
    tools: [{ type: "function", function: funcSchema }],
    tool_choice: "required",
  });

  console.log("GPT-4o raw:", JSON.stringify(gpt.choices[0].message));
  const call = gpt.choices[0].message.tool_calls?.[0];
  if (!call) throw new Error("LLM returned no tool call");

  const json = JSON.parse(call.function.arguments);
  const args =
    json.arguments && Object.keys(json.arguments).length
      ? json.arguments
      : { query: userText };
  console.log("GPT-4o decision:", json);

  /* 2️⃣ execute via MCP */
  let uiPayload = { text: "[no content]" };

  if (json.action === "callTool") {
    const { result } = await callMcp("tools/call", {
      name: json.name,
      arguments: args,
    });
    uiPayload = extractContent(result);
  } else if (json.action === "getPrompt") {
    const { result } = await callMcp("prompts/get", {
      name: json.name,
      arguments: args,
    });
    uiPayload = extractContent(result);
  }
  console.log("UI payload:", uiPayload, "\n");
  res.json(uiPayload);
});

/* ────────── start web server ────────── */
app.listen(CHAT_APP_SERVER_PORT, () =>
  console.log(`🗨  chat UI: http://localhost:${CHAT_APP_SERVER_PORT}`)
);
