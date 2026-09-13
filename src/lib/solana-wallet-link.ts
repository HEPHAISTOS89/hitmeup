import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const CHALLENGE_TTL_MS = 5 * 60_000;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

type ChallengePayload = { wallet: string; subjectHash: string; expiresAt: number; nonce: string };

function secret() {
  const source = process.env.WALLET_LINK_SECRET ?? process.env.AUTH0_SECRET;
  if (!source || source.length < 32) throw new Error("Wallet linking is not configured.");
  return createHmac("sha256", source).update("hitmeup-wallet-link-v1").digest();
}

function base58Bytes(value: string) {
  if (!value || [...value].some((character) => !ALPHABET.includes(character))) throw new Error("Invalid Base58 value.");
  const littleEndian = [0];
  for (const character of value) {
    let carry = ALPHABET.indexOf(character);
    for (let index = 0; index < littleEndian.length; index += 1) {
      const next = littleEndian[index] * 58 + carry;
      littleEndian[index] = next & 255;
      carry = next >> 8;
    }
    while (carry) { littleEndian.push(carry & 255); carry >>= 8; }
  }
  const zeros = value.match(/^1+/)?.[0].length ?? 0;
  const significant = littleEndian.length === 1 && littleEndian[0] === 0
    ? Buffer.alloc(0)
    : Buffer.from(littleEndian.reverse());
  return Buffer.concat([Buffer.alloc(zeros), significant]);
}

function subjectHash(subject: string) {
  return createHmac("sha256", secret()).update(subject).digest("hex").slice(0, 32);
}

function signPayload(encoded: string) {
  return createHmac("sha256", secret()).update(encoded).digest("base64url");
}

function messageFor(payload: ChallengePayload, token: string) {
  return [
    "HitMeUp wallet link",
    `Wallet: ${payload.wallet}`,
    `Account: ${payload.subjectHash}`,
    `Expires: ${new Date(payload.expiresAt).toISOString()}`,
    `Nonce: ${payload.nonce}`,
    `Challenge: ${token}`,
  ].join("\n");
}

export function createWalletLinkChallenge(subject: string, wallet: string, now = Date.now()) {
  const publicKey = base58Bytes(wallet);
  if (publicKey.length !== 32) throw new Error("A valid Solana public key is required.");
  const payload: ChallengePayload = { wallet, subjectHash: subjectHash(subject), expiresAt: now + CHALLENGE_TTL_MS, nonce: randomBytes(16).toString("hex") };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${signPayload(encoded)}`;
  return { wallet, token, message: messageFor(payload, token), expiresAt: new Date(payload.expiresAt).toISOString() };
}

export function verifyWalletLinkChallenge(input: { subject: string; wallet: string; token: string; message: string; signature: string }, now = Date.now()) {
  const [encoded, suppliedMac, extra] = input.token.split(".");
  if (!encoded || !suppliedMac || extra) throw new Error("Invalid wallet challenge.");
  const expectedMac = signPayload(encoded);
  const supplied = Buffer.from(suppliedMac);
  const expected = Buffer.from(expectedMac);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid wallet challenge.");
  let payload: ChallengePayload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ChallengePayload; }
  catch { throw new Error("Invalid wallet challenge."); }
  if (payload.wallet !== input.wallet || payload.subjectHash !== subjectHash(input.subject) || !Number.isFinite(payload.expiresAt) || payload.expiresAt < now) {
    throw new Error("Wallet challenge expired or does not match this account.");
  }
  if (input.message !== messageFor(payload, input.token)) throw new Error("Wallet challenge message was changed.");
  const publicKey = base58Bytes(input.wallet);
  const signature = base58Bytes(input.signature);
  if (publicKey.length !== 32 || signature.length !== 64) throw new Error("Invalid wallet signature.");
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]), format: "der", type: "spki" });
  if (!verify(null, Buffer.from(input.message, "utf8"), key, signature)) throw new Error("Wallet signature verification failed.");
  return { wallet: input.wallet };
}
