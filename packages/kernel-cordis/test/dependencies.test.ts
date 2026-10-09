import { dependenciesSuite } from "@godspeedai/cognate-kernel-api/conformance";
import { createCordisKernel } from "../src/index.ts";

dependenciesSuite("kernel-cordis", createCordisKernel);
