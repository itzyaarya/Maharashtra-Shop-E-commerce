import { Hono, type Context } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  CreateBusinessApplicationBody,
  CreateInventoryAdjustmentBody,
  CreateInventoryReceiptBody,
  CreateOrderBody,
  CreateRepairRequestBody,
  ListAdminInventoryQueryParams,
  ListAdminOrdersQueryParams,
  ListProductsQueryParams,
  QuoteCheckoutBody,
  UpdateBusinessApplicationStatusBody,
  UpdateOrderPaymentStatusBody,
  UpdateOrderStatusBody,
  UpdateRepairStatusBody,
} from "@workspace/api-zod";

type D1Row = Record<string, unknown>;
type D1Meta = { changes: number };
type D1StatementResult<T = D1Row> = {
  results?: T[];
  success: boolean;
  meta: D1Meta;
};
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = D1Row>(): Promise<T | null>;
  all<T = D1Row>(): Promise<D1StatementResult<T>>;
  run(): Promise<D1StatementResult>;
};
type D1Binding = {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1StatementResult[]>;
};

type Bindings = {
  DB: D1Binding;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_EMAIL_ALLOWLIST?: string;
  OWNER_WEBHOOK_URL?: string;
};

type Variables = { ownerEmail: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const ACCESS_JWKS = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  brand: string | null;
  category: string;
  shipping_class: string;
  image_urls_json: string;
};
type VariantRow = {
  id: string;
  product_id: string;
  sku: string;
  variant_label: string;
  attributes_json: string;
  retail_price_paise: number;
  wholesale_price_paise: number | null;
  wholesale_min_qty: number;
  on_hand_qty: number;
  reserved_qty: number;
};
type CheckoutLine = { variantId: string; quantity: number };
type CheckoutPayload = {
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | null;
  orderType: "retail" | "wholesale";
  fulfillmentType: "ship" | "pickup";
  paymentMethod: "cod" | "manual_upi" | "cash_pickup";
  businessName?: string | null;
  gstin?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  district?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
  customerNote?: string | null;
  items: CheckoutLine[];
};
type CartLine = CheckoutLine & {
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  attributesJson: string;
  shippingClass: string;
  pricePaise: number;
  taxPaise: number;
  lineTotalPaise: number;
};
type QuoteResult =
  | { ok: true; quote: Record<string, unknown>; lines: CartLine[]; zoneId: string | null }
  | { ok: false; message: string };

const uuid = () => crypto.randomUUID();
const isoNow = () => new Date().toISOString();
const cleanPhone = (value: string) => value.replace(/[^\d+]/g, "").replace(/^91(?=\d{10}$)/, "+91");
const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(",");
const json = (value: unknown) => JSON.stringify(value);

async function rows<T extends D1Row>(db: D1Binding, sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await db.prepare(sql).bind(...values).all<T>();
  return result.results ?? [];
}

async function row<T extends D1Row>(db: D1Binding, sql: string, values: unknown[] = []): Promise<T | null> {
  return db.prepare(sql).bind(...values).first<T>();
}

function error(c: AppContext, message: string, status: 400 | 401 | 403 | 404 | 409 | 413 | 500 | 503 = 400) {
  return c.json({ error: message }, status);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function validationMessage(issues: { message: string }[]) {
  return issues.map((issue) => issue.message).join("; ");
}

function makeNotificationStatements(
  env: Bindings,
  eventType: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
) {
  const now = isoNow();
  const identity = eventType === "inventory.low_stock" ? `${entityId}:${now.slice(0, 10)}` : entityId;
  const statements = [
    env.DB.prepare(
      `INSERT OR IGNORE INTO notifications
       (id,event_type,entity_type,entity_id,channel,dedupe_key,payload_json,status,is_read,sent_at,created_at)
       VALUES (?,?,?,?,? ,? ,?,'sent',0,?,?)`,
    ).bind(uuid(), eventType, entityType, entityId, "dashboard", `dashboard:${eventType}:${identity}`, json(payload), now, now),
  ];
  if (env.OWNER_WEBHOOK_URL) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO notifications
         (id,event_type,entity_type,entity_id,channel,dedupe_key,payload_json,status,is_read,created_at)
         VALUES (?,?,?,?,? ,? ,?,'queued',0,?)`,
      ).bind(uuid(), eventType, entityType, entityId, "webhook", `webhook:${eventType}:${identity}`, json(payload), now),
    );
  }
  return statements;
}

function getJwks(teamDomain: string) {
  const issuer = `https://${teamDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  let keySet = ACCESS_JWKS.get(issuer);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    ACCESS_JWKS.set(issuer, keySet);
  }
  return { issuer, keySet };
}

