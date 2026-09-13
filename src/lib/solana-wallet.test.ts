import { Connection, PublicKey, SystemInstruction, Transaction } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  connectInjectedSolanaWallet,
  findInjectedSolanaProvider,
  payAndUnlockCosmetic,
  sendQuotedDevnetTransfer,
  validateDevnetQuote,
  withDevnetCheckoutLock,
  type ConnectedSolanaWallet,
  type InjectedSolanaProvider,
} from "./solana-wallet";
import type { CosmeticQuote, CosmeticUnlockResult } from "./types";

const PAYER = "Vote111111111111111111111111111111111111111";
const TREASURY = "ComputeBudget111111111111111111111111111111";
const SIGNATURE = "5".repeat(88);
const quote: CosmeticQuote = { network: "devnet", productId: "avatar-premium-collection", label: "Avatar premium collection", lamports: 50_000_000, treasury: TREASURY, checkoutId: "00000000-0000-4000-8000-000000000001" };

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    size: () => values.size,
  };
}

describe("injected Solana Devnet wallet", () => {
  it("detects Phantom and Solflare but fails closed for unsupported injections", async () => {
    expect(() => findInjectedSolanaProvider({})).toThrow("Phantom");
    const provider: InjectedSolanaProvider = { connect: vi.fn(async () => ({ publicKey: new PublicKey(PAYER) })), sendTransaction: vi.fn() };
    expect(findInjectedSolanaProvider({ solflare: provider }).name).toBe("Solflare");
    await expect(connectInjectedSolanaWallet({ phantom: { solana: provider } })).resolves.toMatchObject({ name: "Phantom", publicKey: PAYER });
  });

  it("fails closed when a second tab already holds the wallet checkout lock", async () => {
    const operation = vi.fn(async () => "paid");
    const manager = { request: vi.fn(async (_name: string, _options: unknown, callback: (lock: null) => Promise<string>) => callback(null)) } as unknown as NonNullable<Parameters<typeof withDevnetCheckoutLock>[2]>;
    await expect(withDevnetCheckoutLock(PAYER, operation, manager)).rejects.toMatchObject({ code: "checkout_in_progress" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("rejects non-Devnet and invalid treasury quotes", () => {
    expect(() => validateDevnetQuote({ ...quote, network: "mainnet-beta" as "devnet" })).toThrow("invalid Devnet quote");
    expect(() => validateDevnetQuote({ ...quote, treasury: "not-a-wallet" })).toThrow("invalid Devnet treasury");
  });

  it("uses sendTransaction when available, transfers the exact quote, and confirms it", async () => {
    let transaction: Transaction | undefined;
    const sendTransaction = vi.fn(async (next: Transaction) => { transaction = next; return SIGNATURE; });
    const signAndSendTransaction = vi.fn();
    const provider: InjectedSolanaProvider = { publicKey: new PublicKey(PAYER), connect: vi.fn(), sendTransaction, signAndSendTransaction };
    const connection = {
      getLatestBlockhash: vi.fn(async () => ({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 42 })),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
    } as unknown as Connection;
    await expect(sendQuotedDevnetTransfer({ wallet: { name: "Phantom", provider, publicKey: PAYER }, quote, connection })).resolves.toBe(SIGNATURE);
    const transfer = SystemInstruction.decodeTransfer(transaction!.instructions[0]);
    expect(transfer.fromPubkey.toBase58()).toBe(PAYER);
    expect(transfer.toPubkey.toBase58()).toBe(TREASURY);
    expect(Number(transfer.lamports)).toBe(50_000_000);
    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(signAndSendTransaction).not.toHaveBeenCalled();
    expect(connection.confirmTransaction).toHaveBeenCalledWith(expect.objectContaining({ signature: SIGNATURE }), "confirmed");
  });

  it("reuses a confirmed pending signature when unlock initially fails", async () => {
    const localStorage = storage();
    const provider: InjectedSolanaProvider = { connect: vi.fn(), sendTransaction: vi.fn() };
    const wallet: ConnectedSolanaWallet = { name: "Phantom", provider, publicKey: PAYER };
    const sendTransfer = vi.fn(async () => SIGNATURE);
    const result: CosmeticUnlockResult = { verified: true, network: "devnet", productId: quote.productId, label: quote.label, lamports: quote.lamports, slot: 42, customizationId: "owned-1" };
    const unlock = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce(result);

    await expect(payAndUnlockCosmetic({ wallet, quote, storage: localStorage, sendTransfer, unlock })).rejects.toMatchObject({ code: "verification_pending", signature: SIGNATURE });
    expect(sendTransfer).toHaveBeenCalledOnce();
    expect(localStorage.size()).toBe(1);
    await expect(payAndUnlockCosmetic({ wallet, quote, storage: localStorage, sendTransfer, unlock })).resolves.toMatchObject({ result, signature: SIGNATURE });
    expect(sendTransfer).toHaveBeenCalledOnce();
    expect(localStorage.size()).toBe(0);
  });

  it("saves the signature before confirmation so an uncertain confirmation cannot cause a second payment", async () => {
    const localStorage = storage();
    const sendTransaction = vi.fn(async () => SIGNATURE);
    const provider: InjectedSolanaProvider = { publicKey: new PublicKey(PAYER), connect: vi.fn(), sendTransaction };
    const wallet: ConnectedSolanaWallet = { name: "Phantom", provider, publicKey: PAYER };
    const connection = {
      getLatestBlockhash: vi.fn(async () => ({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 42 })),
      confirmTransaction: vi.fn().mockRejectedValueOnce(new Error("RPC timeout")),
    } as unknown as Connection;
    const sendTransfer: typeof sendQuotedDevnetTransfer = (input) => sendQuotedDevnetTransfer({ ...input, connection });
    const result: CosmeticUnlockResult = { verified: true, network: "devnet", productId: quote.productId, label: quote.label, lamports: quote.lamports, slot: 42, customizationId: "owned-1" };
    const unlock = vi.fn(async () => result);

    await expect(payAndUnlockCosmetic({ wallet, quote, storage: localStorage, sendTransfer, unlock })).rejects.toMatchObject({ code: "verification_pending", signature: SIGNATURE });
    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(localStorage.size()).toBe(1);
    await expect(payAndUnlockCosmetic({ wallet, quote, storage: localStorage, sendTransfer, unlock })).resolves.toMatchObject({ result, signature: SIGNATURE });
    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(unlock).toHaveBeenCalledOnce();
  });

  it("clears a definitely failed transaction so a fresh attempt remains possible", async () => {
    const localStorage = storage();
    const provider: InjectedSolanaProvider = { publicKey: new PublicKey(PAYER), connect: vi.fn(), sendTransaction: vi.fn(async () => SIGNATURE) };
    const wallet: ConnectedSolanaWallet = { name: "Phantom", provider, publicKey: PAYER };
    const connection = {
      getLatestBlockhash: vi.fn(async () => ({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 42 })),
      confirmTransaction: vi.fn(async () => ({ value: { err: { InstructionError: [0, "Custom"] } } })),
    } as unknown as Connection;
    const sendTransfer: typeof sendQuotedDevnetTransfer = (input) => sendQuotedDevnetTransfer({ ...input, connection });

    await expect(payAndUnlockCosmetic({ wallet, quote, storage: localStorage, sendTransfer, unlock: vi.fn() })).rejects.toMatchObject({ code: "transaction_failed" });
    expect(localStorage.size()).toBe(0);
  });
});
