import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useRoute } from 'wouter';
import { useForm } from 'react-hook-form';
import {
  useHealthCheck, useListCategories, useListProducts, useQuoteCheckout,
  useCreateOrder, useCreateRepairRequest, useCreateBusinessApplication,
  useGetAdminOverview, useListAdminOrders, useUpdateOrderStatus,
  useListAdminInventory, useCreateInventoryAdjustment, useCreateInventoryReceipt, useListAdminRepairs,
  useUpdateRepairStatus, useGetAdminSales, useListAdminNotifications,
  useMarkAdminNotificationRead, useUpdateOrderPaymentStatus, useListBusinessApplications,
  useUpdateBusinessApplicationStatus, getGetAdminOverviewQueryKey,
  getListAdminOrdersQueryKey, getListAdminInventoryQueryKey,
  getListAdminRepairsQueryKey, getGetAdminSalesQueryKey,
  getListAdminNotificationsQueryKey, getListBusinessApplicationsQueryKey,
  type Product, type ProductVariant,
} from '@workspace/api-client-react';
import { Form } from '@/components/ui/form';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, BadgeCheck, Bolt, Box, Check,
  ChevronDown, CircleAlert, ClipboardList, Clock3, Headphones, MapPin,
  Minus, PackageCheck, Plus, Search, ShieldCheck, ShoppingBag, ShoppingCart,
  SlidersHorizontal, Store, Wrench,
} from 'lucide-react';

type CartLine = { variantId: string; quantity: number; product: Product; variant: ProductVariant };
type CheckoutFields = {
  buyerName: string; buyerPhone: string; buyerEmail: string; orderType: 'retail' | 'wholesale';
  fulfillmentType: 'ship' | 'pickup'; paymentMethod: 'cod' | 'manual_upi' | 'cash_pickup';
  businessName: string; gstin: string; addressLine1: string; addressLine2: string;
  city: string; district: string; stateCode: string; pincode: string; customerNote: string;
};

const money = (paise?: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format((paise ?? 0) / 100);

function useStoredCart() {
  const [cart, setCart] = useState<CartLine[]>([]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('mes-cart');
      if (stored) setCart(JSON.parse(stored) as CartLine[]);
    } catch { setCart([]); }
  }, []);
  useEffect(() => { localStorage.setItem('mes-cart', JSON.stringify(cart)); }, [cart]);
  const add = (product: Product, variant: ProductVariant, quantity = 1) => setCart(current => {
    const hit = current.find(item => item.variantId === variant.id);
    return hit ? current.map(item => item.variantId === variant.id
      ? { ...item, quantity: Math.min(1000, item.quantity + quantity) } : item)
      : [...current, { product, variant, variantId: variant.id, quantity }];
  });
  const quantity = (id: string, next: number) => setCart(current =>
    next < 1 ? current.filter(item => item.variantId !== id)
      : current.map(item => item.variantId === id ? { ...item, quantity: Math.min(1000, next) } : item));
  const clear = () => setCart([]);
  return { cart, add, quantity, clear, count: cart.reduce((n, item) => n + item.quantity, 0) };
}

