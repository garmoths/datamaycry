/**
 * Data source for the API functions: the same public data package the site reads (Cloudflare R2).
 * Override with the DATA_ORIGIN environment variable (must end with "/").
 * Files starting with "_" are not routes on Vercel.
 * Written with AI assistance (Claude).
 */
import { createApi, type Api, type FileSource } from "../src/apiCore.ts";

const ORIGIN: string =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.DATA_ORIGIN ??
  "https://pub-1b8083d3e44245489c0e4947338622e2.r2.dev/v1/";

async function get(path: string): Promise<Response> {
  const res = await fetch(ORIGIN + path);
  if (!res.ok) throw new Error(`${res.status} while loading ${path}`);
  return res;
}

const source: FileSource = {
  text: async (p) => (await get(p)).text(),
  bin: async (p) => (await get(p)).arrayBuffer(),
};

// kept between requests while the function instance is warm
let api: Api | undefined;
export function getApi(): Api {
  return (api ??= createApi(source));
}
