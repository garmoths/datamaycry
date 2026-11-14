/** Paints and encodes the smooth trend picture off the main thread. Written with AI assistance (Claude). */
import { encodePixels, paintTrendPixels, type TrendInput } from "./trendImage.ts";

self.onmessage = async (e: MessageEvent<TrendInput>) => {
  const blob = await encodePixels(paintTrendPixels(e.data));
  (self as unknown as Worker).postMessage(blob);
};
