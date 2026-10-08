import { dependenciesSuite } from "@godspeedai/kernel-api/conformance";
import { createCordisKernel } from "../src/index.ts";

dependenciesSuite("kernel-cordis", createCordisKernel);
