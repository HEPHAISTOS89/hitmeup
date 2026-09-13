import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWalletLinkChallenge, verifyWalletLinkChallenge } from "./solana-wallet-link";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(input: Uint8Array) {
  const digits = [0];
  for (const byte of input) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const next = digits[index] * 256 + carry;
      digits[index] = next % 58;
      carry = Math.floor(next / 58);
    }
    while (carry) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let leadingZeros = 0;
  while (leadingZeros < input.length && input[leadingZeros] === 0) leadingZeros += 1;
  return "1".repeat(leadingZeros) + digits.reverse().map((digit) => ALPHABET[digit]).join("");
}

function walletFixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  const wallet = base58Encode(der.subarray(der.length - 32));
  return { wallet, signMessage: (message: string) => base58Encode(sign(null, Buffer.from(message, "utf8"), privateKey)) };
}

describe("signed Solana wallet linking", () => {
  beforeEach(() => { process.env.WALLET_LINK_SECRET = "test-wallet-link-secret-that-is-long-enough"; });
  afterEach(() => { delete process.env.WALLET_LINK_SECRET; });

  it("links only the wallet that signed a fresh subject-bound challenge", () => {
    const signer = walletFixture();
    const challenge = createWalletLinkChallenge("auth0|student-a", signer.wallet, 1_000);
    const signature = signer.signMessage(challenge.message);
    expect(verifyWalletLinkChallenge({
      subject: "auth0|student-a",
      wallet: signer.wallet,
      token: challenge.token,
      message: challenge.message,
      signature,
    }, 2_000)).toEqual({ wallet: signer.wallet });
  });

  it("rejects another account, changed messages, expired challenges, and another signer", () => {
    const signer = walletFixture();
    const attacker = walletFixture();
    const challenge = createWalletLinkChallenge("auth0|student-a", signer.wallet, 1_000);
    const signature = signer.signMessage(challenge.message);
    const base = { wallet: signer.wallet, token: challenge.token, message: challenge.message, signature };
    expect(() => verifyWalletLinkChallenge({ ...base, subject: "auth0|student-b" }, 2_000)).toThrow(/does not match/);
    expect(() => verifyWalletLinkChallenge({ ...base, subject: "auth0|student-a", message: `${challenge.message}\nchanged` }, 2_000)).toThrow(/changed/);
    expect(() => verifyWalletLinkChallenge({ ...base, subject: "auth0|student-a" }, 301_001)).toThrow(/expired/);
    expect(() => verifyWalletLinkChallenge({ ...base, subject: "auth0|student-a", signature: attacker.signMessage(challenge.message) }, 2_000)).toThrow(/verification failed/);
  });
});
