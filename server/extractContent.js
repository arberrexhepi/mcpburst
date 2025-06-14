// extractContent.js  – turn any MCP ToolResult / PromptMessage into plain UI data

/**
 * Flatten an MCP ToolResult or messages array into:
 *   { text: "...", attachments: [...] }
 *
 * • Concatenates all text snippets in order.
 * • Puts non-text blobs (images, audio, json, etc.) in `attachments`.
 * • Guaranteed to always return at least one property.
 */
export function extractContent(payload) {
  if (!payload) return { text: "[empty]" };

  /** Normalise input:
   *  - ToolResult: { content:[...], isError }
   *  - Prompt get : { messages:[{ role, content }] }
   */
  const items = Array.isArray(payload.content)
    ? payload.content // ToolResult
    : Array.isArray(payload.messages)
    ? payload.messages.map((m) => m.content) // Prompt
    : [payload];

  let text = "";
  const attachments = [];

  for (const c of items) {
    if (!c) continue;

    switch (c.type) {
      case "text":
        if (typeof c.text === "string") {
          text += (text ? "\n" : "") + c.text;
        }
        break;
      case "image":
      case "audio":
      case "video":
      case "json":
      default:
        attachments.push(c); // keep the raw item for UI
    }
  }

  return attachments.length ? { text, attachments } : { text };
}
