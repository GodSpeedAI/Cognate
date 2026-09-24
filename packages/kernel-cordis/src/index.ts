import type { KernelFactory } from "@cognate/kernel-api";

// Contract-first placeholder: the conformance suites must fail until the adapter exists.
export const createCordisKernel: KernelFactory = () => {
  throw new Error("kernel-cordis: not implemented");
};
