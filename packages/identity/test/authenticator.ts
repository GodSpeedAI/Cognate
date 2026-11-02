// A software passkey for tests: builds registration and assertion payloads the way a browser would.
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { b64url } from "../src/index.ts";

type Cbor = number | string | Uint8Array | Map<Cbor, Cbor>;

function head(major: number, value: number): number[] {
  if (value < 24) return [(major << 5) | value];
  if (value < 256) return [(major << 5) | 24, value];
  return [(major << 5) | 25, value >> 8, value & 0xff];
}

export function encode(value: Cbor): Uint8Array {
  if (typeof value === "number") return Uint8Array.from(value >= 0 ? head(0, value) : head(1, -1 - value));
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    return Uint8Array.from([...head(3, bytes.length), ...bytes]);
  }
  if (value instanceof Uint8Array) return Uint8Array.from([...head(2, value.length), ...value]);
  const parts: number[] = head(5, value.size);
  for (const [key, item] of value) parts.push(...encode(key), ...encode(item));
  return Uint8Array.from(parts);
}

const sha256 = (bytes: Uint8Array): Buffer => createHash("sha256").update(bytes).digest();
const concat = (...parts: Uint8Array[]): Uint8Array => Uint8Array.from(parts.flatMap((part) => [...part]));
const u32 = (n: number): Uint8Array => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

export interface Flags {
  readonly up?: boolean;
  readonly uv?: boolean;
}

export class SoftPasskey {
  readonly credentialId: Uint8Array;
  private readonly privateKey: KeyObject;
  private readonly x: Uint8Array;
  private readonly y: Uint8Array;

  constructor(seed = 1) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: "jwk" });
    this.x = new Uint8Array(Buffer.from(jwk.x as string, "base64url"));
    this.y = new Uint8Array(Buffer.from(jwk.y as string, "base64url"));
    this.credentialId = Uint8Array.from({ length: 16 }, (_, index) => index + seed);
  }

  get id(): string {
    return b64url(this.credentialId);
  }

  private flags({ up = true, uv = true }: Flags, extra = 0): number {
    return (up ? 0x01 : 0) | (uv ? 0x04 : 0) | extra;
  }

  private clientData(type: string, challenge: Uint8Array, origin: string): Uint8Array {
    return new TextEncoder().encode(JSON.stringify({ type, challenge: b64url(challenge), origin }));
  }

  register(input: { challenge: Uint8Array; origin: string; rpId: string; flags?: Flags; signCount?: number }) {
    const cose = new Map<Cbor, Cbor>([[1, 2], [3, -7], [-1, 1], [-2, this.x], [-3, this.y]]);
    const authData = concat(
      sha256(new TextEncoder().encode(input.rpId)), Uint8Array.from([this.flags(input.flags ?? {}, 0x40)]), u32(input.signCount ?? 0),
      new Uint8Array(16), Uint8Array.from([0, this.credentialId.length]), this.credentialId, encode(cose),
    );
    const attestation = new Map<Cbor, Cbor>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]);
    return {
      id: this.id,
      response: { clientDataJSON: b64url(this.clientData("webauthn.create", input.challenge, input.origin)), attestationObject: b64url(encode(attestation)) },
    };
  }

  assert(input: { challenge: Uint8Array; origin: string; rpId: string; signCount: number; flags?: Flags }) {
    const authData = concat(sha256(new TextEncoder().encode(input.rpId)), Uint8Array.from([this.flags(input.flags ?? {})]), u32(input.signCount));
    const clientData = this.clientData("webauthn.get", input.challenge, input.origin);
    const signature = sign("sha256", concat(authData, sha256(clientData)), this.privateKey);
    return { response: { clientDataJSON: b64url(clientData), authenticatorData: b64url(authData), signature: b64url(signature) } };
  }
}
