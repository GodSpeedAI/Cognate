import { scopesSuite } from "@godspeedai/cognate-kernel-api/conformance";
import { createCordisKernel } from "../src/index.ts";

scopesSuite("kernel-cordis", createCordisKernel);
