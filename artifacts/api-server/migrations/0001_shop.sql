PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  brand TEXT,
  product_kind TEXT NOT NULL DEFAULT 'physical'
    CHECK (product_kind IN ('physical', 'service')),
  shipping_class TEXT NOT NULL DEFAULT 'standard_local'
    CHECK (shipping_class IN ('maharashtra_cables', 'standard_local', 'fragile_zone', 'pickup_only')),
  hsn_code TEXT,
  gst_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (gst_rate_bps >= 0),
  image_urls_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(image_urls_json)),
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL UNIQUE,
  variant_label TEXT NOT NULL DEFAULT 'Default',
  attributes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json)),
  retail_price_paise INTEGER NOT NULL CHECK (retail_price_paise >= 0),
  wholesale_price_paise INTEGER CHECK (wholesale_price_paise IS NULL OR wholesale_price_paise >= 0),
  wholesale_min_qty INTEGER NOT NULL DEFAULT 1 CHECK (wholesale_min_qty >= 1),
  weight_grams INTEGER CHECK (weight_grams IS NULL OR weight_grams >= 0),
  tracks_inventory INTEGER NOT NULL DEFAULT 1 CHECK (tracks_inventory IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS inventory (
  variant_id TEXT PRIMARY KEY REFERENCES product_variants(id) ON DELETE RESTRICT,
  on_hand_qty INTEGER NOT NULL DEFAULT 0 CHECK (on_hand_qty >= 0),
  reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (reserved_qty <= on_hand_qty)
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  batch_code TEXT NOT NULL,
  qty_received INTEGER NOT NULL CHECK (qty_received > 0),
  qty_remaining INTEGER NOT NULL CHECK (qty_remaining >= 0 AND qty_remaining <= qty_received),
  unit_cost_paise INTEGER CHECK (unit_cost_paise IS NULL OR unit_cost_paise >= 0),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  supplier_note TEXT,
  UNIQUE (variant_id, batch_code)
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  customer_type TEXT NOT NULL DEFAULT 'retail' CHECK (customer_type IN ('retail', 'business')),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL UNIQUE,
  company_name TEXT,
  gstin TEXT,
  business_status TEXT NOT NULL DEFAULT 'none'
    CHECK (business_status IN ('none', 'pending', 'approved', 'rejected')),
  default_address_json TEXT CHECK (default_address_json IS NULL OR json_valid(default_address_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS shipping_zones (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  state_code TEXT NOT NULL DEFAULT '27',
  district TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS shipping_zone_pincodes (
  pincode TEXT PRIMARY KEY CHECK (length(pincode) = 6),
  zone_id TEXT NOT NULL REFERENCES shipping_zones(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS shipping_rules (
  id TEXT PRIMARY KEY,
  shipping_class TEXT NOT NULL
    CHECK (shipping_class IN ('maharashtra_cables', 'standard_local', 'fragile_zone', 'pickup_only')),
  zone_id TEXT REFERENCES shipping_zones(id) ON DELETE CASCADE,
  is_allowed INTEGER NOT NULL CHECK (is_allowed IN (0, 1)),
  rate_paise INTEGER NOT NULL DEFAULT 0 CHECK (rate_paise >= 0),
  free_shipping_over_paise INTEGER CHECK (free_shipping_over_paise IS NULL OR free_shipping_over_paise >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT UNIQUE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT,
  buyer_phone TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'retail' CHECK (order_type IN ('retail', 'wholesale')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'dispatched', 'delivered', 'completed', 'cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'cod_due', 'cash_due')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod', 'manual_upi', 'cash_pickup')),
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('ship', 'pickup')),
  subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  shipping_paise INTEGER NOT NULL DEFAULT 0 CHECK (shipping_paise >= 0),
  tax_paise INTEGER NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  shipping_name TEXT,
  shipping_phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  district TEXT,
  state_code TEXT,
  pincode TEXT,
  shipping_zone_id TEXT REFERENCES shipping_zones(id) ON DELETE SET NULL,
  customer_note TEXT,
  reservation_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  variant_snapshot TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(variant_snapshot)),
  sku_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
  tax_paise INTEGER NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  line_total_paise INTEGER NOT NULL CHECK (line_total_paise >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (order_id, variant_id)
);

CREATE TABLE IF NOT EXISTS order_item_batches (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  batch_id TEXT NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  UNIQUE (order_item_id, batch_id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES inventory_batches(id) ON DELETE RESTRICT,
  order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('received', 'sale', 'adjustment', 'return')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS repair_requests (
  id TEXT PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  device_type TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  service_type TEXT NOT NULL CHECK (service_type IN ('hardware', 'software', 'other')),
  issue_description TEXT NOT NULL,
  preferred_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'in_progress', 'ready', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('order', 'repair_request', 'inventory', 'business_application')
  ),
  entity_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('dashboard', 'webhook')),
  dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'sent', 'failed')),
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS products_category_status_idx ON products(category_id, status, name);
CREATE INDEX IF NOT EXISTS products_status_featured_idx ON products(status, is_featured);
CREATE INDEX IF NOT EXISTS product_variants_product_active_idx ON product_variants(product_id, is_active);
CREATE INDEX IF NOT EXISTS inventory_batches_variant_received_idx ON inventory_batches(variant_id, received_at);
CREATE INDEX IF NOT EXISTS customers_business_status_idx ON customers(customer_type, business_status);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS orders_payment_created_idx ON orders(payment_status, created_at);
CREATE INDEX IF NOT EXISTS orders_customer_created_idx ON orders(customer_id, created_at);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_variant_idx ON order_items(variant_id);
CREATE INDEX IF NOT EXISTS inventory_movements_variant_created_idx ON inventory_movements(variant_id, created_at);
CREATE INDEX IF NOT EXISTS shipping_zone_pincodes_zone_idx ON shipping_zone_pincodes(zone_id);
CREATE UNIQUE INDEX IF NOT EXISTS shipping_rules_default_uq ON shipping_rules(shipping_class) WHERE zone_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shipping_rules_zone_uq ON shipping_rules(shipping_class, zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS repair_requests_status_created_idx ON repair_requests(status, created_at);
CREATE INDEX IF NOT EXISTS repair_requests_phone_created_idx ON repair_requests(phone, created_at);
CREATE INDEX IF NOT EXISTS notifications_status_next_attempt_idx ON notifications(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS notifications_entity_created_idx ON notifications(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_dashboard_unread_idx ON notifications(channel, is_read, created_at);

-- Clearly labeled sample records keep the storefront and inventory screens usable
-- on first run. Replace these with the shop's verified catalog and counts.
INSERT OR IGNORE INTO categories (id, name, slug, sort_order) VALUES
  ('cat-cables', 'Cables & Wires', 'cables-wires', 1),
  ('cat-solar', 'Solar', 'solar', 2),
  ('cat-lighting', 'Lighting', 'lighting', 3),
  ('cat-switches', 'Switches', 'switches', 4),
  ('cat-phones', 'Phones & Parts', 'phones-parts', 5),
  ('cat-repair', 'Repair Services', 'repair-services', 6);

INSERT OR IGNORE INTO products
  (id, category_id, slug, name, description, brand, shipping_class, is_featured, status)
VALUES
  ('prod-copper-wire', 'cat-cables', 'copper-house-wire-15mm',
   'Copper house wire · 1.5 mm', 'Flexible copper wire for domestic electrical installations. Sample listing; confirm specification before purchase.', 'Shop selection', 'maharashtra_cables', 1, 'active'),
  ('prod-solar-panel', 'cat-solar', 'solar-panel-550w',
   'Mono solar panel · 550 W', 'High-output panel for domestic solar systems. Local and Marathwada delivery zones only in this demo configuration.', 'Shop selection', 'fragile_zone', 1, 'active'),
  ('prod-highbay-light', 'cat-lighting', 'industrial-led-highbay',
   'Industrial LED high-bay · 100 W', 'Energy-efficient lighting for workshops and commercial spaces.', 'Shop selection', 'standard_local', 1, 'active'),
  ('prod-modular-switch', 'cat-switches', 'modular-switch-6a',
   'Modular switch · 6 A', '6 amp modular switch for domestic use. Available as a single unit.', 'Shop selection', 'standard_local', 0, 'active'),
  ('prod-refurb-phone', 'cat-phones', 'refurbished-android-128gb',
   'Refurbished Android phone · 128 GB', 'Quality-checked refurbished phone. Exact model and condition to be confirmed by the shop before purchase.', 'Shop selection', 'pickup_only', 1, 'active');

INSERT OR IGNORE INTO product_variants
  (id, product_id, sku, variant_label, attributes_json, retail_price_paise, wholesale_price_paise, wholesale_min_qty)
VALUES
  ('var-copper-15-red', 'prod-copper-wire', 'WIRE-CU-15-RED', '1.5 mm · Red · per metre', '{"gauge":"1.5 mm","colour":"Red","unit":"metre"}', 3200, 2750, 100),
  ('var-solar-550', 'prod-solar-panel', 'SOLAR-MONO-550', '550 W', '{"wattage":"550 W","type":"Monocrystalline"}', 1399900, 1299900, 2),
  ('var-highbay-100', 'prod-highbay-light', 'LED-HB-100', '100 W · Cool white', '{"wattage":"100 W","colour":"Cool white"}', 89900, 79900, 5),
  ('var-switch-6a', 'prod-modular-switch', 'SW-MOD-6A', '6 A · White', '{"rating":"6 A","colour":"White"}', 24500, 19500, 20),
  ('var-phone-128', 'prod-refurb-phone', 'PHONE-REF-128', '128 GB · Grade A', '{"storage":"128 GB","condition":"Grade A"}', 899900, NULL, 1);

INSERT OR IGNORE INTO inventory (variant_id, on_hand_qty, reserved_qty, low_stock_threshold) VALUES
  ('var-copper-15-red', 1200, 0, 100),
  ('var-solar-550', 8, 0, 2),
  ('var-highbay-100', 18, 0, 4),
  ('var-switch-6a', 60, 0, 10),
  ('var-phone-128', 3, 0, 2);

INSERT OR IGNORE INTO inventory_batches
  (id, variant_id, batch_code, qty_received, qty_remaining, unit_cost_paise, supplier_note)
VALUES
  ('batch-wire-demo', 'var-copper-15-red', 'DEMO-WIRE-001', 1200, 1200, 1900, 'Sample batch; replace with verified stock'),
  ('batch-solar-demo', 'var-solar-550', 'DEMO-SOLAR-001', 8, 8, 1050000, 'Sample batch; replace with verified stock'),
  ('batch-highbay-demo', 'var-highbay-100', 'DEMO-LIGHT-001', 18, 18, 58000, 'Sample batch; replace with verified stock'),
  ('batch-switch-demo', 'var-switch-6a', 'DEMO-SWITCH-001', 60, 60, 12000, 'Sample batch; replace with verified stock'),
  ('batch-phone-demo', 'var-phone-128', 'DEMO-PHONE-001', 3, 3, 720000, 'Sample batch; replace with verified stock');

INSERT OR IGNORE INTO shipping_zones (id, code, name, district) VALUES
  ('zone-pune', 'PUNE', 'Pune delivery zone', 'Pune'),
  ('zone-marathwada', 'MARATHWADA', 'Marathwada delivery zone', 'Marathwada');

INSERT OR IGNORE INTO shipping_zone_pincodes (pincode, zone_id) VALUES
  ('411001', 'zone-pune'), ('411004', 'zone-pune'), ('411007', 'zone-pune'),
  ('411014', 'zone-pune'), ('411038', 'zone-pune'), ('411045', 'zone-pune'),
  ('431001', 'zone-marathwada'), ('431003', 'zone-marathwada'),
  ('431005', 'zone-marathwada'), ('431203', 'zone-marathwada'),
  ('413512', 'zone-marathwada'), ('431601', 'zone-marathwada'),
  ('431122', 'zone-marathwada'), ('431401', 'zone-marathwada'),
  ('413501', 'zone-marathwada'), ('431513', 'zone-marathwada');

INSERT OR IGNORE INTO shipping_rules (id, shipping_class, zone_id, is_allowed, rate_paise) VALUES
  ('rule-cables-maharashtra', 'maharashtra_cables', NULL, 1, 15000),
  ('rule-standard-default', 'standard_local', NULL, 0, 0),
  ('rule-fragile-default', 'fragile_zone', NULL, 0, 0),
  ('rule-pickup-default', 'pickup_only', NULL, 0, 0),
  ('rule-standard-pune', 'standard_local', 'zone-pune', 1, 25000),
  ('rule-standard-marathwada', 'standard_local', 'zone-marathwada', 1, 45000),
  ('rule-fragile-pune', 'fragile_zone', 'zone-pune', 1, 120000),
  ('rule-fragile-marathwada', 'fragile_zone', 'zone-marathwada', 1, 190000);
