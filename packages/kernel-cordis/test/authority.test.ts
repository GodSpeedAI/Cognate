import { authoritySuite } from "@godspeedai/kernel-api/conformance";
import { createCordisKernel } from "../src/index.ts";

authoritySuite("kernel-cordis", createCordisKernel);
