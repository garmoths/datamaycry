/**
 * GET /api/v1/trend?place=TR-21&var=T2M&from=1980&to=2025&season=all
 * GET /api/v1/trend?lat=37.9&lon=40.2&var=PRECTOT
 * The result card as JSON: evidence level, change per decade and total, 95 % range, p, plain text.
 * Written with AI assistance (Claude).
 */
import { handle, readQuery } from "../../src/apiCore.ts";
import { getApi } from "../_source.ts";

export const config = { runtime: "edge" };

export default function handler(req: Request): Promise<Response> {
  const q = readQuery(new URL(req.url));
  return handle(() => getApi().trend(q));
}
