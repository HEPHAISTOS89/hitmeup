// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CosmeticQuote, CosmeticUnlockResult } from "@/lib/types";

const PAYER = "Vote111111111111111111111111111111111111111";
const SIGNATURE = "5".repeat(88);
const CHALLENGE_MESSAGE = "HitMeUp wallet link\nWallet: Vote111111111111111111111111111111111111111\nChallenge: signed-token";
const OWNERSHIP_SIGNATURE = new Uint8Array(64).fill(7);
const mocks = vi.hoisted(() => ({
  getWalletLinkChallenge: vi.fn(),
  linkSolanaWallet: vi.fn(),
  unlockCosmetic: vi.fn(),
  signMessage: vi.fn(),
  connectInjectedSolanaWallet: vi.fn(),
  payAndUnlockCosmetic: vi.fn(),
}));

vi.mock("@/lib/client-api", () => ({
  ApiError: class ApiError extends Error { constructor(message: string, readonly status: number, readonly code?: string) { super(message); } },
  getWalletLinkChallenge: mocks.getWalletLinkChallenge,
  linkSolanaWallet: mocks.linkSolanaWallet,
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
  function prepareWallet() {
    mocks.signMessage.mockResolvedValue({ signature: OWNERSHIP_SIGNATURE });
    mocks.connectInjectedSolanaWallet.mockResolvedValue({
      name: "Phantom" as const,
      publicKey: PAYER,
      provider: { connect: vi.fn(), sendTransaction: vi.fn(), signMessage: mocks.signMessage },
    });
    mocks.getWalletLinkChallenge.mockResolvedValue({ wallet: PAYER, token: "signed-token", message: CHALLENGE_MESSAGE, expiresAt: "2026-09-13T12:00:00.000Z" });
    mocks.linkSolanaWallet.mockResolvedValue({ linked: true, wallet: PAYER });
  }

  it("links the injected public address before enabling the payment", async () => {
    prepareWallet();
    const quote: CosmeticQuote = { network: "devnet", productId: "avatar-premium-collection", label: "Avatar premium collection", lamports: 50_000_000, treasury: "11111111111111111111111111111111", checkoutId: "00000000-0000-4000-8000-000000000001" };
    const result: CosmeticUnlockResult = { verified: true, network: "devnet", productId: quote.productId, label: quote.label, lamports: quote.lamports, slot: 42, customizationId: "owned-1" };
    mocks.payAndUnlockCosmetic.mockResolvedValueOnce({ result, signature: SIGNATURE, explorerUrl: `https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet` });
    const onWalletLinked = vi.fn();
    const onVerified = vi.fn(async () => undefined);
    render(<SolanaWalletPay quote={quote} linkedWallet={null} onWalletLinked={onWalletLinked} onVerified={onVerified} onBusyChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findByRole("button", { name: "Pay exact quote" });
    expect(mocks.getWalletLinkChallenge).toHaveBeenCalledWith(PAYER);
    expect(mocks.signMessage).toHaveBeenCalledWith(new TextEncoder().encode(CHALLENGE_MESSAGE), "utf8");
    expect(mocks.linkSolanaWallet).toHaveBeenCalledWith(expect.objectContaining({
      wallet: PAYER,
      token: "signed-token",
      message: CHALLENGE_MESSAGE,
      signature: expect.stringMatching(/^[1-9A-HJ-NP-Za-km-z]+$/),
    }));
    expect(onWalletLinked).toHaveBeenCalledWith(PAYER);

    fireEvent.click(screen.getByRole("button", { name: "Pay exact quote" }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith(result, SIGNATURE));
    expect(mocks.payAndUnlockCosmetic).toHaveBeenCalledWith(expect.objectContaining({ quote, rememberedSignature: null, unlock: mocks.unlockCosmetic }));
    expect(screen.getByRole("link", { name: /View Devnet transaction/ })).toHaveAttribute("href", expect.stringContaining("cluster=devnet"));
  });

  it("offers a receipt-only retry after a transfer has already returned a signature", async () => {
    prepareWallet();
    const quote: CosmeticQuote = { network: "devnet", productId: "avatar-premium-collection", label: "Avatar premium collection", lamports: 50_000_000, treasury: "11111111111111111111111111111111", checkoutId: "00000000-0000-4000-8000-000000000001" };
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

  it("does not link or enable payment when the wallet cannot sign the challenge", async () => {
    prepareWallet();
    mocks.connectInjectedSolanaWallet.mockResolvedValueOnce({
      name: "Solana wallet" as const,
      publicKey: PAYER,
      provider: { connect: vi.fn(), sendTransaction: vi.fn() },
    });
    const quote: CosmeticQuote = { network: "devnet", productId: "avatar-premium-collection", label: "Avatar premium collection", lamports: 50_000_000, treasury: "11111111111111111111111111111111", checkoutId: "00000000-0000-4000-8000-000000000001" };
    render(<SolanaWalletPay quote={quote} linkedWallet={null} onWalletLinked={vi.fn()} onVerified={vi.fn(async () => undefined)} onBusyChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot prove address ownership/i);
    expect(mocks.getWalletLinkChallenge).not.toHaveBeenCalled();
    expect(mocks.linkSolanaWallet).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Pay exact quote" })).not.toBeInTheDocument();
  });
});
