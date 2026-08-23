import { createHmac, createHash } from "node:crypto";

export function hmacSha256(secret: string, message: string): Buffer {
  return createHmac("sha256", secret).update(message, "utf8").digest();
}

export function deriveOrderSeed(
  evaluatorSecret: string,
  suiteVersion: string,
  caseId: string,
  trialIndex: number,
): Buffer {
  return hmacSha256(evaluatorSecret, `${suiteVersion}|${caseId}|${trialIndex}|order`);
}

export function deriveAliasSeed(
  evaluatorSecret: string,
  suiteVersion: string,
  caseId: string,
  trialIndex: number,
): Buffer {
  return hmacSha256(evaluatorSecret, `${suiteVersion}|${caseId}|${trialIndex}|aliases`);
}

export function prngFromSeed(seed: Buffer): () => number {
  let counter = 0;
  let pool = Buffer.alloc(0);
  let offset = 0;

  const nextBytes = (n: number): Buffer => {
    const out = Buffer.alloc(n);
    let filled = 0;
    while (filled < n) {
      if (offset >= pool.length) {
        const ctr = Buffer.alloc(4);
        ctr.writeUInt32BE(counter);
        pool = createHash("sha256").update(seed).update(ctr).digest();
        counter += 1;
        offset = 0;
      }
      const take = Math.min(n - filled, pool.length - offset);
      pool.copy(out, filled, offset, offset + take);
      offset += take;
      filled += take;
    }
    return out;
  };

  return () => nextBytes(4).readUInt32BE(0) / 0x1_0000_0000;
}

export function fisherYates<T>(items: T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i >= 1; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j]!;
    out[j] = tmp!;
  }
  return out;
}
