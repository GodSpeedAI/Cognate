import { lifecycleSuite } from "@godspeedai/cognate-kernel-api/conformance";
import { createCordisKernel } from "../src/index.ts";

lifecycleSuite("kernel-cordis", createCordisKernel);
