import { effectsSuite } from "@godspeedai/cognate-kernel-api/conformance";
import { createCordisKernel } from "../src/index.ts";

effectsSuite("kernel-cordis", createCordisKernel);
