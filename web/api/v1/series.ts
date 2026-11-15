/** GET /api/v1/series?place=TUR&var=T2M — the monthly values (1980-01 …). Written with AI assistance (Claude). */
import { handle, readQuery } from "../../src/apiCore.ts";
import { getApi } from "../_source.ts";

export const config = { runtime: "edge" };

export default function handler(req: Request): Promise<Response> {
  const q = readQuery(new URL(req.url));
  return handle(() => getApi().series(q));
}
