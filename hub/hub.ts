import express,  { Request, Response }  from "express";
import helmet  from "helmet";
import { randomUUID } from "node:crypto";
import debug   from "debug";               // typed after you install @types/debug
import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport }
  from "@modelcontextprotocol/sdk/server/streamableHttp.js";


import { installToolsFeature } from "./installToolsFeature.js";
import { main } from "./bridgeBuilder.js";


/* ───────── config ───────── */
const PORT         = Number(process.env.PORT) || 4000;
const HOST         = process.env.HOST ?? "localhost";
const REQUIRE_AUTH = process.env.MCP_REQUIRE_AUTH !== "false";

/* ───────── debug helpers ───────── */
const logReq  = debug("hub:req");
const logRes  = debug("hub:res");
const logErr  = debug("hub:err");
const logBrid = debug("hub:bridge");

const GITHUB_API_KEY = process.env.GITHUB_API_KEY ?? false;
/* ───────── launch hub ───────── */
const hub = new McpServer({ name: "hub", version: "1.0.0" });
installToolsFeature(hub); 


const BRIDGES = main(hub);
await Promise.all(BRIDGES);



/* ───────── transport ───────── */
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

await hub.connect(transport);

/* ───────── Express façade ───────── */
const app = express();
app.use(helmet());
app.use(express.json());

/* optional bearer-token gate */
const requireBearer: express.RequestHandler = (req, res, next) => {
  if (!REQUIRE_AUTH) return next();
  if (!req.headers.authorization?.startsWith("Bearer ")) {
    res.status(401).setHeader("WWW-Authenticate", 'Bearer realm="mcp"').end();
    return;
  }
  next();
};

/* timing / error log wrapper */
app.all("/mcp", requireBearer, (req, res) => {
  const start   = Date.now();
  const id      = req.body?.id ?? "null";
  const method  = req.body?.method ?? req.method;

  logReq(`← id=${id}\t${method}`);

  res.on("finish", () => {
    const took = Date.now() - start;
    const tag  = res.statusCode >= 400 ? "ERR" : "OK";
    logRes(`→ id=${id}\t${tag} (${took} ms)`);
  });

  /* hand over to the SDK transport */
  transport.handleRequest(
    req,
    res,
    req.method === "POST" ? req.body : undefined,
  );
});

app.get('/health', (req: Request, res: Response): void => {
  res.send('ok');
});

app.listen(PORT, HOST, () =>
  console.log(`🌐 MCP hub on http://${HOST}:${PORT}/mcp — auth ${REQUIRE_AUTH ? "ON" : "OFF"}`),
);
