import { contractSuite } from "@cognate/kernel-api/conformance";
import { createCordisKernel } from "../src/index.ts";

contractSuite("kernel-cordis", createCordisKernel);
