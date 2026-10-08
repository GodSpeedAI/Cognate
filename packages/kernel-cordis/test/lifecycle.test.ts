import { lifecycleSuite } from "@godspeedai/kernel-api/conformance";
import { createCordisKernel } from "../src/index.ts";

lifecycleSuite("kernel-cordis", createCordisKernel);
