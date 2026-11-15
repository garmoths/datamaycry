/** GET /api/v1/places?q=diyarbakir&limit=10 — find place ids. Written with AI assistance (Claude). */
import { handle, readQuery } from "../../src/apiCore.ts";
import { getApi } from "../_source.ts";

export const config = { runtime: "edge" };

export default function handler(req: Request): Promise<Response> {
  const q = readQuery(new URL(req.url));
  return handle(() => getApi().places(q.q, q.limit));
}
