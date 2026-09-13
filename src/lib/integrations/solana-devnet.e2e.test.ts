import { describe, expect, it, vi } from "vitest";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { verifyCosmeticPayment } from "./solana";

const RUN_DEVNET = process.env.RUN_SOLANA_DEVNET_E2E === "true";
const RPC_URL = "https://api.devnet.solana.com";

describe.runIf(RUN_DEVNET)("real Solana Devnet cosmetic payment", () => {
  it("accepts the exact transfer and rejects a wrong amount and wrong payer", async () => {
    const connection = new Connection(RPC_URL, "confirmed");
    const payer = Keypair.generate();
    const treasury = Keypair.generate().publicKey;

    const airdropSignature = await connection.requestAirdrop(payer.publicKey, Math.floor(0.03 * LAMPORTS_PER_SOL));
    const latest = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({ signature: airdropSignature, ...latest }, "confirmed");

    async function transfer(lamports: number) {
      return sendAndConfirmTransaction(
        connection,
        new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: treasury, lamports })),
        [payer],
        { commitment: "confirmed" },
      );
    }

    vi.stubEnv("SOLANA_NETWORK", "devnet");
    vi.stubEnv("SOLANA_RPC_URL", RPC_URL);
    vi.stubEnv("SOLANA_TREASURY", treasury.toBase58());

    const exactSignature = await transfer(50_000_000);
    await expect(verifyCosmeticPayment(exactSignature, "avatar-premium-collection", payer.publicKey.toBase58())).resolves.toMatchObject({
      verified: true,
      network: "devnet",
      productId: "avatar-premium-collection",
      lamports: 50_000_000,
    });

    await expect(verifyCosmeticPayment(exactSignature, "avatar-premium-collection", Keypair.generate().publicKey.toBase58()))
      .rejects.toThrow("does not pay the requested cosmetic");

    const wrongAmountSignature = await transfer(9_999_999);
    await expect(verifyCosmeticPayment(wrongAmountSignature, "avatar-premium-collection", payer.publicKey.toBase58()))
      .rejects.toThrow("does not pay the requested cosmetic");

    expect(new PublicKey(treasury).toBase58()).toBe(treasury.toBase58());
  }, 120_000);
});
