// bridgeHttp.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport }
  from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
export async function bridgeHttp(
  hub   : McpServer,
  url   : string,
  prefix: string,
  apiKey?: string                       // optional arg ➊
) {
  // auto-detect:  "GITHUB_API_KEY",  "BRAVE_API_KEY", …
  if (!apiKey) {
    const envVar = `${prefix.toUpperCase()}_API_KEY`;
    apiKey = process.env[envVar];
  }

  const transport = new StreamableHTTPClientTransport(
    new URL(url),
    apiKey
      ? { requestInit: { headers: { Authorization: `Bearer ${apiKey}` } } }
      : undefined
  );

  /* 2️⃣  open client session */
  const client = new Client({ name: `bridge-${prefix}`, version: "0.1" });
  await client.connect(transport);

  /* 3️⃣  pull catalog */
  const { tools }   = await client.listTools();
  const { prompts } = await client.listPrompts().catch(() => ({ prompts: [] }));

  /* 3️⃣  re-expose every tool */




// Helper function to convert JSON schema properties to Zod schema shape
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

  console.log(`🔗 bridged HTTP ${url}  →  "${prefix}/…"`);
}
