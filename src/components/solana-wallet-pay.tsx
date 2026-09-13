"use client";

import { Check, ExternalLink, LoaderCircle, WalletCards } from "lucide-react";
import { useState } from "react";
import { ApiError, unlockCosmetic, updateProfile } from "@/lib/client-api";
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
        const saved = await updateProfile({ solanaWallet: wallet.publicKey });
        if (!saved.updated) throw new ApiError("The wallet association was not confirmed.", 502, "invalid_response");
        onWalletLinked(wallet.publicKey);
      }
      setConnected(wallet);
      setPhase("ready");
      setMessage(`${wallet.name} connected and linked to this private profile.`);
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
