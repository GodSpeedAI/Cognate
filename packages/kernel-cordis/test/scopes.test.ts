import { scopesSuite } from "@godspeedai/kernel-api/conformance";
import { createCordisKernel } from "../src/index.ts";

scopesSuite("kernel-cordis", createCordisKernel);
