import { effectsSuite } from "@godspeedai/kernel-api/conformance";
import { createCordisKernel } from "../src/index.ts";

effectsSuite("kernel-cordis", createCordisKernel);
