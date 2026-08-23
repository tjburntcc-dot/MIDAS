import { start } from "./server.js";

export { start, createHttpServer, handle } from "./server.js";

const listen = process.env.MIDAS_API_LISTEN === "1" || process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (listen && process.env.MIDAS_API_DEFER !== "1") {
  // server.ts also self-starts when executed directly
}

void start;
