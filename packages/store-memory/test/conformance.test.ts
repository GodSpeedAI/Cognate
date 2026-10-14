import { storeConformance } from "@godspeedai/cognate-events/conformance";
import { createMemoryStore } from "../src/index.ts";

storeConformance("store-memory", async () => {
  const store = createMemoryStore();
  return { store, dispose: () => store.close() };
}, { persistent: false, fencedOutbox: true });