function Header({ count }: { count: number }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();
  const admin = location === '/admin';
  return <>
    <div className="bg-[#202631] px-4 py-2 text-[#f5f0e4]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-[11px] tracking-wide">
        <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${health?.status ? 'bg-emerald-400' : 'bg-orange-400'}`} />
          <span>LOCAL STOCK. REAL PEOPLE. READY WHEN YOU ARE.</span></div>
        <span className="hidden sm:block text-white/65">Maharashtra · Pune and Marathwada focus</span>
      </div>
    </div>
    <header className="sticky top-0 z-40 border-b border-[#d9d2c3] bg-[#fbf9f2]/95 backdrop-blur">
      <div className="mx-auto flex min-h-[74px] max-w-7xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-3 no-underline" data-testid="link-home">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-[#d9d2c3] bg-white"><img src={`${import.meta.env.BASE_URL}jv-electric-works-logo.png`} alt="" className="h-full w-full object-contain" /></span>
          <span className="leading-tight"><span className="display block text-[20px] font-extrabold uppercase text-[#202631]">JV Electric</span><span className="mono mt-1 block text-[9px] uppercase tracking-[.16em] text-[#577174]">Works</span></span>
        </Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
          <Link className={`navlink ${admin ? '' : 'is-active'}`} href="/" data-testid="link-catalog">Shop</Link>
          <Link className="navlink" href="/repair" data-testid="link-repair">Repair desk</Link>
          <Link className="navlink" href="/business" data-testid="link-wholesale">For businesses</Link>
          <Link className={`navlink ${admin ? 'is-active' : ''}`} href="/admin" data-testid="link-admin">Owner desk</Link>
        </nav>
        <Link href="/cart" className="relative flex h-10 items-center gap-2 rounded-sm border border-[#d9d2c3] px-3 text-sm font-semibold text-[#202631] hover:border-[#e97917]" data-testid="link-cart">
          <ShoppingBag size={17} /><span className="hidden sm:inline">Cart</span>
          {count > 0 && <span className="mono flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[#e97917] px-1 text-[10px] text-white" data-testid="text-cart-count">{count}</span>}
        </Link>
      </div>
      <div className="flex gap-5 overflow-x-auto border-t border-[#e8e2d6] px-4 py-2.5 md:hidden">
        <Link href="/" className="mobile-nav" data-testid="mobile-link-shop">Shop</Link><Link href="/repair" className="mobile-nav" data-testid="mobile-link-repair">Repair</Link>
        <Link href="/business" className="mobile-nav" data-testid="mobile-link-business">Wholesale</Link><Link href="/admin" className="mobile-nav" data-testid="mobile-link-owner">Owner desk</Link>
      </div>
    </header>
  </>;
}

function Footer() {
  return <footer className="mt-20 bg-[#202631] text-[#f5f0e4]">
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-[1.3fr_1fr_1fr]">
      <div><div className="display text-3xl font-extrabold uppercase">Good parts.<br/>Straight answers.</div><p className="mt-3 max-w-sm text-sm leading-6 text-white/65">A local electrical counter and mobile repair bench, serving customers across Maharashtra.</p></div>
      <div><div className="mono text-[10px] uppercase tracking-[.18em] text-[#e97917]">Find your way</div><div className="mt-4 grid gap-3 text-sm text-white/75"><Link href="/" data-testid="footer-shop">Browse stock</Link><Link href="/repair" data-testid="footer-repair">Book a repair</Link><Link href="/business" data-testid="footer-wholesale">Wholesale account</Link></div></div>
      <div><div className="mono text-[10px] uppercase tracking-[.18em] text-[#e97917]">At the counter</div><div className="mt-4 space-y-2 text-sm text-white/75"><p>Serving Pune, Marathwada and Maharashtra.</p><p>Pickup details are confirmed by the shop.</p><p>Orders are confirmed before payment.</p></div></div>
    </div><div className="border-t border-white/10 px-4 py-4 text-center text-[11px] text-white/45">JV Electric Works · Electrical, solar and mobile repair</div>
  </footer>;
}

function LoadingBlock({ label = 'Checking the counter stock' }: { label?: string }) {
  return <div className="grid min-h-56 place-items-center rounded-sm border border-dashed border-[#d9d2c3] bg-[#f7f3e9] p-6" aria-live="polite">
    <div className="w-full max-w-md"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#577174]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#e97917]" />{label}</div><div className="h-2 overflow-hidden bg-[#e9e1d3]"><div className="h-full w-2/3 animate-pulse bg-[#1f6668]" /></div></div>
  </div>;
}
function ErrorNotice({ retry, message = 'Could not reach the shop service just now.' }: { retry: () => void; message?: string }) {
  return <div className="flex flex-col items-start gap-3 border border-[#dfb7a9] bg-[#fbefea] p-5 sm:flex-row sm:items-center sm:justify-between" role="alert">
    <p className="flex items-center gap-2 text-sm text-[#7b3022]"><CircleAlert size={18}/>{message}</p>
    <button onClick={retry} className="btn-outline" data-testid="button-retry">Try again</button>
  </div>;
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product, v: ProductVariant) => void }) {
  const variant = product.variants[0];
  return <article className="product-card group" data-testid={`card-product-${product.id}`}>
    <Link href={`/product/${product.slug}`} className="block" data-testid={`link-product-${product.slug}`}>
      <div className="product-visual surface-grid">
        {product.images?.[0] ? <img src={product.images[0]} alt={product.name} className="h-full w-full object-contain p-6" /> :
          <div className="product-placeholder"><Bolt size={44} strokeWidth={1.1}/><span>{product.category || 'SHOP STOCK'}</span></div>}
        <span className="absolute left-3 top-3 rounded-sm bg-[#f7f3e9] px-2 py-1 mono text-[9px] uppercase tracking-wider text-[#577174]">{product.brand || product.category}</span>
      </div>
      <div className="p-4 pb-2"><h3 className="min-h-11 font-semibold leading-5 text-[#202631] group-hover:text-[#bd5d0c]" data-testid={`text-product-name-${product.id}`}>{product.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-9 text-xs leading-4 text-[#727879]">{product.description}</p></div>
    </Link>
    <div className="flex items-center justify-between gap-2 px-4 pb-4">
      <div><span className="mono text-[15px] font-bold text-[#202631]" data-testid={`text-product-price-${product.id}`}>{variant ? money(variant.retailPricePaise) : 'Ask at counter'}</span>
        {variant && <div className="text-[10px] text-[#727879]">{variant.availableQty > 0 ? `${variant.availableQty} available` : 'Check availability'}</div>}</div>
      <button className="icon-add" disabled={!variant} onClick={() => variant && onAdd(product, variant)} aria-label={`Add ${product.name} to cart`} data-testid={`button-add-${product.id}`}><Plus size={17}/></button>
    </div>
  </article>;
}

function Storefront({ add }: { add: (p: Product, v: ProductVariant) => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const params = useMemo(() => ({ search: search || undefined, category: category || undefined, page: 1, pageSize: 50 }), [search, category]);
  const categories = useListCategories();
  const products = useListProducts(params);
  return <main>
    <section className="hero">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 md:grid-cols-[1.08fr_.92fr] md:py-16">
        <div className="reveal">
          <div className="eyebrow"><span className="eyebrow-line"/> THE NEIGHBOURHOOD COUNTER, ONLINE</div>
          <h1 className="display mt-5 max-w-3xl text-[clamp(3.4rem,8vw,7.2rem)] font-extrabold uppercase leading-[.82] tracking-[-.045em] text-[#202631]">Power for<br/><span className="text-[#d9650d]">everyday</span><br/>work.</h1>
          <p className="mt-6 max-w-lg text-[15px] leading-7 text-[#556064]">Switchgear, wiring, lighting and the small parts that keep a home or workshop moving. Ask about shop pickup or delivery across Maharashtra.</p>
          <div className="mt-7 flex flex-wrap gap-3"><a href="#catalog" className="btn-primary" data-testid="button-browse-stock">Browse shop stock <ArrowRight size={16}/></a><Link href="/repair" className="btn-outline" data-testid="button-book-repair">Mobile repair desk <Wrench size={15}/></Link></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-semibold text-[#577174]"><span className="flex items-center gap-1.5"><ShieldCheck size={15}/> Stock confirmed before payment</span><span className="flex items-center gap-1.5"><MapPin size={14}/> Pickup by arrangement</span><span className="flex items-center gap-1.5"><Headphones size={14}/> Talk to the counter</span></div>
        </div>
        <div className="hero-art surface-grid">
          <div className="art-tag mono">SHOP FLOOR / 01</div>
          <div className="circuit circuit-a"/><div className="circuit circuit-b"/><div className="circuit circuit-c"/>
          <div className="hero-glyph"><Bolt size={128} strokeWidth={1.05}/></div>
          <div className="hero-stamp"><span className="mono">MH</span><span>LOCAL<br/>SHOP STOCK</span></div>
          <div className="hero-caption"><span className="mono text-[10px] text-[#e97917]">01 — THE RIGHT PART</span><span className="mt-1 block text-sm font-semibold">Good stock. No guesswork.</span></div>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="value-strip">
        <div><span className="value-icon"><PackageCheck size={18}/></span><div><b>Counter-checked stock</b><small>Available quantity, updated by our team</small></div></div>
        <div><span className="value-icon"><Store size={18}/></span><div><b>Pickup or delivery</b><small>Choose what works at checkout</small></div></div>
        <div><span className="value-icon"><BadgeCheck size={18}/></span><div><b>Wholesale welcome</b><small>Apply for approved trade pricing</small></div></div>
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-4 pb-16" id="catalog">
      <div className="mb-6 flex flex-col justify-between gap-5 border-b border-[#d9d2c3] pb-5 lg:flex-row lg:items-end">
        <div><div className="eyebrow"><span className="eyebrow-line"/> THE SHOP SHELF</div><h2 className="display mt-2 text-4xl font-bold uppercase text-[#202631]">Find your part.</h2></div>
        <div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
          <label className="search-box flex-1"><Search size={17}/><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search wire, switches, bulbs…" aria-label="Search products" data-testid="input-search-products"/></label>
          <label className="select-box"><SlidersHorizontal size={16}/><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category" data-testid="select-category"><option value="">All categories</option>{categories.data?.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select><ChevronDown size={14}/></label>
        </div>
      </div>
      <div className="mb-5 border border-[#ddc38e] bg-[#fff8e6] px-4 py-3 text-xs leading-5 text-[#6d5a35]" data-testid="notice-demo-catalog">Sample catalogue and stock for setup preview. Replace with the shop’s verified products, prices, counts and delivery rules before taking live orders.</div>
      {categories.isLoading && <div className="mb-4 h-9 animate-pulse bg-[#e8e2d6]"/>}
      {categories.isError && <ErrorNotice retry={() => categories.refetch()} message="Categories did not load. Your product search is still available."/>}
      {categories.data && <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        <button className={`category-chip ${!category ? 'selected' : ''}`} onClick={() => setCategory('')} data-testid="filter-category-all">All shelves</button>
        {categories.data.map(c => <button key={c.id} className={`category-chip ${category === c.slug ? 'selected' : ''}`} onClick={() => setCategory(c.slug)} data-testid={`filter-category-${c.slug}`}>{c.name}<span>{c.productCount ?? 0}</span></button>)}
      </div>}
      {products.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><LoadingBlock/><LoadingBlock/><LoadingBlock/><LoadingBlock/></div> :
        products.isError ? <ErrorNotice retry={() => products.refetch()} message="Products could not be loaded from the shop catalogue."/> :
          products.data?.items.length ? <><div className="mb-4 flex justify-between text-xs text-[#727879]"><span data-testid="text-product-count">{products.data.total} parts in this view</span><span>Retail prices include applicable tax details at checkout</span></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{products.data.items.map((p, i) => <div className="reveal" style={{ animationDelay: `${i * 35}ms` }} key={p.id}><ProductCard product={p} onAdd={add}/></div>)}</div>
          </> : <div className="empty-state"><Box size={28}/><h3>No parts on this shelf yet</h3><p>Try another search or clear the category filter.</p><button className="btn-outline" onClick={() => { setSearch(''); setCategory(''); }} data-testid="button-clear-filters">Clear filters</button></div>}
    </section>
    <section className="mx-auto max-w-7xl px-4 pb-16">
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/business" className="cta-panel trade-panel" data-testid="panel-wholesale"><span className="mono text-[10px] tracking-[.18em] text-[#f1a45c]">FOR ELECTRICIANS & SHOPKEEPERS</span><h2 className="display mt-2 text-4xl font-bold uppercase">Your next<br/>bulk order.</h2><p>Approved trade accounts get wholesale pricing on eligible lines.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-bold">Apply for an account <ArrowRight size={16}/></span></Link>
        <Link href="/repair" className="cta-panel repair-panel" data-testid="panel-repair"><span className="mono text-[10px] tracking-[.18em] text-[#ef8c32]">THE REPAIR BENCH</span><h2 className="display mt-2 text-4xl font-bold uppercase">Phone giving<br/>you trouble?</h2><p>Tell us what it’s doing. Our technician will get back with a next step.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-bold">Request a repair <ArrowRight size={16}/></span></Link>
      </div>
    </section>
  </main>;
}

function ProductDetail({ add }: { add: (p: Product, v: ProductVariant, q?: number) => void }) {
  const [, params] = useRoute('/product/:slug');
  const query = useListProducts({ page: 1, pageSize: 50 });
  const product = query.data?.items.find(item => item.slug === params?.slug);
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState(1);
  const selected = product?.variants.find(v => v.id === (variantId || product.variants[0]?.id));
  useEffect(() => { setVariantId(product?.variants[0]?.id || ''); }, [product?.id]);
  if (query.isLoading) return <main className="page-wrap"><LoadingBlock label="Finding that part on the shelf"/></main>;
  if (query.isError) return <main className="page-wrap"><ErrorNotice retry={() => query.refetch()} message="The product catalogue is unavailable."/></main>;
  if (!product) return <main className="page-wrap"><div className="empty-state"><Box/><h2>We couldn’t find that part.</h2><Link href="/" className="btn-primary">Back to shop <ArrowRight size={16}/></Link></div></main>;
  return <main className="page-wrap">
    <div className="mb-6 text-xs text-[#727879]"><Link href="/" className="hover:text-[#d9650d]">Shop</Link><span className="mx-2">/</span>{product.category}<span className="mx-2">/</span>{product.name}</div>
    <div className="grid gap-10 lg:grid-cols-[1.05fr_.95fr]">
      <div className="product-detail-visual surface-grid">{product.images?.[0] ? <img src={product.images[0]} alt={product.name} className="max-h-[440px] w-full object-contain p-8"/> : <div className="detail-glyph"><Bolt size={150}/><span>{product.brand || 'COUNTER STOCK'}</span></div>}</div>
      <div className="py-2"><div className="eyebrow"><span className="eyebrow-line"/>{product.brand || product.category}</div><h1 className="display mt-3 text-5xl font-bold uppercase leading-[.95] text-[#202631]" data-testid="text-product-title">{product.name}</h1>
        <p className="mt-5 max-w-xl text-sm leading-7 text-[#556064]">{product.description}</p>
        <div className="mt-7 border-y border-[#d9d2c3] py-5"><label className="mono text-[10px] uppercase tracking-widest text-[#577174]" htmlFor="variant-select">Choose variant</label><select id="variant-select" className="field mt-2" value={selected?.id || ''} onChange={e => setVariantId(e.target.value)} data-testid="select-product-variant">{product.variants.map(v => <option value={v.id} key={v.id}>{v.label} · {v.sku}</option>)}</select>
          {selected && <div className="mt-4 flex items-end justify-between"><div><span className="mono text-3xl font-bold" data-testid="text-detail-price">{money(selected.retailPricePaise)}</span><p className="mt-1 text-xs text-[#727879]">{selected.availableQty > 0 ? `${selected.availableQty} available at the counter` : 'Availability confirmed after checkout'}</p></div><div className="flex h-10 items-center border border-[#d9d2c3]"><button className="px-3" aria-label="Decrease quantity" onClick={() => setQty(v => Math.max(1, v - 1))} data-testid="button-qty-minus"><Minus size={14}/></button><span className="mono min-w-8 text-center text-sm">{qty}</span><button className="px-3" aria-label="Increase quantity" onClick={() => setQty(v => Math.min(1000, v + 1))} data-testid="button-qty-plus"><Plus size={14}/></button></div></div>}
        </div>
        <button className="btn-primary mt-5 w-full justify-center" disabled={!selected} onClick={() => selected && add(product, selected, qty)} data-testid="button-detail-add"><ShoppingCart size={17}/> Add to cart <span className="ml-auto">{selected ? money(selected.retailPricePaise * qty) : ''}</span></button>
        <p className="mt-4 flex items-center gap-2 text-xs text-[#577174]"><ShieldCheck size={15}/> We confirm stock and delivery options before taking payment.</p>
        <Link href="/business" className="mt-6 block border-l-2 border-[#e97917] bg-[#f1ebdf] p-4 text-sm hover:bg-[#ede5d6]"><b>Buying for a business?</b><span className="mt-1 block text-[#677073]">Apply for approved wholesale pricing <ArrowRight className="ml-1 inline" size={14}/></span></Link>
      </div>
    </div>
  </main>;
}

function CartPage({ cart, quantity }: { cart: CartLine[]; quantity: (id: string, qty: number) => void }) {
  const [, navigate] = useLocation();
  const subtotal = cart.reduce((sum, row) => sum + row.quantity * row.variant.retailPricePaise, 0);
  return <main className="page-wrap">
    <div className="eyebrow"><span className="eyebrow-line"/> YOUR PICKUP LIST</div><h1 className="display mt-2 text-5xl font-bold uppercase">The cart.</h1>
    {!cart.length ? <div className="empty-state mt-8"><ShoppingBag size={34}/><h2>Nothing in the basket yet.</h2><p>Browse the counter shelves and add the parts you need.</p><Link className="btn-primary mt-2" href="/">Browse the shop <ArrowRight size={16}/></Link></div> :
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="divide-y divide-[#d9d2c3] border-y border-[#d9d2c3]">{cart.map(row => <div key={row.variantId} className="flex gap-4 py-5" data-testid={`row-cart-${row.variantId}`}>
          <div className="grid h-20 w-20 shrink-0 place-items-center bg-[#eee9dc] text-[#1f6668]">{row.product.images?.[0] ? <img src={row.product.images[0]} alt="" className="h-full w-full object-contain p-2"/> : <Bolt size={32}/>}</div>
          <div className="min-w-0 flex-1"><Link href={`/product/${row.product.slug}`} className="font-semibold hover:text-[#bd5d0c]">{row.product.name}</Link><p className="mt-1 text-xs text-[#727879]">{row.variant.label} · {row.variant.sku}</p>
            <div className="mt-3 flex items-center gap-3"><div className="flex items-center border border-[#d9d2c3]"><button className="px-2 py-1" aria-label="Decrease quantity" onClick={() => quantity(row.variantId, row.quantity - 1)} data-testid={`button-cart-minus-${row.variantId}`}><Minus size={13}/></button><span className="mono min-w-7 text-center text-xs">{row.quantity}</span><button className="px-2 py-1" aria-label="Increase quantity" onClick={() => quantity(row.variantId, row.quantity + 1)} data-testid={`button-cart-plus-${row.variantId}`}><Plus size={13}/></button></div><button className="text-xs text-[#8b4a37] underline" onClick={() => quantity(row.variantId, 0)} data-testid={`button-remove-${row.variantId}`}>Remove</button></div>
          </div><div className="mono whitespace-nowrap text-sm font-bold">{money(row.variant.retailPricePaise * row.quantity)}</div>
        </div>)}</div>
        <aside className="h-fit border border-[#d9d2c3] bg-[#f7f3e9] p-5"><div className="mono text-[10px] uppercase tracking-widest text-[#577174]">Order estimate</div><div className="mt-5 flex justify-between text-sm"><span>Parts subtotal</span><b className="mono">{money(subtotal)}</b></div><p className="mt-3 text-xs leading-5 text-[#727879]">Shipping and tax are calculated when we confirm your delivery details.</p><div className="my-5 border-t border-[#d9d2c3] pt-4 flex justify-between"><b>Subtotal</b><b className="mono text-lg">{money(subtotal)}</b></div><button className="btn-primary w-full justify-center" onClick={() => navigate('/checkout')} data-testid="button-proceed-checkout">Continue to checkout <ArrowRight size={16}/></button><Link className="mt-4 block text-center text-xs text-[#577174] underline" href="/">Keep shopping</Link></aside>
      </div>}
  </main>;
}

function CheckoutPage({ cart, clear }: { cart: CartLine[]; clear: () => void }) {
  const form = useForm<CheckoutFields>({ defaultValues: { orderType: 'retail', fulfillmentType: 'ship', paymentMethod: 'cod', stateCode: '27' } });
  const { register, watch } = form;
  const values = watch();
  const quote = useQuoteCheckout();
  const idempotencyKey = useRef(crypto.randomUUID());
  const order = useCreateOrder({ request: { headers: { 'Idempotency-Key': idempotencyKey.current } } });
  const [receipt, setReceipt] = useState<{ orderNumber: string; totalPaise: number } | null>(null);
  const [formError, setFormError] = useState('');
  const lines = cart.map(row => ({ variantId: row.variantId, quantity: row.quantity }));
  const asInput = (data: CheckoutFields) => ({
    ...data, buyerEmail: data.buyerEmail || null, businessName: data.businessName || null,
    gstin: data.gstin || null, addressLine1: data.addressLine1 || null, addressLine2: data.addressLine2 || null,
    city: data.city || null, district: data.district || null, stateCode: data.stateCode || '27',
    pincode: data.pincode || null, customerNote: data.customerNote || null, items: lines,
  });
  const onQuote = async (data: CheckoutFields) => {
    setFormError('');
    try { await quote.mutateAsync({ data: asInput(data) }); }
    catch { setFormError('We could not price this order right now. Please check the details and try again.'); }
  };
  const onSubmit = async (data: CheckoutFields) => {
    setFormError('');
    try {
      const input = asInput(data);
      const priced = quote.data ?? await quote.mutateAsync({ data: input });
      const saved = await order.mutateAsync({ data: input });
      setReceipt({ orderNumber: saved.orderNumber, totalPaise: saved.totalPaise || priced.totalPaise });
      idempotencyKey.current = crypto.randomUUID();
      clear();
    } catch { setFormError('Order could not be placed. Your cart is still saved; please try once more.'); }
  };
  if (receipt) return <main className="page-wrap"><div className="receipt-card"><span className="receipt-check"><Check size={28}/></span><div className="eyebrow mt-5 justify-center"><span className="eyebrow-line"/> REQUEST RECEIVED</div><h1 className="display mt-2 text-5xl font-bold uppercase">You’re on the list.</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#657072]">The counter will confirm stock, delivery and payment with you. Keep this order number handy.</p><div className="mt-7 border-y border-[#d9d2c3] py-4"><div className="mono text-[10px] uppercase tracking-widest text-[#577174]">Order number</div><strong className="mono mt-2 block text-2xl" data-testid="text-order-number">{receipt.orderNumber}</strong><div className="mt-2 text-sm">Order total · <b className="mono">{money(receipt.totalPaise)}</b></div></div><Link href="/" className="btn-primary mt-6">Back to the shop <ArrowRight size={16}/></Link></div></main>;
  if (!cart.length) return <main className="page-wrap"><div className="empty-state"><ShoppingBag/><h1>Your basket is empty.</h1><Link className="btn-primary" href="/">Browse stock <ArrowRight size={16}/></Link></div></main>;
  return <main className="page-wrap"><div className="mb-6"><Link href="/cart" className="inline-flex items-center gap-2 text-xs text-[#577174]"><ArrowLeft size={14}/> Back to cart</Link></div><div className="eyebrow"><span className="eyebrow-line"/> LAST STEP AT THE COUNTER</div><h1 className="display mt-2 text-5xl font-bold uppercase">Checkout.</h1>
    <div className="mt-8 grid gap-9 lg:grid-cols-[1fr_350px]">
      <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-7">
        <section className="form-section"><h2 className="form-heading">01 / Who’s ordering?</h2>
          <div className="form-grid"><Field label="Full name" name="buyerName" register={register} required/><Field label="Mobile number" name="buyerPhone" register={register} required type="tel"/><Field label="Email (optional)" name="buyerEmail" register={register} type="email"/>
            <label className="field-wrap"><span>Order type</span><select className="field" {...register('orderType')} data-testid="select-order-type"><option value="retail">Retail</option><option value="wholesale">Wholesale account</option></select></label>
            {values.orderType === 'wholesale' && <><Field label="Business name" name="businessName" register={register}/><Field label="GSTIN (optional)" name="gstin" register={register}/></>}
          </div></section>
        <section className="form-section"><h2 className="form-heading">02 / Get it to you</h2>
          <div className="mb-4 grid grid-cols-2 gap-2"><label className={`choice ${values.fulfillmentType === 'ship' ? 'choice-on' : ''}`}><input type="radio" value="ship" {...register('fulfillmentType')}/> Delivery</label><label className={`choice ${values.fulfillmentType === 'pickup' ? 'choice-on' : ''}`}><input type="radio" value="pickup" {...register('fulfillmentType')}/> Shop pickup</label></div>
          {values.fulfillmentType === 'ship' && <div className="form-grid"><Field label="Address line 1" name="addressLine1" register={register} required/><Field label="Address line 2" name="addressLine2" register={register}/><Field label="City" name="city" register={register} required/><Field label="District" name="district" register={register}/><label className="field-wrap"><span>State</span><select className="field" {...register('stateCode')} data-testid="select-state"><option value="27">Maharashtra</option></select></label><Field label="PIN code" name="pincode" register={register} required/></div>}
        </section>
        <section className="form-section"><h2 className="form-heading">03 / Payment preference</h2><div className="form-grid">
          <label className="field-wrap"><span>How would you like to pay?</span><select className="field" {...register('paymentMethod')} data-testid="select-payment"><option value="cod">Cash on delivery</option><option value="manual_upi">UPI after confirmation</option><option value="cash_pickup">Cash at shop pickup</option></select></label>
          <label className="field-wrap sm:col-span-2"><span>Anything the counter should know?</span><textarea className="field min-h-20" {...register('customerNote')} data-testid="input-customer-note" placeholder="Landmark, preferred call time, or special instructions"/></label>
        </div></section>
        {formError && <div className="border border-[#dfb7a9] bg-[#fbefea] p-3 text-sm text-[#7b3022]" role="alert" data-testid="status-checkout-error">{formError}</div>}
        <div className="flex flex-col gap-3 sm:flex-row"><button type="button" className="btn-outline" onClick={form.handleSubmit(onQuote)} disabled={quote.isPending} data-testid="button-get-quote">{quote.isPending ? 'Checking price…' : 'Check updated total'}</button><button className="btn-primary flex-1 justify-center" disabled={order.isPending || quote.isPending} data-testid="button-place-order">{order.isPending ? 'Sending order…' : 'Place order request'} <ArrowRight size={16}/></button></div>
      </form></Form>
      <aside className="h-fit border border-[#d9d2c3] bg-[#f7f3e9] p-5 lg:sticky lg:top-28"><h2 className="form-heading">Your order</h2><div className="mt-4 space-y-3">{cart.map(line => <div key={line.variantId} className="flex justify-between gap-3 text-sm"><span className="text-[#596266]">{line.product.name}<small className="block text-xs">{line.variant.label} × {line.quantity}</small></span><b className="mono whitespace-nowrap">{money(line.variant.retailPricePaise * line.quantity)}</b></div>)}</div>
        <div className="my-4 border-t border-[#d9d2c3] pt-4">{quote.data ? <><SummaryRow title="Parts" amount={quote.data.subtotalPaise}/><SummaryRow title="Shipping" amount={quote.data.shippingPaise}/><SummaryRow title="Tax" amount={quote.data.taxPaise}/><SummaryRow title="Total" amount={quote.data.totalPaise} bold/></> : <><div className="flex justify-between text-sm"><span>Items subtotal</span><b className="mono">{money(cart.reduce((s,l)=>s+l.variant.retailPricePaise*l.quantity,0))}</b></div><p className="mt-2 text-xs leading-5 text-[#727879]">Use “Check updated total” to validate current prices, tax and delivery.</p></>}</div>
        <p className="flex gap-2 text-xs leading-5 text-[#577174]"><ShieldCheck size={16} className="shrink-0"/> No payment is taken here. The shop confirms the order first.</p>
      </aside>
    </div>
  </main>;
}

function Field({ label, name, register, required = false, type = 'text' }: { label: string; name: keyof CheckoutFields; register: ReturnType<typeof useForm<CheckoutFields>>['register']; required?: boolean; type?: string }) {
  return <label className="field-wrap"><span>{label}{required && <em> *</em>}</span><input className="field" type={type} {...register(name, required ? { required: `${label} is required` } : {})} data-testid={`input-${name}`}/></label>;
}
function SummaryRow({ title, amount, bold = false }: { title: string; amount: number; bold?: boolean }) {
  return <div className={`mb-2 flex justify-between text-sm ${bold ? 'border-t border-[#d9d2c3] pt-3 font-bold' : ''}`}><span>{title}</span><b className="mono">{money(amount)}</b></div>;
}

function RepairPage() {
  const form = useForm<Record<string, string>>({ defaultValues: { serviceType: 'hardware' } });
  const repair = useCreateRepairRequest();
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const submit = async (values: Record<string, string>) => {
    setError('');
    try {
      const result = await repair.mutateAsync({ data: {
        customerName: values.customerName || '', phone: values.phone || '', email: values.email || null,
        deviceType: values.deviceType || '', brand: values.brand || null, model: values.model || null,
        serviceType: values.serviceType as 'hardware' | 'software' | 'other',
        issueDescription: values.issueDescription || '', preferredDate: values.preferredDate || null,
      } });
      setReceipt(result.requestNumber);
    } catch { setError('We couldn’t send the repair request. Please check your details and try again.'); }
  };
  return <main className="page-wrap">
    <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]">
      <div><div className="eyebrow"><span className="eyebrow-line"/> THE REPAIR BENCH</div><h1 className="display mt-3 text-6xl font-bold uppercase leading-[.87]">A careful<br/>look before<br/><span className="text-[#d9650d]">a new phone.</span></h1><p className="mt-6 max-w-md text-sm leading-7 text-[#596266]">Screen trouble, a stubborn charging port, software behaving badly? Tell the technician what’s happening. We’ll call to confirm a bench check and next steps.</p>
        <div className="mt-7 space-y-4 border-t border-[#d9d2c3] pt-5 text-sm"><p className="flex gap-3"><Wrench className="text-[#1f6668]" size={18}/><span><b>Work starts with a diagnosis.</b><small className="mt-1 block text-[#727879]">No repair or charge without your go-ahead.</small></span></p><p className="flex gap-3"><Clock3 className="text-[#1f6668]" size={18}/><span><b>We’ll call you back.</b><small className="mt-1 block text-[#727879]">A request is not a confirmed appointment.</small></span></p></div>
      </div>
      <div className="border border-[#d9d2c3] bg-[#fbf9f2] p-5 sm:p-8">
        {receipt ? <div className="py-8 text-center"><span className="receipt-check"><Check size={26}/></span><h2 className="display mt-5 text-4xl font-bold uppercase">Request received.</h2><p className="mt-2 text-sm text-[#657072]">We’ll call you to talk it through.</p><div className="mono mt-5 text-xl" data-testid="text-repair-number">{receipt}</div><button className="btn-outline mt-6" onClick={() => { setReceipt(''); form.reset(); }} data-testid="button-new-repair">Send another request</button></div> :
        <><div className="mono text-[10px] uppercase tracking-widest text-[#577174]">Tell us what needs attention</div><h2 className="display mt-1 text-3xl font-bold uppercase">Repair request</h2>
          <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="mt-6 space-y-4">
            <div className="form-grid"><label className="field-wrap"><span>Your name *</span><input className="field" required {...form.register('customerName')} data-testid="input-repair-name"/></label><label className="field-wrap"><span>Mobile number *</span><input className="field" required type="tel" {...form.register('phone')} data-testid="input-repair-phone"/></label><label className="field-wrap"><span>Email (optional)</span><input className="field" type="email" {...form.register('email')} data-testid="input-repair-email"/></label><label className="field-wrap"><span>Device type *</span><input className="field" required placeholder="Phone, tablet…" {...form.register('deviceType')} data-testid="input-device-type"/></label><label className="field-wrap"><span>Brand</span><input className="field" {...form.register('brand')} data-testid="input-device-brand"/></label><label className="field-wrap"><span>Model</span><input className="field" {...form.register('model')} data-testid="input-device-model"/></label>
              <label className="field-wrap"><span>Type of service</span><select className="field" {...form.register('serviceType')} data-testid="select-service-type"><option value="hardware">Hardware</option><option value="software">Software</option><option value="other">Not sure / other</option></select></label><label className="field-wrap"><span>Preferred date</span><input className="field" type="date" {...form.register('preferredDate')} data-testid="input-preferred-date"/></label>
              <label className="field-wrap sm:col-span-2"><span>What’s going wrong? *</span><textarea className="field min-h-28" minLength={8} required placeholder="What happened, and when did you first notice it?" {...form.register('issueDescription')} data-testid="input-repair-issue"/></label>
            </div>
            {error && <p className="text-sm text-[#8b3023]" role="alert" data-testid="status-repair-error">{error}</p>}<button className="btn-primary w-full justify-center" disabled={repair.isPending} data-testid="button-submit-repair">{repair.isPending ? 'Sending request…' : 'Send repair request'} <ArrowRight size={16}/></button>
          </form></Form></>}
      </div>
    </div>
  </main>;
}

function BusinessPage() {
  const form = useForm();
  const application = useCreateBusinessApplication();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async (v: Record<string, string>) => {
    setError('');
    try { await application.mutateAsync({ data: { contactName: v.contactName || '', phone: v.phone || '', email: v.email || null, businessName: v.businessName || '', gstin: v.gstin || null, note: v.note || null } }); setSent(true); }
    catch { setError('We could not send the application. Please try again or call the shop.'); }
  };
  return <main className="page-wrap">
    <div className="grid gap-10 lg:grid-cols-[1fr_.9fr]">
      <div><div className="eyebrow"><span className="eyebrow-line"/> FOR THE TRADE</div><h1 className="display mt-3 text-6xl font-bold uppercase leading-[.86]">Stock your<br/>shelf, not<br/><span className="text-[#d9650d]">your worries.</span></h1><p className="mt-6 max-w-lg text-sm leading-7 text-[#596266]">Electricians, repair counters and neighborhood retailers are welcome. Tell us about your business and we’ll review an account for eligible wholesale pricing.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="feature-box"><span className="feature-index">01</span><b>Trade prices</b><p>Prices become available once the shop approves your account.</p></div><div className="feature-box"><span className="feature-index">02</span><b>Useful quantities</b><p>Order the practical amount for your next job or restock.</p></div><div className="feature-box sm:col-span-2"><span className="feature-index">03</span><b>One local point of contact</b><p>Questions about stock or delivery? Talk directly with our counter.</p></div></div>
      </div>
      <div className="border border-[#d9d2c3] bg-[#fbf9f2] p-5 sm:p-8">
        {sent ? <div className="py-10 text-center"><span className="receipt-check"><Check size={26}/></span><h2 className="display mt-5 text-4xl font-bold uppercase">We’ll review it.</h2><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#657072]">Your business application is with the shop. We’ll reach out on the number you shared.</p><button className="btn-outline mt-6" onClick={() => { setSent(false); form.reset(); }} data-testid="button-new-application">Submit another application</button></div> :
        <><div className="mono text-[10px] uppercase tracking-widest text-[#577174]">Wholesale account request</div><h2 className="display mt-1 text-3xl font-bold uppercase">Let’s talk trade.</h2><Form {...form}><form onSubmit={form.handleSubmit(submit)} className="mt-6 space-y-4"><div className="form-grid">
          <label className="field-wrap"><span>Contact name *</span><input required className="field" {...form.register('contactName')} data-testid="input-business-contact"/></label><label className="field-wrap"><span>Business name *</span><input required className="field" {...form.register('businessName')} data-testid="input-business-name"/></label><label className="field-wrap"><span>Mobile number *</span><input required type="tel" className="field" {...form.register('phone')} data-testid="input-business-phone"/></label><label className="field-wrap"><span>Email (optional)</span><input type="email" className="field" {...form.register('email')} data-testid="input-business-email"/></label><label className="field-wrap sm:col-span-2"><span>GSTIN (optional)</span><input maxLength={15} className="field" {...form.register('gstin')} data-testid="input-business-gstin"/></label><label className="field-wrap sm:col-span-2"><span>What do you stock or work on?</span><textarea className="field min-h-24" {...form.register('note')} data-testid="input-business-note"/></label>
        </div>{error && <p className="text-sm text-[#8b3023]" role="alert" data-testid="status-business-error">{error}</p>}<button className="btn-primary w-full justify-center" disabled={application.isPending} data-testid="button-submit-business">{application.isPending ? 'Sending application…' : 'Request wholesale access'} <ArrowRight size={16}/></button><p className="text-center text-[11px] leading-5 text-[#727879]">Applications are reviewed by the shop. Submitting does not activate wholesale pricing.</p></form></Form></>}
      </div>
    </div>
  </main>;
}

function ProtectedAdmin({ retry }: { retry: () => void }) {
  return <div className="mx-auto max-w-2xl border border-[#ddc38e] bg-[#fff8e6] p-6 sm:p-8" role="alert" data-testid="status-admin-protected">
    <div className="flex h-11 w-11 items-center justify-center bg-[#e97917] text-white"><ShieldCheck size={22}/></div><div className="mono mt-5 text-[10px] uppercase tracking-[.16em] text-[#8a5e19]">Owner access protected</div><h2 className="display mt-2 text-4xl font-bold uppercase">Cloudflare Access setup needed.</h2><p className="mt-3 text-sm leading-6 text-[#5d5a4f]">Protect the production hostname with an owner-only Cloudflare Access policy, then set the Worker’s Access team domain and application audience. This preview is not connected to that Access application, so no private sales or stock data is shown.</p><button className="btn-outline mt-5" onClick={retry} data-testid="button-admin-retry">Check access again <ArrowRight size={15}/></button>
  </div>;
}

function AdminPage() {
  const client = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'orders' | 'inventory' | 'repairs' | 'business' | 'sales' | 'alerts'>('overview');
  const [stockSearch, setStockSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const overview = useGetAdminOverview({ query: { queryKey: getGetAdminOverviewQueryKey(), retry: false } });
  const orders = useListAdminOrders({ page: 1 }, { query: { queryKey: getListAdminOrdersQueryKey({ page: 1 }), retry: false } });
  const inventory = useListAdminInventory(
    { search: stockSearch || undefined, lowStockOnly: lowOnly || undefined },
    { query: { queryKey: getListAdminInventoryQueryKey({ search: stockSearch || undefined, lowStockOnly: lowOnly || undefined }), retry: false } },
  );
  const repairs = useListAdminRepairs({ query: { queryKey: getListAdminRepairsQueryKey(), retry: false } });
  const sales = useGetAdminSales({ query: { queryKey: getGetAdminSalesQueryKey(), retry: false } });
  const notifications = useListAdminNotifications({ query: { queryKey: getListAdminNotificationsQueryKey(), retry: false } });
  const businessApplications = useListBusinessApplications({ query: { queryKey: getListBusinessApplicationsQueryKey(), retry: false } });
  const updateOrder = useUpdateOrderStatus();
  const adjust = useCreateInventoryAdjustment();
  const receive = useCreateInventoryReceipt();
  const updatePayment = useUpdateOrderPaymentStatus();
  const updateRepair = useUpdateRepairStatus();
  const updateBusiness = useUpdateBusinessApplicationStatus();
  const markRead = useMarkAdminNotificationRead();
  const protectedFailure = [overview, orders, inventory, repairs, sales, notifications, businessApplications].some(q => q.isError);
  const refreshAdmin = () => {
    void client.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
    void client.invalidateQueries({ queryKey: getListAdminOrdersQueryKey({ page: 1 }) });
    void client.invalidateQueries({ queryKey: getListAdminInventoryQueryKey() });
    void client.invalidateQueries({ queryKey: getListAdminRepairsQueryKey() });
    void client.invalidateQueries({ queryKey: getGetAdminSalesQueryKey() });
    void client.invalidateQueries({ queryKey: getListAdminNotificationsQueryKey() });
    void client.invalidateQueries({ queryKey: getListBusinessApplicationsQueryKey() });
  };
  const tabs = [{ id: 'overview', label: 'Overview' }, { id: 'orders', label: 'Orders' }, { id: 'inventory', label: 'Inventory' }, { id: 'repairs', label: 'Repairs' }, { id: 'business', label: 'Wholesale applications' }, { id: 'sales', label: 'Sales' }, { id: 'alerts', label: `Alerts${notifications.data?.unreadCount ? ` · ${notifications.data.unreadCount}` : ''}` }] as const;
  return <main className="min-h-[72vh] bg-[#f3efe5]">
    <div className="border-b border-[#d9d2c3] bg-[#202631] text-[#f5f0e4]"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-4 py-7 sm:flex-row sm:items-center"><div><div className="mono text-[10px] uppercase tracking-[.18em] text-[#e97917]">JV ELECTRIC WORKS / OWNER DESK</div><h1 className="display mt-1 text-4xl font-bold uppercase">The counter, in view.</h1></div><div className="flex items-center gap-2 text-xs text-white/65"><span className="h-2 w-2 rounded-full bg-[#e97917]"/> PRIVATE SHOP OPERATIONS</div></div></div>
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[#d9d2c3]" role="tablist">{tabs.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`admin-tab ${tab === item.id ? 'admin-tab-active' : ''}`} role="tab" aria-selected={tab === item.id} data-testid={`tab-admin-${item.id}`}>{item.label}</button>)}</div>
      {protectedFailure ? <ProtectedAdmin retry={refreshAdmin}/> :
        <>{[overview, orders, inventory, repairs, sales, notifications, businessApplications].some(q => q.isLoading) && !overview.data ? <LoadingBlock label="Opening the owner counter"/> :
          <>
          {tab === 'overview' && <div className="reveal">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Sales today" value={money(overview.data?.todayRevenuePaise)} icon={<ArrowDownRight size={18}/>} note="Confirmed shop revenue"/>
              <Metric label="This month" value={money(overview.data?.monthRevenuePaise)} icon={<Store size={18}/>} note="Month to date"/>
              <Metric label="Orders to work" value={`${overview.data?.pendingOrders ?? 0}`} icon={<ClipboardList size={18}/>} note="Waiting for next step"/>
              <Metric label="Stock to check" value={`${overview.data?.lowStockCount ?? 0}`} icon={<Box size={18}/>} note="At or below low-stock line"/>
            </div>
            <div className="mt-7 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
              <section className="admin-panel"><PanelTitle title="Recent orders" kicker="ORDER BOOK" action={<button className="text-xs font-semibold text-[#1f6668]" onClick={() => setTab('orders')} data-testid="button-view-orders">All orders <ArrowRight size={14} className="inline"/></button>}/><OrdersTable rows={overview.data?.recentOrders || []} loading={overview.isLoading} onStatus={(orderNumber, status) => updateOrder.mutate({ orderNumber, data: { status } }, { onSuccess: () => refreshAdmin() })} onPayment={(orderNumber, paymentStatus) => updatePayment.mutate({ orderNumber, data: { paymentStatus } }, { onSuccess: () => refreshAdmin() })}/></section>
              <section className="admin-panel"><PanelTitle title="Keep an eye on" kicker="AT A GLANCE"/><div className="mt-4 space-y-3"><button onClick={() => setTab('inventory')} className="alert-row" data-testid="button-review-stock"><span className="alert-mark"><Box size={17}/></span><span><b>{overview.data?.lowStockCount ?? 0} low stock lines</b><small>Review available quantities</small></span><ArrowRight size={16}/></button><button onClick={() => setTab('orders')} className="alert-row" data-testid="button-review-orders"><span className="alert-mark"><ClipboardList size={17}/></span><span><b>{overview.data?.pendingOrders ?? 0} pending orders</b><small>Move each order along</small></span><ArrowRight size={16}/></button><button onClick={() => setTab('alerts')} className="alert-row" data-testid="button-review-alerts"><span className="alert-mark"><CircleAlert size={17}/></span><span><b>{notifications.data?.unreadCount ?? 0} unread alerts</b><small>New activity from the shop</small></span><ArrowRight size={16}/></button></div></section>
            </div>
          </div>}
          {tab === 'orders' && <section className="admin-panel reveal"><PanelTitle title="Order book" kicker={`${orders.data?.total ?? 0} RECENT ORDERS`}/><OrdersTable rows={orders.data?.items || []} loading={orders.isLoading} onStatus={(orderNumber, status) => updateOrder.mutate({ orderNumber, data: { status } }, { onSuccess: () => refreshAdmin() })} onPayment={(orderNumber, paymentStatus) => updatePayment.mutate({ orderNumber, data: { paymentStatus } }, { onSuccess: () => refreshAdmin() })}/></section>}
          {tab === 'inventory' && <section className="admin-panel reveal"><PanelTitle title="Stock room" kicker="ON-HAND / RESERVED / AVAILABLE"/>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row"><label className="search-box flex-1"><Search size={16}/><input value={stockSearch} onChange={e => setStockSearch(e.target.value)} placeholder="Search SKU or item" data-testid="input-inventory-search"/></label><label className="choice !mt-0 cursor-pointer"><input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} data-testid="checkbox-low-stock"/> Low stock only</label></div>
            {inventory.isLoading ? <LoadingBlock label="Counting stock"/> : !inventory.data?.length ? <EmptyAdmin label="No stock lines match this view."/> :
              <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Item / SKU</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Low line</th><th>Adjust / receive batch</th></tr></thead><tbody>{inventory.data.map(item => <InventoryRow key={item.variantId} item={item} pending={adjust.isPending || receive.isPending} onAdjust={(quantityDelta, note) => adjust.mutate({ variantId: item.variantId, data: { quantityDelta, note } }, { onSuccess: () => refreshAdmin() })} onReceive={(batchCode, quantity, unitCostPaise, note) => receive.mutate({ variantId: item.variantId, data: { batchCode, quantity, unitCostPaise, note } }, { onSuccess: () => refreshAdmin() })}/>)}</tbody></table></div>}
          </section>}
          {tab === 'repairs' && <section className="admin-panel reveal"><PanelTitle title="Repair bench" kicker={`${repairs.data?.length ?? 0} ACTIVE REQUESTS`}/>{repairs.isLoading ? <LoadingBlock label="Checking repair queue"/> : !repairs.data?.length ? <EmptyAdmin label="No repair requests in the queue."/> :
            <div className="divide-y divide-[#e4ddce]">{repairs.data.map(r => <div key={r.id} className="flex flex-col gap-4 py-4 md:flex-row md:items-start md:justify-between" data-testid={`row-repair-${r.id}`}><div><div className="flex flex-wrap items-center gap-2"><b>{r.customerName}</b><span className="mono text-[10px] text-[#577174]">{r.requestNumber}</span><StatusTag value={r.status}/></div><p className="mt-1 text-sm">{r.brand} {r.model} · {r.deviceType} · {r.serviceType}</p><p className="mt-1 max-w-2xl text-xs leading-5 text-[#727879]">{r.issueDescription}</p><a href={`tel:${r.phone}`} className="mt-2 inline-block text-xs text-[#1f6668] underline">{r.phone}</a></div><select className="field w-full md:max-w-48" value={r.status} onChange={e => updateRepair.mutate({ id: r.id, data: { status: e.target.value as 'pending' | 'accepted' | 'in_progress' | 'ready' | 'completed' | 'cancelled' } }, { onSuccess: () => refreshAdmin() })} data-testid={`select-repair-status-${r.id}`}><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="in_progress">In progress</option><option value="ready">Ready</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>)}</div>}
          </section>}
          {tab === 'business' && <section className="admin-panel reveal"><PanelTitle title="Wholesale applications" kicker={`${businessApplications.data?.length ?? 0} APPLICATIONS TO REVIEW`}/>
            {businessApplications.isLoading ? <LoadingBlock label="Loading trade applications"/> : !businessApplications.data?.length ? <EmptyAdmin label="No wholesale applications awaiting review."/> :
              <div className="divide-y divide-[#e4ddce]">{businessApplications.data.map(app => <div key={app.id} className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between" data-testid={`row-business-application-${app.id}`}><div><div className="flex flex-wrap items-center gap-2"><b>{app.companyName}</b><StatusTag value={app.businessStatus}/></div><p className="mt-1 text-sm">{app.name} · {app.phone}{app.email ? ` · ${app.email}` : ''}</p><p className="mt-1 text-xs text-[#727879]">{app.gstin ? `GSTIN ${app.gstin} · ` : ''}Applied {new Date(app.createdAt).toLocaleDateString('en-IN')}</p></div>{app.businessStatus === 'pending' && <div className="flex gap-2"><button disabled={updateBusiness.isPending} className="btn-outline !py-2 !text-xs" onClick={() => updateBusiness.mutate({ id: app.id, data: { businessStatus: 'rejected' } }, { onSuccess: () => refreshAdmin() })} data-testid={`button-reject-business-${app.id}`}>Reject</button><button disabled={updateBusiness.isPending} className="btn-primary !py-2 !text-xs" onClick={() => updateBusiness.mutate({ id: app.id, data: { businessStatus: 'approved' } }, { onSuccess: () => refreshAdmin() })} data-testid={`button-approve-business-${app.id}`}>Approve <Check size={14}/></button></div>}</div>)}</div>}
          </section>}
          {tab === 'sales' && <section className="admin-panel reveal"><PanelTitle title="Sales ledger" kicker="DAILY / MONTH TO DATE"/>
            {sales.isLoading ? <LoadingBlock label="Adding up the ledger"/> : sales.data && <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Revenue today" value={money(sales.data.todayRevenuePaise)} icon={<ArrowDownRight size={18}/>} note={`${sales.data.todayOrders} orders`}/><Metric label="Revenue this month" value={money(sales.data.monthRevenuePaise)} icon={<Store size={18}/>} note={`${sales.data.monthOrders} orders`}/><Metric label="Orders today" value={`${sales.data.todayOrders}`} icon={<ClipboardList size={18}/>} note="Orders placed today"/><Metric label="Orders this month" value={`${sales.data.monthOrders}`} icon={<Box size={18}/>} note="Month to date"/></div><h3 className="form-heading mt-8">Best sellers · month to date</h3>{sales.data.bestSellers.length ? <div className="mt-3 divide-y divide-[#e4ddce]">{sales.data.bestSellers.map((item, idx) => <div key={`${item.productName}-${idx}`} className="flex items-center justify-between gap-4 py-3" data-testid={`row-bestseller-${idx}`}><span><b className="mr-3 mono text-xs text-[#e97917]">{String(idx+1).padStart(2,'0')}</b>{item.productName}<small className="ml-2 text-xs text-[#727879]">{item.quantitySold} sold</small></span><b className="mono text-sm">{money(item.revenuePaise)}</b></div>)}</div> : <EmptyAdmin label="No best sellers to show for this period yet."/>}</>}
          </section>}
          {tab === 'alerts' && <section className="admin-panel reveal"><PanelTitle title="Shop notifications" kicker={`${notifications.data?.unreadCount ?? 0} UNREAD`}/>{notifications.isLoading ? <LoadingBlock label="Checking shop activity"/> : !notifications.data?.items.length ? <EmptyAdmin label="No notifications yet. New shop activity will show here."/> :
            <div className="divide-y divide-[#e4ddce]">{notifications.data.items.map(n => <div className={`flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between ${n.read ? 'opacity-60' : ''}`} key={n.id} data-testid={`row-notification-${n.id}`}><div className="flex gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-[#c2bdaf]' : 'bg-[#e97917]'}`}/><div><b className="text-sm">{n.eventType.replaceAll('_', ' ')}</b><p className="mt-1 text-xs text-[#727879]">{n.entityType} · {n.entityId} · {new Date(n.createdAt).toLocaleString('en-IN')}</p></div></div>{!n.read && <button className="btn-outline self-start !py-2 !text-xs" onClick={() => markRead.mutate({ id: n.id }, { onSuccess: () => refreshAdmin() })} data-testid={`button-mark-read-${n.id}`}>Mark read</button>}</div>)}</div>}
          </section>}
          </>
        }</>}
    </div>
  </main>;
}

