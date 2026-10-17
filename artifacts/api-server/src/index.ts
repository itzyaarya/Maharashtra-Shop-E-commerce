import app, { type Bindings } from "./app";

type ScheduledEvent = { cron: string; scheduledTime: number };
type WorkerExecutionContext = { waitUntil(promise: Promise<unknown>): void };

async function deliverWebhookOutbox(env: Bindings) {
  if (!env.OWNER_WEBHOOK_URL) return;
  const now = new Date().toISOString();
  const pending = await env.DB.prepare(
    `SELECT id,payload_json,attempt_count FROM notifications
     WHERE channel='webhook' AND status IN ('queued','failed','processing')
       AND (next_attempt_at IS NULL OR next_attempt_at<=?)
     ORDER BY created_at LIMIT 25`,
  ).bind(now).all<{ id: string; payload_json: string; attempt_count: number }>();

  for (const notice of pending.results ?? []) {
    const locked = await env.DB.prepare(
      `UPDATE notifications SET status='processing',attempt_count=attempt_count+1
       WHERE id=? AND status IN ('queued','failed','processing')`,
    ).bind(notice.id).run();
    if (!locked.meta.changes) continue;
    try {
      const response = await fetch(env.OWNER_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-shop-notification-id": notice.id },
        body: notice.payload_json,
      });
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
      await env.DB.prepare(
        `UPDATE notifications SET status='sent',sent_at=?,next_attempt_at=NULL,last_error=NULL WHERE id=?`,
      ).bind(new Date().toISOString(), notice.id).run();
    } catch (cause) {
      const attempt = Number(notice.attempt_count) + 1;
      const permanentlyFailed = attempt >= 8;
      const delayMinutes = Math.min(60, 2 ** Math.min(attempt, 6));
      const nextAttempt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
      const message = cause instanceof Error ? cause.message.slice(0, 500) : "Webhook delivery failed";
      await env.DB.prepare(
        `UPDATE notifications SET status=?,next_attempt_at=?,last_error=? WHERE id=?`,
      ).bind(permanentlyFailed ? "failed" : "queued", permanentlyFailed ? null : nextAttempt, message, notice.id).run();
    }
  }
}

async function releaseExpiredManualUpiOrders(env: Bindings) {
  const now = new Date().toISOString();
  const expired = await env.DB.prepare(
    `SELECT id,order_number FROM orders
     WHERE status='pending' AND payment_method='manual_upi' AND payment_status='pending'
       AND reservation_expires_at IS NOT NULL AND reservation_expires_at<=?
     ORDER BY reservation_expires_at LIMIT 50`,
  ).bind(now).all<{ id: string; order_number: string }>();

  for (const order of expired.results ?? []) {
    const items = await env.DB.prepare(
      "SELECT variant_id,quantity FROM order_items WHERE order_id=?",
    ).bind(order.id).all<{ variant_id: string; quantity: number }>();
    const statements = (items.results ?? []).map((item) => env.DB.prepare(
      `UPDATE inventory SET reserved_qty=reserved_qty-?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE variant_id=? AND EXISTS (
         SELECT 1 FROM orders WHERE id=? AND status='pending' AND payment_status='pending'
           AND reservation_expires_at<=?
       )`,
    ).bind(item.quantity, item.variant_id, order.id, now));
    statements.push(env.DB.prepare(
      `UPDATE orders SET status='cancelled',updated_at=? WHERE id=? AND status='pending'
       AND payment_status='pending' AND reservation_expires_at<=?`,
    ).bind(now, order.id, now));
    statements.push(env.DB.prepare(
      `INSERT OR IGNORE INTO notifications
       (id,event_type,entity_type,entity_id,channel,dedupe_key,payload_json,status,is_read,sent_at,created_at)
       SELECT ?,?,'order',?,'dashboard',?,?,'sent',0,?,?
       WHERE EXISTS (SELECT 1 FROM orders WHERE id=? AND status='cancelled')`,
    ).bind(
      crypto.randomUUID(), "order.payment_expired", order.id,
      `dashboard:order.payment_expired:${order.id}`,
      JSON.stringify({ orderNumber: order.order_number, status: "cancelled", reason: "Manual UPI payment window expired" }),
      now, now, order.id,
    ));
    try {
      await env.DB.batch(statements);
    } catch {
      // The scheduled run will retry; the order and reservations remain unchanged on batch failure.
    }
  }
}

async function runScheduled(env: Bindings) {
  await Promise.all([deliverWebhookOutbox(env), releaseExpiredManualUpiOrders(env)]);
}

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledEvent, env: Bindings, context: WorkerExecutionContext) {
    context.waitUntil(runScheduled(env));
  },
};
