// installToolsFeature.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Register local demo tools on the given server.
 * Call  installToolsFeature(hub)  once during bootstrap.
 */
export function installToolsFeature(server: McpServer) {
  /* ---- echo ---------------------------------------------------- */
  server.tool(
    "echo",
    {                         // ← ZodRawShape, NOT JSON-schema
      text: z.string()
    },
    {                         // annotations (optional)
      description: "Returns the arguments verbatim (demo tool)"
    },
    async ({ text }) => ({
      content: [{ type: "text", text }],   // ToolResult
      isError: false
    })
  );
}
