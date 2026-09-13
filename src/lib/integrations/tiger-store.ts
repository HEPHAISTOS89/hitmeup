import { createHmac } from "node:crypto";
import type { TigerEvent } from "./tiger";

/** Minimal injectable TigerData/PostgreSQL adapter. The query function is supplied by the runtime's pg pool. */
export class TigerPostgresStore {
  constructor(private readonly query: (sql: string, params: unknown[]) => Promise<{ rows: Array<{ id?: string }> }>, private readonly salt: string) {
    if (!salt) throw new Error("Tiger analytics salt is required.");
  }

  async append(event: TigerEvent, actorId: string) {
    const actorHash = createHmac("sha256", this.salt).update(actorId).digest("hex").slice(0, 32);
    const result = await this.query(
      "INSERT INTO tiger_analytics_events (event_name, actor_hash, service_id, metadata, occurred_at) VALUES ($1,$2,$3,$4::jsonb,COALESCE($5::timestamptz,now())) RETURNING id",
      [event.name, actorHash, event.serviceId ?? null, event.metadata ?? {}, event.occurredAt ?? null],
    );
    return { status: "appended" as const, eventId: String(result.rows[0]?.id ?? "") };
  }
}
