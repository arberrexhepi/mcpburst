import fs from "fs";
import yaml from "js-yaml";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { bridgeHttp } from "./bridgeHttp.js";
import { bridgeStdio } from "./bridgeStdio.js";


const Config = z.object({
  servers: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("http"),
        prefix: z.string(),
        url: z.string().url(),
        apiKeyEnv: z.string().optional(),
      }),
      z.object({
        type: z.literal("stdio"),
        prefix: z.string(),
        cmd: z.string(),
        args: z.array(z.string()).optional(),
      }),
    ])
  ),
});

export function main(hub: McpServer): Promise<void>[] {
  const raw = yaml.load(fs.readFileSync("./bridges/hub.yaml", "utf8"));
  const { servers } = Config.parse(raw);
  const tasks: Promise<void>[] = [];

  for (const s of servers) {
    if (s.type === "http") {
      tasks.push(bridgeHttp(hub, s.url, s.prefix, process.env[s.apiKeyEnv!]));
    } else {
      tasks.push(bridgeStdio(hub, s.cmd, s.args||[], s.prefix));
    }
  }

  return tasks;
}