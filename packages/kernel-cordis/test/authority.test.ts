import { authoritySuite } from "@godspeedai/cognate-kernel-api/conformance";
import { createCordisKernel } from "../src/index.ts";

authoritySuite("kernel-cordis", createCordisKernel);
