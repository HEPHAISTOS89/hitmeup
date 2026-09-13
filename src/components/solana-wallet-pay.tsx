"use client";

import { Check, ExternalLink, LoaderCircle, WalletCards } from "lucide-react";
import { useState } from "react";
import { getWalletLinkChallenge, linkSolanaWallet, unlockCosmetic } from "@/lib/client-api";
import {
  connectInjectedSolanaWallet,
  devnetExplorerUrl,
  payAndUnlockCosmetic,
  SolanaWalletError,
  withDevnetCheckoutLock,
  type ConnectedSolanaWallet,
} from "@/lib/solana-wallet";
import type { CosmeticQuote, CosmeticUnlockResult } from "@/lib/types";

type WalletPhase = "idle" | "connecting" | "ready" | "paying" | "complete" | "error";
type MessageSigningProvider = {
  signMessage(message: Uint8Array, display?: "utf8"): Promise<Uint8Array | { signature: Uint8Array }>;
};

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array) {
  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) leadingZeroes += 1;
  const digits: number[] = [];
  for (let index = leadingZeroes; index < bytes.length; index += 1) {
    let carry = bytes[index];
    for (let digit = 0; digit < digits.length; digit += 1) {
      carry += digits[digit] * 256;
      digits[digit] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  return "1".repeat(leadingZeroes) + digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join("");
}

export function SolanaWalletPay({
  quote,
  linkedWallet,
  onWalletLinked,
  onVerified,
  onBusyChange,
}: {
  quote: CosmeticQuote;
  linkedWallet: string | null;
  onWalletLinked: (wallet: string) => void;
  onVerified: (result: CosmeticUnlockResult, signature: string) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [connected, setConnected] = useState<ConnectedSolanaWallet | null>(null);
  const [phase, setPhase] = useState<WalletPhase>("idle");
  const [message, setMessage] = useState("Connect a compatible wallet without sharing a seed phrase or private key.");
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);

  async function connectWallet() {
    if (phase === "connecting" || phase === "paying") return;
    setPhase("connecting");
    setMessage("Waiting for wallet connection…");
    try {
      const wallet = await connectInjectedSolanaWallet();
      if (linkedWallet !== wallet.publicKey) {
        const signer = wallet.provider as typeof wallet.provider & Partial<MessageSigningProvider>;
        if (typeof signer.signMessage !== "function") {
          throw new SolanaWalletError("message_signing_unavailable", "This wallet cannot prove address ownership with a signed message. Use Phantom, Solflare, or another wallet that supports message signing.");
        }
        const challenge = await getWalletLinkChallenge(wallet.publicKey);
        if (challenge.wallet !== wallet.publicKey) {
          throw new SolanaWalletError("wallet_link_mismatch", "The wallet-link challenge did not match the connected account.");
        }
        const signed = await signer.signMessage(new TextEncoder().encode(challenge.message), "utf8");
        const signatureBytes = signed instanceof Uint8Array ? signed : signed.signature;
        if (!(signatureBytes instanceof Uint8Array) || signatureBytes.length !== 64) {
          throw new SolanaWalletError("invalid_wallet_signature", "The wallet returned an invalid ownership signature.");
        }
        const linked = await linkSolanaWallet({ ...challenge, signature: base58Encode(signatureBytes) });
        if (!linked.linked || linked.wallet !== wallet.publicKey) {
          throw new SolanaWalletError("wallet_link_unconfirmed", "The server did not confirm this wallet association.");
        }
        onWalletLinked(wallet.publicKey);
      }
      setConnected(wallet);
      setPhase("ready");
      setMessage(`${wallet.name} connected and linked with a signed ownership proof.`);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "The wallet could not be connected.");
    }
  }

  async function payOrResume() {
    if (!connected || phase === "paying") return;
    setPhase("paying");
    setMessage(pendingSignature ? "Retrying the saved unlock without another transfer…" : "Approve the exact Devnet transfer in your wallet…");
    onBusyChange(true);
    let completed = false;
    let submittedSignature = pendingSignature;
    try {
      const purchase = await withDevnetCheckoutLock(connected.publicKey, () => payAndUnlockCosmetic({
          wallet: connected,
          quote,
          storage: window.localStorage,
          rememberedSignature: pendingSignature,
          unlock: unlockCosmetic,
        }));
      submittedSignature = purchase.signature;
      setPendingSignature(null);
      setExplorerUrl(purchase.explorerUrl);
      await onVerified(purchase.result, purchase.signature);
      completed = true;
      setPhase("complete");
      setMessage("Confirmed on Devnet and unlocked for this profile.");
    } catch (error) {
      const signature = error instanceof SolanaWalletError ? error.signature : submittedSignature ?? undefined;
      if (signature) {
        setPendingSignature(signature);
        setExplorerUrl(devnetExplorerUrl(signature));
      }
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "The Devnet purchase could not be completed.");
    } finally {
      if (!completed) onBusyChange(false);
    }
  }

  return <div className={`wallet-pay wallet-pay-${phase}`}>
    <div className="wallet-pay-copy"><WalletCards size={18} /><div><strong>{connected ? `${connected.name} · ${connected.publicKey.slice(0, 6)}…${connected.publicKey.slice(-6)}` : "Injected Solana wallet"}</strong><p role={phase === "error" ? "alert" : "status"}>{message}</p></div></div>
    {!connected ? <button type="button" disabled={phase === "connecting"} onClick={() => void connectWallet()}>{phase === "connecting" ? <><LoaderCircle className="spin" size={14} /> Connecting…</> : "Connect wallet"}</button> : <button type="button" disabled={phase === "paying" || phase === "complete"} onClick={() => void payOrResume()}>{phase === "paying" ? <><LoaderCircle className="spin" size={14} /> {pendingSignature ? "Retrying unlock…" : "Confirming…"}</> : phase === "complete" ? <><Check size={14} /> Unlocked</> : pendingSignature ? "Retry unlock" : "Pay exact quote"}</button>}
    {explorerUrl && <a href={explorerUrl} target="_blank" rel="noreferrer">View Devnet transaction <ExternalLink size={12} /></a>}
  </div>;
}
