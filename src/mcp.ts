/**
 * reviewthread MCP server. Tools: triage_review_comments.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The computation is pure and local: no upstream API, no
 * authentication, and no configuration — the caller supplies
 * every fact the verdicts are based on.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { formatPayload, triageReviewComments, VERSION } from "./reviewthread.js";

const TOOLS = [
  {
    name: "triage_review_comments",
    description:
      "Classify pull-request review comments as actionable, noise, closed, stale, or duplicate from caller-supplied comment facts: author kind, thread state, failing-check linkage, and body. Returns one verdict per comment with the exact rule that fired as evidence.",
    inputSchema: {
      type: "object" as const,
      properties: {
        comments: {
          type: "array",
          description: "Review comments to classify",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Comment identifier",
              },
              author: {
                type: "string",
                description: "Comment author name",
              },
              author_kind: {
                type: "string",
                description: "Whether the author is a bot or a human",
                enum: ["bot", "human"],
              },
              body: {
                type: "string",
                description: "Comment body text",
              },
              state: {
                type: "string",
                description: "Thread state of the comment",
                enum: ["open", "resolved", "outdated"],
              },
              failing_check: {
                type: "boolean",
                description:
                  "Whether the comment is attached to a currently failing check",
              },
              duplicate_of: {
                type: "string",
                description: "Id of another comment this one duplicates (optional)",
              },
            },
            required: ["id", "author", "author_kind", "body", "state"],
          },
        },
      },
      required: ["comments"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "reviewthread", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "triage_review_comments") {
      out = triageReviewComments(args ?? {});
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