app.use("/api/*", secureHeaders());
app.use("/api/v1/admin/*", async (c, next) => {
  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN;
  const audience = c.env.CF_ACCESS_AUD;
  if (!teamDomain || !audience) {
    return c.json({ error: "Admin access is not configured. Protect this hostname with Cloudflare Access and set its team domain and audience." }, 503);
  }
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return c.json({ error: "Cloudflare Access login is required." }, 401);
  try {
    const { issuer, keySet } = getJwks(teamDomain);
    const { payload } = await jwtVerify(token, keySet, { issuer, audience });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    const allowlist = (c.env.ADMIN_EMAIL_ALLOWLIST ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (!email || (allowlist.length > 0 && !allowlist.includes(email))) {
      return c.json({ error: "This Cloudflare Access identity is not authorized for shop administration." }, 403);
    }
    c.set("ownerEmail", email);
    return next();
  } catch {
    return c.json({ error: "Cloudflare Access identity could not be verified." }, 401);
  }
});

app.get("/api/healthz", (c) => c.json({ status: "ok" }));

app.get("/api/v1/categories", async (c) => {
  const categories = await rows<{
    id: string; name: string; slug: string; product_count: number;
  }>(
    c.env.DB,
    `SELECT c.id,c.name,c.slug,COUNT(p.id) AS product_count
     FROM categories c LEFT JOIN products p ON p.category_id=c.id AND p.status='active'
     WHERE c.is_active=1 GROUP BY c.id ORDER BY c.sort_order,c.name`,
  );
  return c.json(categories.map((item) => ({
    id: item.id, name: item.name, slug: item.slug, productCount: Number(item.product_count),
  })));
});

app.get("/api/v1/products", async (c) => {
  const parsed = ListProductsQueryParams.safeParse({
    search: c.req.query("search"),
    category: c.req.query("category"),
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  const search = parsed.data.search?.trim() ?? "";
  const category = parsed.data.category?.trim() ?? "";
  const page = parsed.data.page ?? 1;
  const pageSize = parsed.data.pageSize ?? 12;
  const where = ["p.status='active'"];
  const values: unknown[] = [];
  if (search) {
    where.push("(p.name LIKE ? OR p.description LIKE ? OR v.sku LIKE ?)");
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) {
    where.push("c.slug=?");
    values.push(category);
  }
  const whereSql = where.join(" AND ");
  const totalRow = await row<{ total: number }>(
    c.env.DB,
    `SELECT COUNT(DISTINCT p.id) AS total
     FROM products p JOIN categories c ON c.id=p.category_id
     LEFT JOIN product_variants v ON v.product_id=p.id
     WHERE ${whereSql}`,
    values,
  );
  const products = await rows<ProductRow>(
    c.env.DB,
    `SELECT DISTINCT p.id,p.slug,p.name,p.description,p.brand,c.name AS category,
       p.shipping_class,p.image_urls_json
     FROM products p JOIN categories c ON c.id=p.category_id
     LEFT JOIN product_variants v ON v.product_id=p.id
     WHERE ${whereSql}
     ORDER BY p.is_featured DESC,p.name LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  const variants = products.length
    ? await rows<VariantRow>(
        c.env.DB,
        `SELECT v.id,v.product_id,v.sku,v.variant_label,v.attributes_json,
           v.retail_price_paise,v.wholesale_price_paise,v.wholesale_min_qty,
           COALESCE(i.on_hand_qty,0) AS on_hand_qty,COALESCE(i.reserved_qty,0) AS reserved_qty
         FROM product_variants v LEFT JOIN inventory i ON i.variant_id=v.id
         WHERE v.is_active=1 AND v.product_id IN (${placeholders(products.length)})
         ORDER BY v.product_id,v.sku`,
        products.map((product) => product.id),
      )
    : [];
  return c.json({
    items: products.map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      brand: product.brand,
      category: product.category,
      shippingClass: product.shipping_class,
      images: parseJson<string[]>(product.image_urls_json, []),
      variants: variants.filter((variant) => variant.product_id === product.id).map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        label: variant.variant_label,
        attributes: parseJson<Record<string, unknown>>(variant.attributes_json, {}),
        retailPricePaise: Number(variant.retail_price_paise),
        wholesalePricePaise: variant.wholesale_price_paise == null ? null : Number(variant.wholesale_price_paise),
        wholesaleMinQty: Number(variant.wholesale_min_qty),
        availableQty: Math.max(0, Number(variant.on_hand_qty) - Number(variant.reserved_qty)),
      })),
    })),
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize,
  });
});

async function calculateQuote(db: D1Binding, input: CheckoutPayload): Promise<QuoteResult> {
  const normalizedPhone = cleanPhone(input.buyerPhone);
  let approvedCustomer: { id: string } | null = null;
  if (input.orderType === "wholesale") {
    approvedCustomer = await row<{ id: string }>(
      db,
      `SELECT id FROM customers WHERE phone=? AND customer_type='business' AND business_status='approved'`,
      [normalizedPhone],
    );
    if (!approvedCustomer) return { ok: false, message: "Wholesale checkout is available only to an approved business account. Submit a business application first." };
  }
  const quantities = new Map<string, number>();
  for (const item of input.items) {
    if (!item.variantId || !Number.isInteger(item.quantity) || item.quantity < 1) {
      return { ok: false, message: "Each cart line must include a valid variant and quantity." };
    }
    quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  }
  const cart = [...quantities].map(([variantId, quantity]) => ({ variantId, quantity }));
  const variantRows = await rows<VariantRow & {
    product_name: string;
    product_id: string;
    shipping_class: string;
    gst_rate_bps: number;
    tracks_inventory: number;
  }>(
    db,
    `SELECT v.id,v.product_id,v.sku,v.variant_label,v.attributes_json,v.retail_price_paise,
       v.wholesale_price_paise,v.wholesale_min_qty,v.tracks_inventory,
       p.name AS product_name,p.shipping_class,p.gst_rate_bps,
       COALESCE(i.on_hand_qty,0) AS on_hand_qty,COALESCE(i.reserved_qty,0) AS reserved_qty
     FROM product_variants v JOIN products p ON p.id=v.product_id
     LEFT JOIN inventory i ON i.variant_id=v.id
     WHERE v.is_active=1 AND p.status='active' AND v.id IN (${placeholders(cart.length)})`,
    cart.map((item) => item.variantId),
  );
  if (variantRows.length !== cart.length) return { ok: false, message: "One or more products are no longer available." };

  const zone = input.fulfillmentType === "ship" && input.pincode
    ? await row<{ zone_id: string; state_code: string }>(
        db,
        `SELECT z.id AS zone_id,z.state_code FROM shipping_zone_pincodes zp
         JOIN shipping_zones z ON z.id=zp.zone_id AND z.is_active=1 WHERE zp.pincode=?`,
        [input.pincode],
      )
    : null;
  if (input.fulfillmentType === "ship") {
    if (input.stateCode !== "27") return { ok: false, message: "Delivery is currently available only within Maharashtra." };
    if (!input.pincode || !/^\d{6}$/.test(input.pincode)) return { ok: false, message: "Enter a valid six-digit Maharashtra pincode." };
  }

  const lines: CartLine[] = [];
  const shippingByClass = new Map<string, number>();
  let subtotal = 0;
  let tax = 0;
  for (const item of cart) {
    const variant = variantRows.find((entry) => entry.id === item.variantId);
    if (!variant) return { ok: false, message: "A cart item is unavailable." };
    const available = Number(variant.on_hand_qty) - Number(variant.reserved_qty);
    if (Number(variant.tracks_inventory) === 1 && item.quantity > available) {
      return { ok: false, message: `${variant.product_name} has only ${Math.max(available, 0)} available.` };
    }
    if (input.orderType === "wholesale" && item.quantity < Number(variant.wholesale_min_qty)) {
      return { ok: false, message: `${variant.product_name} requires a minimum wholesale quantity of ${variant.wholesale_min_qty}.` };
    }
    const price = input.orderType === "wholesale"
      ? variant.wholesale_price_paise
      : variant.retail_price_paise;
    if (price == null) return { ok: false, message: `${variant.product_name} is not available for wholesale purchase.` };
    const lineSubtotal = Number(price) * item.quantity;
    const lineTax = Math.round(lineSubtotal * Number(variant.gst_rate_bps) / 10000);
    lines.push({
      ...item,
      productId: variant.product_id,
      productName: variant.product_name,
      variantLabel: variant.variant_label,
      sku: variant.sku,
      attributesJson: variant.attributes_json,
      shippingClass: variant.shipping_class,
      pricePaise: Number(price),
      taxPaise: lineTax,
      lineTotalPaise: lineSubtotal + lineTax,
    });
    subtotal += lineSubtotal;
    tax += lineTax;
    if (input.fulfillmentType === "ship") {
      const rule = await row<{ is_allowed: number; rate_paise: number; free_shipping_over_paise: number | null }>(
        db,
        `SELECT is_allowed,rate_paise,free_shipping_over_paise FROM shipping_rules
         WHERE shipping_class=? AND (zone_id=? OR zone_id IS NULL)
         ORDER BY CASE WHEN zone_id=? THEN 0 ELSE 1 END LIMIT 1`,
        [variant.shipping_class, zone?.zone_id ?? null, zone?.zone_id ?? null],
      );
      if (!rule || Number(rule.is_allowed) !== 1) {
        return { ok: false, message: `${variant.product_name} cannot be shipped to this pincode. Choose pickup or remove this item.` };
      }
      if (variant.shipping_class === "maharashtra_cables" && input.stateCode !== "27") {
        return { ok: false, message: "Cable delivery is available within Maharashtra only." };
      }
      if (!shippingByClass.has(variant.shipping_class)) {
        const freeAt = rule.free_shipping_over_paise;
        shippingByClass.set(variant.shipping_class, freeAt != null && subtotal >= Number(freeAt) ? 0 : Number(rule.rate_paise));
      }
    } else if (variant.shipping_class === "pickup_only" && input.fulfillmentType !== "pickup") {
      return { ok: false, message: `${variant.product_name} is available for pickup only.` };
    }
  }
  const shipping = [...shippingByClass.values()].reduce((sum, amount) => sum + amount, 0);
  return {
    ok: true,
    zoneId: zone?.zone_id ?? null,
    lines,
    quote: {
      items: lines.map((line) => ({
        variantId: line.variantId,
        name: `${line.productName} · ${line.variantLabel}`,
        quantity: line.quantity,
        unitPricePaise: line.pricePaise,
        lineTotalPaise: line.lineTotalPaise,
      })),
      subtotalPaise: subtotal,
      shippingPaise: shipping,
      taxPaise: tax,
      totalPaise: subtotal + shipping + tax,
      currency: "INR",
    },
  };
}

app.post("/api/v1/checkout/quote", async (c) => {
  const parsed = QuoteCheckoutBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  const result = await calculateQuote(c.env.DB, parsed.data as CheckoutPayload);
  if (!result.ok) return error(c, result.message, 400);
  return c.json(result.quote);
});

app.post("/api/v1/orders", async (c) => {
  const parsed = CreateOrderBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  const idempotencyKey = c.req.header("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
    return error(c, "A valid Idempotency-Key header is required.");
  }
  const existing = await row<{ order_number: string; status: string; total_paise: number }>(
    c.env.DB,
    `SELECT order_number,status,total_paise FROM orders WHERE idempotency_key=?`,
    [idempotencyKey],
  );
  if (existing) {
    return c.json({ orderNumber: existing.order_number, status: existing.status, totalPaise: existing.total_paise, currency: "INR" }, 201);
  }
  const input = parsed.data as CheckoutPayload;
  input.buyerPhone = cleanPhone(input.buyerPhone);
  const result = await calculateQuote(c.env.DB, input);
  if (!result.ok) return error(c, result.message, 409);
  const quote = result.quote as { subtotalPaise: number; shippingPaise: number; taxPaise: number; totalPaise: number };
  const orderId = uuid();
  const orderNumber = `MH-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const customer = input.orderType === "wholesale"
    ? await row<{ id: string }>(c.env.DB, "SELECT id FROM customers WHERE phone=? AND business_status='approved'", [input.buyerPhone])
    : null;
  const paymentStatus = input.paymentMethod === "cod" ? "cod_due" : input.paymentMethod === "cash_pickup" ? "cash_due" : "pending";
  const statements: D1Statement[] = [];
  if (input.orderType === "retail") {
    statements.push(c.env.DB.prepare(
      `INSERT INTO customers (id,customer_type,name,email,phone)
       VALUES (?,'retail',?,?,?)
       ON CONFLICT(phone) DO UPDATE SET name=excluded.name,email=COALESCE(excluded.email,customers.email),
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    ).bind(uuid(), input.buyerName, input.buyerEmail ?? null, input.buyerPhone));
  }
  statements.push(c.env.DB.prepare(
    `INSERT INTO orders (
      id,order_number,idempotency_key,customer_id,buyer_name,buyer_email,buyer_phone,order_type,status,
      payment_status,payment_method,fulfillment_type,subtotal_paise,shipping_paise,tax_paise,total_paise,
      shipping_name,shipping_phone,address_line1,address_line2,city,district,state_code,pincode,shipping_zone_id,
      customer_note,reservation_expires_at
    ) VALUES (?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    orderId, orderNumber, idempotencyKey, customer?.id ?? null, input.buyerName, input.buyerEmail ?? null,
    input.buyerPhone, input.orderType, paymentStatus, input.paymentMethod, input.fulfillmentType,
    quote.subtotalPaise, quote.shippingPaise, quote.taxPaise, quote.totalPaise,
    input.fulfillmentType === "ship" ? input.buyerName : null,
    input.fulfillmentType === "ship" ? input.buyerPhone : null,
    input.addressLine1 ?? null, input.addressLine2 ?? null, input.city ?? null, input.district ?? null,
    input.stateCode ?? null, input.pincode ?? null, result.zoneId, input.customerNote ?? null,
    input.paymentMethod === "manual_upi" ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
  ));
  for (const line of result.lines) {
    statements.push(c.env.DB.prepare(
      `INSERT INTO order_items
       (id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,sku_snapshot,quantity,unit_price_paise,tax_paise,line_total_paise)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(uuid(), orderId, line.productId, line.variantId, line.productName, line.attributesJson,
      line.sku, line.quantity, line.pricePaise, line.taxPaise, line.lineTotalPaise));
    statements.push(c.env.DB.prepare(
      `UPDATE inventory SET reserved_qty=reserved_qty+?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE variant_id=?`,
    ).bind(line.quantity, line.variantId));
  }
  statements.push(...makeNotificationStatements(c.env, "order.created", "order", orderId, {
    orderNumber, buyerName: input.buyerName, buyerPhone: input.buyerPhone,
    totalPaise: quote.totalPaise, orderType: input.orderType,
  }));
  try {
    await c.env.DB.batch(statements);
  } catch {
    return error(c, "Stock changed while placing the order. Refresh the cart and try again.", 409);
  }
  return c.json({ orderNumber, status: "pending", totalPaise: quote.totalPaise, currency: "INR" }, 201);
});

app.post("/api/v1/repair-requests", async (c) => {
  const parsed = CreateRepairRequestBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  const input = parsed.data;
  const id = uuid();
  const requestNumber = `REP-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const phone = cleanPhone(input.phone);
  const customer = await row<{ id: string }>(c.env.DB, "SELECT id FROM customers WHERE phone=?", [phone]);
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO repair_requests
       (id,request_number,customer_id,customer_name,phone,email,device_type,brand,model,service_type,issue_description,preferred_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, requestNumber, customer?.id ?? null, input.customerName, phone, input.email ?? null,
      input.deviceType, input.brand ?? null, input.model ?? null, input.serviceType,
      input.issueDescription, input.preferredDate ?? null),
    ...makeNotificationStatements(c.env, "repair.created", "repair_request", id, {
      requestNumber, customerName: input.customerName, phone, deviceType: input.deviceType,
    }),
  ];
  await c.env.DB.batch(statements);
  return c.json({ requestNumber, status: "pending" }, 201);
});

app.post("/api/v1/business-applications", async (c) => {
  const parsed = CreateBusinessApplicationBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  const input = parsed.data;
  const phone = cleanPhone(input.phone);
  const existing = await row<{ id: string; business_status: string }>(
    c.env.DB, "SELECT id,business_status FROM customers WHERE phone=?", [phone],
  );
  if (existing?.business_status === "approved") return c.json({ status: "approved" }, 200);
  const id = existing?.id ?? uuid();
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO customers (id,customer_type,name,email,phone,company_name,gstin,business_status)
       VALUES (?,'business',?,?,?,?,?,'pending')
       ON CONFLICT(phone) DO UPDATE SET customer_type='business',name=excluded.name,
       email=COALESCE(excluded.email,customers.email),company_name=excluded.company_name,gstin=excluded.gstin,
       business_status=CASE WHEN customers.business_status='approved' THEN 'approved' ELSE 'pending' END,
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    ).bind(id, input.contactName, input.email ?? null, phone, input.businessName, input.gstin ?? null),
    ...makeNotificationStatements(c.env, "business.applied", "business_application", id, {
      contactName: input.contactName, businessName: input.businessName, phone,
    }),
  ];
  await c.env.DB.batch(statements);
  return c.json({ status: "pending" }, 201);
});

function requireOwner(c: AppContext) {
  return c.get("ownerEmail");
}

async function adminOrderRows(db: D1Binding, status?: string, page = 1) {
  const values: unknown[] = [];
  const where = status ? "WHERE o.status=?" : "";
  if (status) values.push(status);
  const count = await row<{ total: number }>(db, `SELECT COUNT(*) AS total FROM orders o ${where}`, values);
  const results = await rows<D1Row>(
    db,
    `SELECT o.order_number,o.buyer_name,o.buyer_phone,o.order_type,o.status,o.payment_status,
       o.total_paise,o.created_at,COUNT(oi.id) AS item_count
     FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
     ${where} GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50 OFFSET ?`,
    [...values, (page - 1) * 50],
  );
  return {
    items: results.map((item) => ({
      orderNumber: item.order_number, buyerName: item.buyer_name, buyerPhone: item.buyer_phone,
      orderType: item.order_type, status: item.status, paymentStatus: item.payment_status,
      totalPaise: Number(item.total_paise), createdAt: item.created_at, itemCount: Number(item.item_count),
    })),
    total: Number(count?.total ?? 0),
    page,
  };
}

app.get("/api/v1/admin/overview", async (c) => {
  await requireOwner(c);
  const { today, month } = indiaRange();
  const stats = await row<D1Row>(
    c.env.DB,
    `SELECT
      COALESCE(SUM(CASE WHEN payment_status='paid' AND created_at>=? THEN total_paise ELSE 0 END),0) AS today_revenue,
      COALESCE(SUM(CASE WHEN payment_status='paid' AND created_at>=? THEN total_paise ELSE 0 END),0) AS month_revenue,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_orders
     FROM orders`,
    [today, month],
  );
  const low = await row<{ count: number }>(
    c.env.DB,
    "SELECT COUNT(*) AS count FROM inventory WHERE on_hand_qty-reserved_qty<=low_stock_threshold",
  );
  const recentOrders = await adminOrderRows(c.env.DB, undefined, 1);
  return c.json({
    todayRevenuePaise: Number(stats?.today_revenue ?? 0),
    monthRevenuePaise: Number(stats?.month_revenue ?? 0),
    pendingOrders: Number(stats?.pending_orders ?? 0),
    lowStockCount: Number(low?.count ?? 0),
    recentOrders: recentOrders.items.slice(0, 6),
  });
});

function indiaRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "01";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    today: new Date(`${year}-${month}-${day}T00:00:00+05:30`).toISOString(),
    month: new Date(`${year}-${month}-01T00:00:00+05:30`).toISOString(),
  };
}

app.get("/api/v1/admin/orders", async (c) => {
  await requireOwner(c);
  const parsed = ListAdminOrdersQueryParams.safeParse({
    status: c.req.query("status"), page: c.req.query("page"),
  });
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  return c.json(await adminOrderRows(c.env.DB, parsed.data.status, parsed.data.page ?? 1));
});

app.patch("/api/v1/admin/orders/:orderNumber/status", async (c) => {
  await requireOwner(c);
  const parsed = UpdateOrderStatusBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  const orderNumber = c.req.param("orderNumber");
  const order = await row<{ id: string; status: string; payment_method: string; payment_status: string }>(
    c.env.DB, "SELECT id,status,payment_method,payment_status FROM orders WHERE order_number=?", [orderNumber],
  );
  if (!order) return error(c, "Order not found.", 404);
  const target = parsed.data.status;
  const allowed: Record<string, string[]> = {
    pending: ["processing", "cancelled"],
    processing: ["dispatched", "cancelled"],
    dispatched: ["delivered"],
    delivered: ["completed"],
    completed: [],
    cancelled: [],
  };
  if (!allowed[order.status]?.includes(target)) return error(c, `Cannot move an order from ${order.status} to ${target}.`, 409);
  if (target === "processing" && order.payment_method === "manual_upi" && order.payment_status !== "paid") {
    return error(c, "Reconcile the manual UPI payment before processing this order.", 409);
  }
  const items = await rows<{ id: string; variant_id: string; quantity: number }>(
    c.env.DB, "SELECT id,variant_id,quantity FROM order_items WHERE order_id=?", [order.id],
  );
  const statements: D1Statement[] = [];
  if (order.status === "pending" && target === "processing") {
    for (const item of items) {
      let remaining = Number(item.quantity);
      const batches = await rows<{ id: string; qty_remaining: number }>(
        c.env.DB,
        "SELECT id,qty_remaining FROM inventory_batches WHERE variant_id=? AND qty_remaining>0 ORDER BY received_at,id",
        [item.variant_id],
      );
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(batch.qty_remaining));
        statements.push(c.env.DB.prepare(
          "UPDATE inventory_batches SET qty_remaining=qty_remaining-? WHERE id=? AND qty_remaining>=?",
        ).bind(take, batch.id, take));
        statements.push(c.env.DB.prepare(
          "INSERT INTO order_item_batches (id,order_item_id,batch_id,quantity) VALUES (?,?,?,?)",
        ).bind(uuid(), item.id, batch.id, take));
        statements.push(c.env.DB.prepare(
          `INSERT INTO inventory_movements (id,variant_id,batch_id,order_id,movement_type,quantity_delta,note)
           VALUES (?,?,?,?,'sale',?,'Order sent for processing')`,
        ).bind(uuid(), item.variant_id, batch.id, order.id, -take));
        remaining -= take;
      }
      if (remaining > 0) return error(c, "Batch stock is out of sync. Reconcile inventory before processing this order.", 409);
      statements.push(c.env.DB.prepare(
        `UPDATE inventory SET on_hand_qty=on_hand_qty-?,reserved_qty=reserved_qty-?,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE variant_id=?`,
      ).bind(item.quantity, item.quantity, item.variant_id));
    }
  } else if (target === "cancelled" && order.status === "pending") {
    for (const item of items) statements.push(c.env.DB.prepare(
      "UPDATE inventory SET reserved_qty=reserved_qty-?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE variant_id=?",
    ).bind(item.quantity, item.variant_id));
  } else if (target === "cancelled" && order.status === "processing") {
    const allocations = await rows<{ variant_id: string; batch_id: string; quantity: number; order_item_id: string }>(
      c.env.DB,
      `SELECT oi.variant_id,oib.batch_id,oib.quantity,oib.order_item_id
       FROM order_item_batches oib JOIN order_items oi ON oi.id=oib.order_item_id
       WHERE oi.order_id=?`,
      [order.id],
    );
    for (const allocation of allocations) {
      statements.push(c.env.DB.prepare(
        "UPDATE inventory_batches SET qty_remaining=qty_remaining+? WHERE id=?",
      ).bind(allocation.quantity, allocation.batch_id));
      statements.push(c.env.DB.prepare(
        `INSERT INTO inventory_movements (id,variant_id,batch_id,order_id,movement_type,quantity_delta,note)
         VALUES (?,?,?,?,'return',?,'Cancelled order returned to stock')`,
      ).bind(uuid(), allocation.variant_id, allocation.batch_id, order.id, allocation.quantity));
    }
    for (const item of items) statements.push(c.env.DB.prepare(
      "UPDATE inventory SET on_hand_qty=on_hand_qty+?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE variant_id=?",
    ).bind(item.quantity, item.variant_id));
  }
  statements.push(c.env.DB.prepare(
    "UPDATE orders SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
  ).bind(target, order.id));
  statements.push(...makeNotificationStatements(c.env, `order.${target}`, "order", order.id, { orderNumber, status: target }));
  try {
    await c.env.DB.batch(statements);
  } catch {
    return error(c, "The order could not be updated because stock changed. Refresh and try again.", 409);
  }
  const updated = await adminOrderRows(c.env.DB, undefined, 1);
  const found = updated.items.find((item) => item.orderNumber === orderNumber);
  return c.json(found ?? { orderNumber, status: target });
});

app.patch("/api/v1/admin/orders/:orderNumber/payment-status", async (c) => {
  await requireOwner(c);
  const parsed = UpdateOrderPaymentStatusBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  const orderNumber = c.req.param("orderNumber");
  const result = await c.env.DB.prepare(
    `UPDATE orders SET payment_status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE order_number=? AND status!='cancelled'`,
  ).bind(parsed.data.paymentStatus, orderNumber).run();
  if (result.meta.changes === 0) return error(c, "Order not found or cancelled.", 404);
  const updated = await adminOrderRows(c.env.DB, undefined, 1);
  return c.json(updated.items.find((item) => item.orderNumber === orderNumber) ?? {});
});

app.get("/api/v1/admin/inventory", async (c) => {
  await requireOwner(c);
  const parsed = ListAdminInventoryQueryParams.safeParse({
    search: c.req.query("search"), lowStockOnly: c.req.query("lowStockOnly"),
  });
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  const search = parsed.data.search?.trim() ?? "";
  const where: string[] = [];
  const values: unknown[] = [];
  if (search) {
    where.push("(v.sku LIKE ? OR p.name LIKE ? OR v.variant_label LIKE ?)");
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (parsed.data.lowStockOnly) where.push("(i.on_hand_qty-i.reserved_qty)<=i.low_stock_threshold");
  const list = await rows<D1Row>(
    c.env.DB,
    `SELECT v.id AS variant_id,v.sku,p.name AS product_name,v.variant_label,
      i.on_hand_qty,i.reserved_qty,i.low_stock_threshold,
      COALESCE(SUM(CASE WHEN b.qty_remaining>0 THEN 1 ELSE 0 END),0) AS batches
     FROM product_variants v JOIN products p ON p.id=v.product_id
     LEFT JOIN inventory i ON i.variant_id=v.id
     LEFT JOIN inventory_batches b ON b.variant_id=v.id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY v.id ORDER BY p.name,v.sku LIMIT 250`,
    values,
  );
  return c.json(list.map((item) => ({
    variantId: item.variant_id, sku: item.sku, productName: item.product_name,
    variantLabel: item.variant_label, onHandQty: Number(item.on_hand_qty ?? 0),
    reservedQty: Number(item.reserved_qty ?? 0),
    availableQty: Number(item.on_hand_qty ?? 0) - Number(item.reserved_qty ?? 0),
    lowStockThreshold: Number(item.low_stock_threshold ?? 0), batches: Number(item.batches ?? 0),
  })));
});

async function applyStockDelta(
  env: Bindings,
  variantId: string,
  delta: number,
  note: string,
  batchCode?: string,
  unitCostPaise?: number | null,
) {
  const db = env.DB;
  const inventory = await row<{ on_hand_qty: number; reserved_qty: number; low_stock_threshold: number }>(
    db, "SELECT on_hand_qty,reserved_qty,low_stock_threshold FROM inventory WHERE variant_id=?", [variantId],
  );
  if (!inventory) return { error: "Inventory record not found." };
  const currentAvailable = Number(inventory.on_hand_qty) - Number(inventory.reserved_qty);
  if (delta < 0 && -delta > currentAvailable) return { error: "Adjustment would reduce available stock below reserved units." };
  const statements: D1Statement[] = [];
  if (delta > 0) {
    const movementType = batchCode ? "received" : "adjustment";
    const code = batchCode ?? `ADJ-${new Date().toISOString().slice(0, 10)}-${uuid().slice(0, 6)}`;
    statements.push(db.prepare(
      `INSERT INTO inventory_batches (id,variant_id,batch_code,qty_received,qty_remaining,unit_cost_paise,supplier_note)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(uuid(), variantId, code, delta, delta, unitCostPaise ?? null, note));
    statements.push(db.prepare(
      "UPDATE inventory SET on_hand_qty=on_hand_qty+?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE variant_id=?",
    ).bind(delta, variantId));
    statements.push(db.prepare(
      `INSERT INTO inventory_movements (id,variant_id,movement_type,quantity_delta,note)
       VALUES (?,?,?,?,?)`,
    ).bind(uuid(), variantId, movementType, delta, note));
  } else {
    let remaining = -delta;
    const batches = await rows<{ id: string; qty_remaining: number }>(
      db, "SELECT id,qty_remaining FROM inventory_batches WHERE variant_id=? AND qty_remaining>0 ORDER BY received_at,id",
      [variantId],
    );
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(batch.qty_remaining));
      statements.push(db.prepare(
        "UPDATE inventory_batches SET qty_remaining=qty_remaining-? WHERE id=? AND qty_remaining>=?",
      ).bind(take, batch.id, take));
      statements.push(db.prepare(
        `INSERT INTO inventory_movements (id,variant_id,batch_id,movement_type,quantity_delta,note)
         VALUES (?, ?, ?,'adjustment',?,?)`,
      ).bind(uuid(), variantId, batch.id, -take, note));
      remaining -= take;
    }
    if (remaining > 0) return { error: "Batch counts do not match the inventory summary; reconcile batches first." };
    statements.push(db.prepare(
      "UPDATE inventory SET on_hand_qty=on_hand_qty+?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE variant_id=?",
    ).bind(delta, variantId));
  }
  const projectedAvailable = currentAvailable + delta;
  if (projectedAvailable <= Number(inventory.low_stock_threshold)) {
    statements.push(...makeNotificationStatements(env, "inventory.low_stock", "inventory", variantId, {
      variantId, availableQty: projectedAvailable, threshold: Number(inventory.low_stock_threshold),
    }));
  }
  try {
    await db.batch(statements);
    return {};
  } catch {
    return { error: "Inventory changed during this update. Refresh and try again." };
  }
}

app.post("/api/v1/admin/inventory/:variantId/adjustments", async (c) => {
  await requireOwner(c);
  const parsed = CreateInventoryAdjustmentBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  if (!parsed.data.quantityDelta) return error(c, "Quantity adjustment cannot be zero.");
  const result = await applyStockDelta(c.env, c.req.param("variantId"), parsed.data.quantityDelta, parsed.data.note);
  if (result.error) return error(c, result.error, 409);
  const inventory = await listInventoryById(c.env.DB, c.req.param("variantId"));
  return c.json(inventory, 201);
});

app.post("/api/v1/admin/inventory/:variantId/receipts", async (c) => {
  await requireOwner(c);
  const parsed = CreateInventoryReceiptBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  const result = await applyStockDelta(
    c.env, c.req.param("variantId"), parsed.data.quantity,
    parsed.data.note ?? `Stock received as batch ${parsed.data.batchCode}`,
    parsed.data.batchCode, parsed.data.unitCostPaise,
  );
  if (result.error) return error(c, result.error, 409);
  return c.json(await listInventoryById(c.env.DB, c.req.param("variantId")), 201);
});

async function listInventoryById(db: D1Binding, variantId: string) {
  const item = await row<D1Row>(
    db,
    `SELECT v.id AS variant_id,v.sku,p.name AS product_name,v.variant_label,
      i.on_hand_qty,i.reserved_qty,i.low_stock_threshold,
      (SELECT COUNT(*) FROM inventory_batches b WHERE b.variant_id=v.id AND b.qty_remaining>0) AS batches
     FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN inventory i ON i.variant_id=v.id
     WHERE v.id=?`,
    [variantId],
  );
  if (!item) return null;
  return {
    variantId: item.variant_id, sku: item.sku, productName: item.product_name,
    variantLabel: item.variant_label, onHandQty: Number(item.on_hand_qty ?? 0),
    reservedQty: Number(item.reserved_qty ?? 0), availableQty: Number(item.on_hand_qty ?? 0) - Number(item.reserved_qty ?? 0),
    lowStockThreshold: Number(item.low_stock_threshold ?? 0), batches: Number(item.batches ?? 0),
  };
}

app.get("/api/v1/admin/repairs", async (c) => {
  await requireOwner(c);
  const list = await rows<D1Row>(
    c.env.DB,
    `SELECT id,request_number,customer_name,phone,email,device_type,brand,model,service_type,
      issue_description,status,created_at FROM repair_requests ORDER BY created_at DESC LIMIT 250`,
  );
  return c.json(list.map((item) => ({
    id: item.id, requestNumber: item.request_number, customerName: item.customer_name,
    phone: item.phone, email: item.email, deviceType: item.device_type, brand: item.brand,
    model: item.model, serviceType: item.service_type, issueDescription: item.issue_description,
    status: item.status, createdAt: item.created_at,
  })));
});

app.patch("/api/v1/admin/repairs/:id/status", async (c) => {
  await requireOwner(c);
  const parsed = UpdateRepairStatusBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  const id = c.req.param("id");
  const result = await c.env.DB.prepare(
    "UPDATE repair_requests SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
  ).bind(parsed.data.status, id).run();
  if (!result.meta.changes) return error(c, "Repair request not found.", 404);
  const repair = await row<D1Row>(
    c.env.DB,
    `SELECT id,request_number,customer_name,phone,email,device_type,brand,model,service_type,issue_description,status,created_at
     FROM repair_requests WHERE id=?`,
    [id],
  );
  if (!repair) return error(c, "Repair request not found.", 404);
  return c.json({
    id: repair.id, requestNumber: repair.request_number, customerName: repair.customer_name,
    phone: repair.phone, email: repair.email, deviceType: repair.device_type, brand: repair.brand,
    model: repair.model, serviceType: repair.service_type, issueDescription: repair.issue_description,
    status: repair.status, createdAt: repair.created_at,
  });
});

app.get("/api/v1/admin/sales", async (c) => {
  await requireOwner(c);
  const { today, month } = indiaRange();
  const summary = await row<D1Row>(
    c.env.DB,
    `SELECT
      COALESCE(SUM(CASE WHEN payment_status='paid' AND created_at>=? THEN total_paise ELSE 0 END),0) AS today_revenue,
      COALESCE(SUM(CASE WHEN payment_status='paid' AND created_at>=? THEN total_paise ELSE 0 END),0) AS month_revenue,
      SUM(CASE WHEN payment_status='paid' AND created_at>=? THEN 1 ELSE 0 END) AS today_orders,
      SUM(CASE WHEN payment_status='paid' AND created_at>=? THEN 1 ELSE 0 END) AS month_orders
     FROM orders`,
    [today, month, today, month],
  );
  const sellers = await rows<D1Row>(
    c.env.DB,
    `SELECT oi.product_name_snapshot AS product_name,SUM(oi.quantity) AS quantity_sold,
       SUM(oi.line_total_paise) AS revenue_paise
     FROM order_items oi JOIN orders o ON o.id=oi.order_id
     WHERE o.payment_status='paid' AND o.created_at>=?
     GROUP BY oi.product_id,oi.product_name_snapshot
     ORDER BY quantity_sold DESC LIMIT 5`,
    [month],
  );
  return c.json({
    todayRevenuePaise: Number(summary?.today_revenue ?? 0),
    monthRevenuePaise: Number(summary?.month_revenue ?? 0),
    todayOrders: Number(summary?.today_orders ?? 0),
    monthOrders: Number(summary?.month_orders ?? 0),
    bestSellers: sellers.map((item) => ({
      productName: item.product_name, quantitySold: Number(item.quantity_sold),
      revenuePaise: Number(item.revenue_paise),
    })),
  });
});

app.get("/api/v1/admin/notifications", async (c) => {
  await requireOwner(c);
  const items = await rows<D1Row>(
    c.env.DB,
    `SELECT id,event_type,entity_type,entity_id,payload_json,created_at,is_read
     FROM notifications WHERE channel='dashboard' ORDER BY created_at DESC LIMIT 100`,
  );
  const unread = await row<{ total: number }>(
    c.env.DB, "SELECT COUNT(*) AS total FROM notifications WHERE channel='dashboard' AND is_read=0",
  );
  return c.json({
    items: items.map((item) => ({
      id: item.id, eventType: item.event_type, entityType: item.entity_type,
      entityId: item.entity_id, payload: parseJson(item.payload_json as string, {}),
      createdAt: item.created_at, read: Boolean(item.is_read),
    })),
    unreadCount: Number(unread?.total ?? 0),
  });
});

app.patch("/api/v1/admin/notifications/:id/read", async (c) => {
  await requireOwner(c);
  await c.env.DB.prepare(
    "UPDATE notifications SET is_read=1 WHERE id=? AND channel='dashboard'",
  ).bind(c.req.param("id")).run();
  return c.json({ success: true });
});

app.get("/api/v1/admin/business-applications", async (c) => {
  await requireOwner(c);
  const list = await rows<D1Row>(
    c.env.DB,
    `SELECT id,name,phone,email,company_name,gstin,business_status,created_at
     FROM customers WHERE customer_type='business' AND business_status IN ('pending','approved')
     ORDER BY CASE business_status WHEN 'pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 200`,
  );
  return c.json(list.map((item) => ({
    id: item.id, name: item.name, phone: item.phone, email: item.email,
    companyName: item.company_name, gstin: item.gstin, businessStatus: item.business_status,
    createdAt: item.created_at,
  })));
});

app.patch("/api/v1/admin/business-applications/:id/status", async (c) => {
  await requireOwner(c);
  const parsed = UpdateBusinessApplicationStatusBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, validationMessage(parsed.error.issues));
  const result = await c.env.DB.prepare(
    `UPDATE customers SET business_status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id=? AND customer_type='business'`,
  ).bind(parsed.data.businessStatus, c.req.param("id")).run();
  if (!result.meta.changes) return error(c, "Business application not found.", 404);
  const customer = await row<D1Row>(
    c.env.DB,
    "SELECT id,name,phone,email,company_name,gstin,business_status,created_at FROM customers WHERE id=?",
    [c.req.param("id")],
  );
  if (!customer) return error(c, "Business application not found.", 404);
  return c.json({
    id: customer.id, name: customer.name, phone: customer.phone, email: customer.email,
    companyName: customer.company_name, gstin: customer.gstin, businessStatus: customer.business_status,
    createdAt: customer.created_at,
  });
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found." }, 404);
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text("Storefront assets are not built yet.", 404);
});
app.onError((err, c) => {
  return c.json({ error: "The request could not be completed." }, 500);
});

export default app;
export type { Bindings, D1Binding, D1Statement, D1StatementResult };
