// Example: capability-hot-swap — a capability provider is replaced live, with no downtime for callers.
// Docs: docs/concepts.md (spec §8.3, §35: components can be mounted and disposed while the kernel runs).
import { allowCapabilities } from "@godspeedai/cognate-kernel-api";
import { providerComponent } from "@godspeedai/cognate-profile-harness";
import { localProvider } from "@godspeedai/cognate-provider-local";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";

const alice = { actor: { id: "alice", kind: "user" as const }, tenant: "tenant-a" };
const request = { messages: [{ role: "user" as const, content: "hello" }] };

async function main() {
  const runtime = await createRuntime({
    store: ":memory:",
    policy: allowCapabilities("hot-swap-example", ["model.generate"]),
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [],
  });
  try {
    const providerA = localProvider({ id: "a", rules: [{ respond: () => ({ message: { role: "assistant", content: "response from A" }, toolCalls: [], finishReason: "stop" }) }] });
    const providerB = localProvider({ id: "b", rules: [{ respond: () => ({ message: { role: "assistant", content: "response from B" }, toolCalls: [], finishReason: "stop" }) }] });

    const handleA = await runtime.kernel.mount(providerComponent(providerA));
    await handleA.waitFor("ACTIVE", 5000);
    const first = (await runtime.service.invoke(alice, { capability: "model.generate", input: request as never })) as { message: { content: string } };
    if (first.message.content !== "response from A") throw new Error(`expected provider A's response, got: ${JSON.stringify(first)}`);

    // Swap live: dispose A, mount B. No agent or caller code changes.
    await handleA.dispose("hot swap to provider B");
    const handleB = await runtime.kernel.mount(providerComponent(providerB));
    await handleB.waitFor("ACTIVE", 5000);
    const second = (await runtime.service.invoke(alice, { capability: "model.generate", input: request as never })) as { message: { content: string } };
    if (second.message.content !== "response from B") throw new Error(`expected provider B's response after the swap, got: ${JSON.stringify(second)}`);

    console.log(`ok: hot-swapped model.generate from provider A ("${first.message.content}") to provider B ("${second.message.content}") without restarting the runtime`);
  } finally {
    await runtime.close();
  }
}

await main();
