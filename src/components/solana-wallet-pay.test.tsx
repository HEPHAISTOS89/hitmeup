// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CosmeticQuote, CosmeticUnlockResult } from "@/lib/types";

const PAYER = "Vote111111111111111111111111111111111111111";
const SIGNATURE = "5".repeat(88);
const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(async () => ({ updated: true })),
  unlockCosmetic: vi.fn(),
  connectInjectedSolanaWallet: vi.fn(async () => ({ name: "Phantom" as const, publicKey: "Vote111111111111111111111111111111111111111", provider: { connect: vi.fn(), sendTransaction: vi.fn() } })),
  payAndUnlockCosmetic: vi.fn(),
}));

vi.mock("@/lib/client-api", () => ({
  ApiError: class ApiError extends Error { constructor(message: string, readonly status: number, readonly code?: string) { super(message); } },
  updateProfile: mocks.updateProfile,
  unlockCosmetic: mocks.unlockCosmetic,
}));
vi.mock("@/lib/solana-wallet", () => ({
  connectInjectedSolanaWallet: mocks.connectInjectedSolanaWallet,
  payAndUnlockCosmetic: mocks.payAndUnlockCosmetic,
  withDevnetCheckoutLock: (_wallet: string, operation: () => Promise<unknown>) => operation(),
  devnetExplorerUrl: (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  SolanaWalletError: class SolanaWalletError extends Error {
    constructor(readonly code: string, message: string, readonly signature?: string) { super(message); }
  },
}));

import { SolanaWalletPay } from "./solana-wallet-pay";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Solana wallet checkout", () => {
  it("links the injected public address before enabling the payment", async () => {
    const quote: CosmeticQuote = { network: "devnet", productId: "profile-frame", label: "Profile frame", lamports: 10_000_000, treasury: "11111111111111111111111111111111" };
    const result: CosmeticUnlockResult = { verified: true, network: "devnet", productId: quote.productId, label: quote.label, lamports: quote.lamports, slot: 42, customizationId: "owned-1" };
    mocks.payAndUnlockCosmetic.mockResolvedValueOnce({ result, signature: SIGNATURE, explorerUrl: `https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet` });
    const onWalletLinked = vi.fn();
    const onVerified = vi.fn(async () => undefined);
    render(<SolanaWalletPay quote={quote} linkedWallet={null} onWalletLinked={onWalletLinked} onVerified={onVerified} onBusyChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findByRole("button", { name: "Pay exact quote" });
    expect(mocks.updateProfile).toHaveBeenCalledWith({ solanaWallet: PAYER });
    expect(onWalletLinked).toHaveBeenCalledWith(PAYER);

    fireEvent.click(screen.getByRole("button", { name: "Pay exact quote" }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith(result, SIGNATURE));
    expect(mocks.payAndUnlockCosmetic).toHaveBeenCalledWith(expect.objectContaining({ quote, rememberedSignature: null, unlock: mocks.unlockCosmetic }));
    expect(screen.getByRole("link", { name: /View Devnet transaction/ })).toHaveAttribute("href", expect.stringContaining("cluster=devnet"));
  });

  it("offers a receipt-only retry after a transfer has already returned a signature", async () => {
    const quote: CosmeticQuote = { network: "devnet", productId: "profile-frame", label: "Profile frame", lamports: 10_000_000, treasury: "11111111111111111111111111111111" };
    const result: CosmeticUnlockResult = { verified: true, network: "devnet", productId: quote.productId, label: quote.label, lamports: quote.lamports, slot: 42, customizationId: "owned-1" };
    const { SolanaWalletError } = await import("@/lib/solana-wallet");
    mocks.payAndUnlockCosmetic
      .mockRejectedValueOnce(new SolanaWalletError("verification_pending", "Retry verification without another transfer.", SIGNATURE))
      .mockResolvedValueOnce({ result, signature: SIGNATURE, explorerUrl: `https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet` });
    render(<SolanaWalletPay quote={quote} linkedWallet={PAYER} onWalletLinked={vi.fn()} onVerified={vi.fn(async () => undefined)} onBusyChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pay exact quote" }));
    expect(await screen.findByRole("button", { name: "Retry unlock" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Devnet transaction/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry unlock" }));
    await waitFor(() => expect(mocks.payAndUnlockCosmetic).toHaveBeenLastCalledWith(expect.objectContaining({ rememberedSignature: SIGNATURE })));
    expect(mocks.payAndUnlockCosmetic).toHaveBeenCalledTimes(2);
  });
});