function Metric({ label, value, icon, note }: { label: string; value: string; icon: ReactNode; note: string }) {
  return <div className="metric-card" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-center justify-between"><span className="mono text-[9px] uppercase tracking-[.12em] text-[#657072]">{label}</span><span className="text-[#d9650d]">{icon}</span></div><strong className="display mt-3 block text-3xl font-bold text-[#202631]">{value}</strong><small className="mt-1 block text-[11px] text-[#727879]">{note}</small></div>;
}
function PanelTitle({ title, kicker, action }: { title: string; kicker: string; action?: ReactNode }) {
  return <div className="mb-4 flex items-end justify-between gap-3 border-b border-[#e4ddce] pb-3"><div><div className="mono text-[9px] uppercase tracking-[.15em] text-[#e97917]">{kicker}</div><h2 className="display mt-1 text-2xl font-bold uppercase">{title}</h2></div>{action}</div>;
}
function OrdersTable({ rows, loading, onStatus, onPayment }: { rows: { orderNumber: string; buyerName: string; buyerPhone: string; orderType: string; status: string; paymentStatus: string; totalPaise: number; createdAt: string; itemCount: number }[]; loading: boolean; onStatus: (id: string, status: 'pending' | 'processing' | 'dispatched' | 'delivered' | 'completed' | 'cancelled') => void; onPayment: (id: string, status: 'paid' | 'cod_due') => void }) {
  if (loading) return <LoadingBlock label="Loading orders"/>;
  if (!rows.length) return <EmptyAdmin label="No orders in this view yet." />;
  return <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Order / buyer</th><th>Items</th><th>Total</th><th>Status</th><th>Payment reconcile</th><th>Order update</th></tr></thead><tbody>{rows.map(row => <tr key={row.orderNumber} data-testid={`row-order-${row.orderNumber}`}><td><b className="mono text-xs">{row.orderNumber}</b><small className="mt-1 block">{row.buyerName} · {row.buyerPhone}</small><small>{new Date(row.createdAt).toLocaleDateString('en-IN')}</small></td><td>{row.itemCount}</td><td className="mono">{money(row.totalPaise)}</td><td><StatusTag value={row.status}/></td><td><div className="flex min-w-[160px] flex-col gap-1"><StatusTag value={row.paymentStatus}/>{row.paymentStatus !== 'paid' && <button className="text-left text-[11px] font-semibold text-[#1f6668] underline" onClick={() => onPayment(row.orderNumber, 'paid')} data-testid={`button-payment-paid-${row.orderNumber}`}>Record payment received</button>}{row.paymentStatus === 'paid' && <button className="text-left text-[11px] text-[#727879] underline" onClick={() => onPayment(row.orderNumber, 'cod_due')} data-testid={`button-payment-due-${row.orderNumber}`}>Reopen as due</button>}</div></td><td><select className="field min-w-[130px] !py-1.5 !text-xs" value={row.status} onChange={e => onStatus(row.orderNumber, e.target.value as 'pending' | 'processing' | 'dispatched' | 'delivered' | 'completed' | 'cancelled')} data-testid={`select-order-status-${row.orderNumber}`}><option value="pending">Pending</option><option value="processing">Processing</option><option value="dispatched">Dispatched</option><option value="delivered">Delivered</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></td></tr>)}</tbody></table></div>;
}
function StatusTag({ value }: { value: string }) {
  return <span className={`status-tag status-${value.toLowerCase().replaceAll(' ', '-')}`} data-testid={`status-${value.toLowerCase().replaceAll(' ', '-')}`}>{value.replaceAll('_', ' ')}</span>;
}
function InventoryRow({ item, pending, onAdjust, onReceive }: { item: { variantId: string; sku: string; productName: string; variantLabel: string; onHandQty: number; reservedQty: number; availableQty: number; lowStockThreshold: number; batches: number }; pending: boolean; onAdjust: (delta: number, note: string) => void; onReceive: (batchCode: string, quantity: number, unitCostPaise: number | null, note: string | null) => void }) {
  const [delta, setDelta] = useState(''); const [note, setNote] = useState('');
  const [batchCode, setBatchCode] = useState(''); const [batchQty, setBatchQty] = useState(''); const [unitCost, setUnitCost] = useState(''); const [batchNote, setBatchNote] = useState('');
  const submit = () => { const value = Number(delta); if (!Number.isInteger(value) || value === 0 || !note.trim()) return; onAdjust(value, note.trim()); setDelta(''); setNote(''); };
  const receiveBatch = () => { const qty = Number(batchQty); if (!batchCode.trim() || !Number.isInteger(qty) || qty < 1) return; onReceive(batchCode.trim(), qty, unitCost === '' ? null : Math.round(Number(unitCost) * 100), batchNote || null); setBatchCode(''); setBatchQty(''); setUnitCost(''); setBatchNote(''); };
  return <tr data-testid={`row-inventory-${item.variantId}`}><td><b>{item.productName}</b><small className="mt-1 block">{item.variantLabel} · {item.sku}</small><small>{item.batches} batch{item.batches === 1 ? '' : 'es'}</small></td><td>{item.onHandQty}</td><td>{item.reservedQty}</td><td><b className={item.availableQty <= item.lowStockThreshold ? 'text-[#a74628]' : ''}>{item.availableQty}</b></td><td>{item.lowStockThreshold}</td><td><div className="grid min-w-[310px] gap-2"><div className="flex gap-1"><input className="field !w-16 !py-1.5 text-xs" type="number" value={delta} onChange={e => setDelta(e.target.value)} placeholder="+/-" aria-label={`Stock adjustment quantity for ${item.productName}`} data-testid={`input-adjust-qty-${item.variantId}`}/><input className="field !min-w-24 !py-1.5 text-xs" value={note} onChange={e => setNote(e.target.value)} placeholder="Audit note" aria-label={`Stock adjustment note for ${item.productName}`} data-testid={`input-adjust-note-${item.variantId}`}/><button disabled={pending || !delta || !note.trim()} onClick={submit} className="btn-primary !px-2 !py-1.5" title="Save adjustment" data-testid={`button-adjust-${item.variantId}`}><Check size={14}/></button></div><div className="grid grid-cols-[1fr_64px_82px_auto] gap-1"><input className="field !min-w-0 !py-1.5 text-xs" value={batchCode} onChange={e => setBatchCode(e.target.value)} placeholder="Batch code" aria-label={`Batch code for ${item.productName}`} data-testid={`input-batch-code-${item.variantId}`}/><input className="field !min-w-0 !py-1.5 text-xs" type="number" min="1" value={batchQty} onChange={e => setBatchQty(e.target.value)} placeholder="Qty" aria-label={`Batch quantity for ${item.productName}`} data-testid={`input-batch-qty-${item.variantId}`}/><input className="field !min-w-0 !py-1.5 text-xs" type="number" min="0" step=".01" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="Cost ₹" aria-label={`Batch unit cost for ${item.productName}`} data-testid={`input-batch-cost-${item.variantId}`}/><button disabled={pending || !batchCode.trim() || !batchQty || Number(batchQty) < 1} onClick={receiveBatch} className="btn-outline !px-2 !py-1.5 text-[10px]" title="Receive batch" data-testid={`button-receive-batch-${item.variantId}`}><Plus size={13}/></button><input className="field col-span-4 !py-1.5 text-xs" value={batchNote} onChange={e => setBatchNote(e.target.value)} placeholder="Optional receipt note" aria-label={`Receipt note for ${item.productName}`} data-testid={`input-batch-note-${item.variantId}`}/></div></div></td></tr>;
}
function EmptyAdmin({ label }: { label: string }) { return <div className="py-12 text-center text-sm text-[#727879]"><Box size={24} className="mx-auto mb-3 text-[#1f6668]"/>{label}</div>; }

export default function StoreApp() {
  const [location] = useLocation();
  const cartState = useStoredCart();
  let page;
  if (location === '/cart') page = <CartPage cart={cartState.cart} quantity={cartState.quantity}/>;
  else if (location === '/checkout') page = <CheckoutPage cart={cartState.cart} clear={cartState.clear}/>;
  else if (location === '/repair') page = <RepairPage/>;
  else if (location === '/business') page = <BusinessPage/>;
  else if (location === '/admin') page = <AdminPage/>;
  else if (location.startsWith('/product/')) page = <ProductDetail add={cartState.add}/>;
  else page = <Storefront add={cartState.add}/>;
  return <div className="min-h-[100dvh]"><Header count={cartState.count}/>{page}<Footer/></div>;
}
