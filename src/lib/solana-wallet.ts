import { Connection, PublicKey, SystemProgram, Transaction, clusterApiUrl } from "@solana/web3.js";
import type { CosmeticQuote, CosmeticUnlockResult } from "./types";

const PENDING_PREFIX = "hitmeup:solana-devnet:pending:";
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/;

export type InjectedSolanaProvider = {
  publicKey?: { toString(): string } | null;
  connect(): Promise<{ publicKey?: { toString(): string } } | void>;
  sendTransaction?: (transaction: Transaction, connection: Connection) => Promise<string>;
  signAndSendTransaction?: (transaction: Transaction) => Promise<string | { signature?: string }>;
  signTransaction?: (transaction: Transaction) => Promise<{ serialize(): Uint8Array }>;
};

export type ConnectedSolanaWallet = {
  name: "Phantom" | "Solflare" | "Solana wallet";
  provider: InjectedSolanaProvider;
  publicKey: string;
};

export class SolanaWalletError extends Error {
  constructor(readonly code: string, message: string, readonly signature?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SolanaWalletError";
  }
}

type WalletWindow = {
  phantom?: { solana?: InjectedSolanaProvider };
  solflare?: InjectedSolanaProvider;
  solana?: InjectedSolanaProvider;
};

type CheckoutLockManager = {
  request<T>(name: string, options: { mode: "exclusive"; ifAvailable: true }, callback: (lock: { name: string } | null) => Promise<T>): Promise<T>;
};

function supportsTransfer(provider: InjectedSolanaProvider | undefined): provider is InjectedSolanaProvider {
  return Boolean(provider && typeof provider.connect === "function" && (
    typeof provider.sendTransaction === "function" ||
    typeof provider.signAndSendTransaction === "function" ||
    typeof provider.signTransaction === "function"
  ));
}

export function findInjectedSolanaProvider(source: WalletWindow = window as unknown as WalletWindow) {
  const candidates = [
    ["Phantom", source.phantom?.solana],
    ["Solflare", source.solflare],
    ["Solana wallet", source.solana],
  ] as const;
  const match = candidates.find(([, provider]) => supportsTransfer(provider));
  if (!match) throw new SolanaWalletError("wallet_not_found", "Open HitMeUp in a browser with Phantom, Solflare, or another compatible Solana wallet.");
  return { name: match[0], provider: match[1] as InjectedSolanaProvider };
}

export async function connectInjectedSolanaWallet(source?: WalletWindow): Promise<ConnectedSolanaWallet> {
  const wallet = findInjectedSolanaProvider(source);
  try {
    const result = await wallet.provider.connect();
    const publicKey = result?.publicKey ?? wallet.provider.publicKey;
    if (!publicKey) throw new Error("Wallet returned no public key.");
    return { ...wallet, publicKey: new PublicKey(publicKey.toString()).toBase58() };
  } catch (error) {
    const rejected = (error as { code?: number })?.code === 4001 || /reject|cancel/i.test(error instanceof Error ? error.message : "");
    throw new SolanaWalletError(rejected ? "wallet_rejected" : "wallet_connection_failed", rejected ? "Wallet connection was cancelled." : "The Solana wallet could not be connected.", undefined, { cause: error });
  }
}

export async function withDevnetCheckoutLock<T>(wallet: string, operation: () => Promise<T>, manager?: CheckoutLockManager) {
  const availableManager = manager ?? (typeof navigator === "undefined" ? undefined : navigator.locks as unknown as CheckoutLockManager | undefined);
  if (!availableManager) {
    throw new SolanaWalletError("checkout_lock_unavailable", "This browser cannot safely prevent a duplicate wallet payment. Use the manual signature fallback instead.");
  }
  return availableManager.request(`hitmeup:solana-devnet:checkout:${wallet}`, { mode: "exclusive", ifAvailable: true }, async (lock) => {
    if (!lock) throw new SolanaWalletError("checkout_in_progress", "Another HitMeUp Devnet checkout is already active for this wallet.");
    return operation();
  });
}

export function validateDevnetQuote(quote: CosmeticQuote) {
  if (quote.network !== "devnet" || !quote.productId || !Number.isSafeInteger(quote.lamports) || quote.lamports <= 0
      || typeof quote.checkoutId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(quote.checkoutId)) {
    throw new SolanaWalletError("invalid_quote", "The server returned an invalid Devnet quote.");
  }
  try { new PublicKey(quote.treasury); } catch (error) {
    throw new SolanaWalletError("invalid_quote", "The server returned an invalid Devnet treasury.", undefined, { cause: error });
  }
  return quote;
}

