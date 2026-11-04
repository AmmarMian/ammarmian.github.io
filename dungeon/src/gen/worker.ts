/* Builds floors off the main thread, so climbing never stalls the frame loop. */
import { makeFloor } from './make.ts';

self.onmessage = (e: MessageEvent<{ index: number }>) => {
  const f = makeFloor(e.data.index);
  (self as unknown as Worker).postMessage(f, [f.vox.buffer, f.table.buffer]);
};
