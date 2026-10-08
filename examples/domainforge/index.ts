// Example: domainforge — a DomainForge model becomes read-only semantic objects, then an explicit capability binding.
// Docs: docs/semantics.md (ADR-0002; spec §19: no implicit capabilities from a semantic projection).
import { bindCapabilities, loadSemanticProjection, mappingTable, serializeProjection } from "@godspeedai/cognate-domainforge";

const source = `
Entity "Warehouse" in logistics
Entity "Factory" in manufacturing
Resource "Cameras" units in equipment
Flow "Cameras" from "Warehouse" to "Factory" quantity 10
`.trim();

async function main() {
  const result = loadSemanticProjection(source, { uri: "example:///logistics.sea" });
  if (!result.ok) throw new Error(`expected a valid projection, got: ${JSON.stringify(result.error)}`);
  const projection = result.projection;

  const warehouse = projection.objects.find((o) => o.ref.id === "logistics::Warehouse");
  if (!warehouse || warehouse.kind !== "Entity") throw new Error(`expected Warehouse entity, got: ${JSON.stringify(warehouse)}`);

  const flow = projection.objects.find((o) => o.kind === "Flow");
  if (!flow) throw new Error("expected a Flow object");
  if (!projection.relations.some((r) => r.type === "flow.from" && r.to === "logistics::Warehouse")) throw new Error("expected a flow.from relation to the warehouse");

  // Serialization is deterministic (same projection -> byte-identical output).
  const reloaded = loadSemanticProjection(source, { uri: "example:///logistics.sea" });
  if (!reloaded.ok || serializeProjection(projection) !== serializeProjection(reloaded.projection)) throw new Error("expected deterministic serialization");

  // No semantic object is a capability until the application binds it explicitly.
  if (bindCapabilities(projection, []).length !== 0) throw new Error("expected no capabilities without an explicit binding");
  const [contract] = bindCapabilities(projection, [{ semanticId: "logistics::Warehouse", capability: { id: "warehouse.read", version: "1.0.0" } }]);
  if (contract?.semanticRef?.id !== "logistics::Warehouse") throw new Error(`expected a bound capability with provenance, got: ${JSON.stringify(contract)}`);

  const supportedKinds = mappingTable.filter((row) => row.supported).map((row) => row.kind);
  if (!supportedKinds.includes("Entity") || !supportedKinds.includes("Flow")) throw new Error(`expected Entity and Flow to be mapped, got: ${JSON.stringify(supportedKinds)}`);

  console.log(`ok: DomainForge model produced ${projection.objects.length} read-only semantic objects; capability "warehouse.read" was bound explicitly with provenance to ${contract.semanticRef!.id}`);
}

await main();