export async function sendQuotedDevnetTransfer({
  wallet,
  quote,
  connection = new Connection(clusterApiUrl("devnet"), "confirmed"),
  onSignature,
}: {
  wallet: ConnectedSolanaWallet;
  quote: CosmeticQuote;
  connection?: Connection;
  onSignature?: (signature: string) => void;
}) {
  validateDevnetQuote(quote);
  const payer = new PublicKey(wallet.publicKey);
  if (wallet.provider.publicKey && wallet.provider.publicKey.toString() !== payer.toBase58()) {
    throw new SolanaWalletError("wallet_changed", "The active wallet account changed. Connect it again before paying.");
  }
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({ feePayer: payer, recentBlockhash: latest.blockhash }).add(SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: new PublicKey(quote.treasury),
    lamports: quote.lamports,
  }));
  let signature: string | undefined;
  try {
    if (wallet.provider.sendTransaction) {
      signature = await wallet.provider.sendTransaction(transaction, connection);
    } else if (wallet.provider.signAndSendTransaction) {
      const result = await wallet.provider.signAndSendTransaction(transaction);
      signature = typeof result === "string" ? result : result.signature;
    } else if (wallet.provider.signTransaction) {
      const signed = await wallet.provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signed.serialize());
    }
  } catch (error) {
    const rejected = (error as { code?: number })?.code === 4001 || /reject|cancel/i.test(error instanceof Error ? error.message : "");
    throw new SolanaWalletError(rejected ? "transaction_rejected" : "transaction_failed", rejected ? "Transaction approval was cancelled." : "The wallet could not send the Devnet transaction.", undefined, { cause: error });
  }
  if (!signature || !SIGNATURE_PATTERN.test(signature)) throw new SolanaWalletError("invalid_signature", "The wallet returned an invalid transaction signature.");
  onSignature?.(signature);
  const confirmation = await connection.confirmTransaction({ signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }, "confirmed");
  if (confirmation.value.err) throw new SolanaWalletError("transaction_failed", "The Devnet transaction failed before confirmation.", signature);
  return signature;
}

type PendingPayment = { productId: string; wallet: string; treasury: string; lamports: number; checkoutId: string; signature: string };

function pendingKey(productId: string, wallet: string) { return `${PENDING_PREFIX}${productId}:${wallet}`; }

export function loadPendingDevnetPayment(storage: Pick<Storage, "getItem">, quote: CosmeticQuote, wallet: string): PendingPayment | null {
  try {
    const value = JSON.parse(storage.getItem(pendingKey(quote.productId, wallet)) ?? "null") as PendingPayment | null;
    return value?.productId === quote.productId && value.wallet === wallet && value.treasury === quote.treasury
      && value.lamports === quote.lamports && value.checkoutId === quote.checkoutId
      && SIGNATURE_PATTERN.test(value.signature) ? value : null;
  } catch { return null; }
}

export function savePendingDevnetPayment(storage: Pick<Storage, "setItem">, payment: PendingPayment) {
  try { storage.setItem(pendingKey(payment.productId, payment.wallet), JSON.stringify(payment)); return true; } catch { return false; }
}

export function clearPendingDevnetPayment(storage: Pick<Storage, "removeItem">, quote: CosmeticQuote, wallet: string) {
  try { storage.removeItem(pendingKey(quote.productId, wallet)); } catch { /* A stale public receipt is harmless. */ }
}

export async function payAndUnlockCosmetic({
  wallet,
  quote,
  storage,
  rememberedSignature,
  sendTransfer = sendQuotedDevnetTransfer,
  unlock,
}: {
  wallet: ConnectedSolanaWallet;
  quote: CosmeticQuote;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  rememberedSignature?: string | null;
  sendTransfer?: typeof sendQuotedDevnetTransfer;
  unlock: (productId: string, signature: string, checkoutId: string) => Promise<CosmeticUnlockResult>;
}) {
  validateDevnetQuote(quote);
  const pending = loadPendingDevnetPayment(storage, quote, wallet.publicKey);
  let signature = rememberedSignature && SIGNATURE_PATTERN.test(rememberedSignature)
    ? rememberedSignature
    : pending?.signature;
  try {
    if (!signature) {
      signature = await sendTransfer({
        wallet,
        quote,
        onSignature: (nextSignature) => {
          signature = nextSignature;
          savePendingDevnetPayment(storage, { productId: quote.productId, wallet: wallet.publicKey, treasury: quote.treasury, lamports: quote.lamports, checkoutId: quote.checkoutId, signature: nextSignature });
        },
      });
    }
    savePendingDevnetPayment(storage, { productId: quote.productId, wallet: wallet.publicKey, treasury: quote.treasury, lamports: quote.lamports, checkoutId: quote.checkoutId, signature });
    const result = await unlock(quote.productId, signature, quote.checkoutId);
    if (!result.verified || result.network !== "devnet" || result.productId !== quote.productId || result.lamports !== quote.lamports) {
      throw new SolanaWalletError("invalid_unlock_response", "The server unlock response did not match the Devnet quote.", signature);
    }
    clearPendingDevnetPayment(storage, quote, wallet.publicKey);
    return { result, signature, explorerUrl: devnetExplorerUrl(signature) };
  } catch (error) {
    if (error instanceof SolanaWalletError && error.code === "transaction_failed") {
      clearPendingDevnetPayment(storage, quote, wallet.publicKey);
      throw error;
    }
    if (!signature) throw error;
    throw new SolanaWalletError("verification_pending", "The transaction signature is saved. Retry verification will reuse it without another transfer.", signature, { cause: error });
  }
}

export function devnetExplorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}
