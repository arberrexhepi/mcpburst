// bridgeStdio.ts  – only the parts that change
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client }              from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer }           from "@modelcontextprotocol/sdk/server/mcp.js";
import { z }                   from "zod";

/* ───────── minimal WHITELISTED env ───────── */
function minimalEnv(extra: Record<string, string>) {
  const baseVars = [
    // ─ core runtime ─
    "PATH", "HOME", "USERPROFILE", "TEMP", "TMP",
    // ─ npm / npx on Windows ─
    "APPDATA", "LOCALAPPDATA"
  ];

  const env: Record<string, string> = {};
  for (const k of baseVars) {
    if (process.env[k]) env[k] = process.env[k] as string;
  }
  return { ...env, ...extra };
}

/* ───────── bridge function ───────── */
export async function bridgeStdio(
  hub: McpServer,
  command: string,
  args: string[],
  prefix: string          // e.g.  "brave"
) {
  const envVar = `${prefix.toUpperCase()}_API_KEY`;   // "BRAVE_API_KEY"
  const apiKey = process.env[envVar] ?? "";

  const transport = new StdioClientTransport({
    command,
    args,
    env: minimalEnv({
      [envVar]: apiKey,          // **only** this secret
      DEBUG:   `${prefix}:*`, // remote logging (optional)
      NODE_DEBUG: "undici"      // (optional) raw HTTP traces

    }),
      // 👇 makes the child’s stdout/stderr go straight to the hub’s console
  });



  console.log(`[bridge] ${envVar} in child:`, apiKey ? "(set)" : "(empty)");



  const client = new Client({
  name: `bridge-${prefix}`,
  version: "0.1",
  requestTimeout: 30_000          // 30 s
});
await client.connect(transport);

console.log("transport", transport);
// ── hook up logs *once* ─────────────────────────────────────────────
const child = (transport as unknown as { _process?: import("child_process").ChildProcess })._process;
if (child) {
  if (child.stdout) child.stdout.pipe(process.stdout);
  if (child.stderr) child.stderr.pipe(process.stderr);
  console.log(`[bridge] child PID ${child.pid}`);
} else {
  console.warn("[bridge] no child process found – nothing to pipe");
}


  const { tools }   = await client.listTools().catch(() => ({ tools: [] }));
  const { prompts } = await client.listPrompts().catch(() => ({ prompts: [] }));

function jsonSchemaToZodShape(jsonSchema: any): Record<string, any> {
  if (!jsonSchema?.properties) {
    return {};
  }

  const shape: Record<string, any> = {};
  
  for (const [key, prop] of Object.entries(jsonSchema.properties as Record<string, any>)) {
    // Convert JSON schema types to Zod types
    switch (prop.type) {
      case 'string':
        shape[key] = z.string();
        break;
      case 'number':
        shape[key] = z.number();
        break;
      case 'integer':
        shape[key] = z.number().int();
        break;
      case 'boolean':
        shape[key] = z.boolean();
        break;
      case 'array':
        shape[key] = z.array(z.any());
        break;
      case 'object':
        shape[key] = z.object({}).passthrough();
        break;
      default:
        shape[key] = z.any();
    }

    // Make optional if not in required array
    if (!jsonSchema.required?.includes(key)) {
      shape[key] = shape[key].optional();
    }

    // Add description if available
    if (prop.description) {
      shape[key] = shape[key].describe(prop.description);
    }
  }

  return shape;
}

for (const t of tools as any[]) {
  // 1) Convert JSON schema to Zod schema shape
  const zodShape = jsonSchemaToZodShape(t.inputSchema);
  
  // 2) Build the Zod schema
  const schema = z.object(zodShape).passthrough();

  console.log(`[bridge] tool ${t.name} schema shape:`, zodShape);
  console.log(`[bridge] tool ${t.name} input schema:`, t.inputSchema);

  // 3) Pull description into annotations
  const annotations = {
    ...(t.annotations ?? {}),
    description: t.description ?? t.name,
    openWorldHint: true,
  };

  // 3) call the 4-arg overload: name, schema, annotations, handler
  hub.tool(
    `${prefix}/${t.name}`,
    schema.shape,
    annotations,
 async (args: any, _extra: any) => {  
      console.log("[bridge] args =", args); // ← will now show { query: "react", … }
      console.log(`[bridge] → ${t.name} with `, _extra);
      try {
        /* call the upstream tool (30-s per-call timeout) */
        const  result = await client.callTool(
          { name: t.name, arguments: args}
        );

        console.log(`[bridge] ← ${t.name} OK with `, result);
      return result as any; // return the result as-is
          } catch (e) {
        /* log & surface the error without crashing the hub */
        console.error(`[bridge] ← ${t.name} ERROR`, e);

        return {
          content: [
            {
              type: "text",
              text:
                e instanceof Error
                  ? e.message
                  : String(e ?? "unknown error"),
            },
          ],
          isError: true,
        };
      }
    },
  );
}

  console.log(`🔗 bridged stdio "${command} ${args.join(" ")}" → "${prefix}/…"`);
}
