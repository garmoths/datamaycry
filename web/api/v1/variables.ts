/** GET /api/v1/variables — the nine variables, units, data period. Written with AI assistance (Claude). */
import { handle } from "../../src/apiCore.ts";
import { getApi } from "../_source.ts";

export const config = { runtime: "edge" };

export default function handler(): Promise<Response> {
  return handle(() => getApi().variables());
}
