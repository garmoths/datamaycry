/**
 * Reading the project's "DMC1" binary files (magic, uint32 header length, JSON header padded
 * to 8 bytes, little-endian int16 payload, −32768 = missing). Pure: used by the browser
 * (data.ts) and by the public API (api/, apiCore.ts).
 * Written with AI assistance (Claude).
 */
import { DMC_MAGIC, MISSING_INT16, SCHEMA_VERSION, type Packing } from "../../contract/types.ts";

export class DataError extends Error {}

export function checkVersion(v: string, what: string): void {
  const major = (s: string) => s.split(".")[0];
  if (major(v) !== major(SCHEMA_VERSION)) {
    throw new DataError(`${what}: schema ${v} is not compatible with this app (${SCHEMA_VERSION})`);
  }
}

/** Parse a "DMC1" binary file into its JSON header and int16 payload. */
export function parseDmc<H extends { schema_version: string }>(buf: ArrayBuffer, what: string): { header: H; data: Int16Array } {
  const view = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== DMC_MAGIC) throw new DataError(`${what}: not a DMC1 file`);
  const hlen = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen))) as H;
  checkVersion(header.schema_version, what);
  const offset = 8 + hlen;
  if (offset % 8 !== 0) throw new DataError(`${what}: header not padded to 8 bytes`);
  // little-endian int16: every Apple/Intel/ARM machine is little-endian
  const data = new Int16Array(buf, offset, (buf.byteLength - offset) / 2);
  return { header, data };
}

export function unpack(raw: Int16Array, p: Packing): Float64Array {
  const out = new Float64Array(raw.length);
  for (let k = 0; k < raw.length; k++) out[k] = raw[k] === MISSING_INT16 ? NaN : raw[k] * p.scale + p.offset;
  return out;
}

/** Grid cell nearest to a coordinate (MERRA-2 0.5° × 0.625°). */
export function cellOf(lat: number, lon: number): { i: number; j: number; lat: number; lon: number } {
  const i = Math.min(360, Math.max(0, Math.round((lat + 90) / 0.5)));
  const j = ((Math.round((lon + 180) / 0.625) % 576) + 576) % 576;
  return { i, j, lat: -90 + i * 0.5, lon: -180 + j * 0.625 };
}

/** Tile that contains cell (i, j). The top tile row (ty = 17) holds 21 rows. */
export function tileOf(i: number, j: number): { tx: number; ty: number } {
  return { ty: Math.min(Math.floor(i / 20), 17), tx: Math.floor(j / 16) };
}
