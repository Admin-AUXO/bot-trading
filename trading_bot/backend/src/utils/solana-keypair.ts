import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

export function loadSolanaKeypair(secret: string): Keypair {
  const decoded = decodeSecretKey(secret);

  if (decoded.length === 64) {
    return Keypair.fromSecretKey(decoded);
  }

  if (decoded.length === 32) {
    return Keypair.fromSeed(decoded);
  }

  throw new Error(`unsupported Solana private key length: ${decoded.length}`);
}

function decodeSecretKey(secret: string): Uint8Array {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error("SOLANA_PRIVATE_KEY is empty");
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
      throw new Error("invalid Solana private key JSON array");
    }
    return Uint8Array.from(parsed);
  }

  if (/^\d+(,\d+)+$/.test(trimmed)) {
    return Uint8Array.from(trimmed.split(",").map((value) => Number.parseInt(value, 10)));
  }

  if (/^[A-Fa-f0-9]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Uint8Array.from(Buffer.from(trimmed, "hex"));
  }

  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0) {
    const decoded = Uint8Array.from(Buffer.from(trimmed, "base64"));
    if (decoded.length === 32 || decoded.length === 64) {
      return decoded;
    }
  }

  return Uint8Array.from(bs58.decode(trimmed));
}
