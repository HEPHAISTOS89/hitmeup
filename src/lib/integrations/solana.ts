import { fetchWithTimeout, IntegrationError, readJson } from "./http";
import { SOLANA_AVATAR_PRODUCTS, getSolanaAvatarProduct } from "../avatar-marketplace-catalog";

export const COSMETIC_PRODUCTS = SOLANA_AVATAR_PRODUCTS;

export type CosmeticProductId = keyof typeof COSMETIC_PRODUCTS;

type SolanaTransaction = {
  slot?: number;
  meta?: { err?: unknown; preTokenBalances?: unknown[]; postTokenBalances?: unknown[] };
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string; signer?: boolean }>;
      instructions?: Array<{ program?: string; parsed?: { type?: string; info?: { destination?: string; lamports?: number; source?: string } } }>;
    };
  };
};

type RpcResponse = { result?: SolanaTransaction | null; error?: { message?: string } };

function isBase58(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function isSignature(value: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(value)) return false;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = [0];
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return false;
    let carry = digit;
    for (let i = 0; i < bytes.length; i += 1) { const next = bytes[i] * 58 + carry; bytes[i] = next & 255; carry = next >> 8; }
    while (carry) { bytes.push(carry & 255); carry >>= 8; }
  }
  for (const char of value) if (char === "1") bytes.push(0); else break;
  return bytes.length === 64;
}

function devnetRpcUrl() {
  if ((process.env.SOLANA_NETWORK ?? "devnet").toLowerCase() !== "devnet") {
    throw new IntegrationError("configuration", "Solana integration is restricted to Devnet.");
  }
  const value = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntegrationError("configuration", "SOLANA_RPC_URL is invalid.");
  }
  if (url.protocol !== "https:" || !/(^|\.)devnet\.solana\.com$/i.test(url.hostname)) {
    throw new IntegrationError("configuration", "Solana integration is restricted to Devnet.");
  }
  return url.toString();
}

function destinationKeys(transaction: SolanaTransaction) {
  return (transaction.transaction?.message?.accountKeys ?? []).map((key) =>
    typeof key === "string" ? key : key.pubkey ?? "",
  );
}

export type UnlockVerification = {
  verified: true;
  network: "devnet";
  signature: string;
  productId: CosmeticProductId;
  label: string;
  lamports: number;
  slot: number;
};

export function getCosmeticQuote(productId: string) {
  const product = getSolanaAvatarProduct(productId);
  if (!product) {
    throw new IntegrationError("invalid_response", "Unknown cosmetic product.", 400);
  }
  // Validate the complete Devnet boundary before revealing the public payment
  // destination to an authenticated wallet UI.
  devnetRpcUrl();
  const treasury = process.env.SOLANA_TREASURY;
  if (!treasury || !isBase58(treasury)) {
    throw new IntegrationError("configuration", "A Devnet treasury is not configured.");
  }
  return {
    network: "devnet" as const,
    productId: productId as CosmeticProductId,
    label: product.label,
    lamports: product.lamports,
    treasury,
  };
}

export async function verifyCosmeticPayment(signature: string, productId: string, expectedPayer: string): Promise<UnlockVerification> {
  if (!isSignature(signature)) {
    throw new IntegrationError("invalid_response", "A valid Solana transaction signature is required.", 400);
  }
  const quote = getCosmeticQuote(productId);
  const treasury = quote.treasury;
  if (!isBase58(expectedPayer)) throw new IntegrationError("invalid_response", "A valid linked Devnet wallet is required.", 400);
  const product = getSolanaAvatarProduct(productId);
  if (!product) throw new IntegrationError("invalid_response", "Unknown cosmetic product.", 400);
  const response = await fetchWithTimeout(devnetRpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }] }),
  });
  const rpc = await readJson<RpcResponse>(response);
  if (rpc.error || !rpc.result || !rpc.result.meta || rpc.result.meta.err !== null) {
    throw new IntegrationError("invalid_response", "The Devnet transaction is not confirmed or failed.", 400);
  }
  const transaction = rpc.result;
  const rawAccountKeys = transaction.transaction?.message?.accountKeys ?? [];
  const accountKeys = destinationKeys(transaction);
  const hasTreasury = accountKeys.includes(treasury);
  const payerSigned = rawAccountKeys.some((key) =>
    typeof key === "object" && key.pubkey === expectedPayer && key.signer === true,
  );
  const transfer = transaction.transaction?.message?.instructions?.find((instruction) =>
    instruction.program === "system" && instruction.parsed?.type === "transfer" && instruction.parsed.info?.destination === treasury,
  );
  if (!hasTreasury || !payerSigned || !transfer || transfer.parsed?.info?.source !== expectedPayer || transfer.parsed?.info?.lamports !== product.lamports) {
    throw new IntegrationError("invalid_response", "The confirmed transaction does not pay the requested cosmetic.", 400);
  }
  if (typeof transaction.slot !== "number") {
    throw new IntegrationError("invalid_response", "The Devnet transaction has no confirmed slot.", 400);
  }
  return { verified: true, network: "devnet", signature, productId: productId as CosmeticProductId, label: product.label, lamports: product.lamports, slot: transaction.slot };
}
