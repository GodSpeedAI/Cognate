// Public surface of @godspeedai/cognate-kernel-cordis. No Cordis type crosses this boundary (spec §3.4).
import type { KernelFactory } from "@godspeedai/cognate-kernel-api";
import { CordisKernel } from "./kernel.ts";

export const createCordisKernel: KernelFactory = (options) => new CordisKernel(options);
