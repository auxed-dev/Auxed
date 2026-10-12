import { hmacHex, safeEqual } from './crypto';

/**
 * Payment providers for wallet top-ups. Choose with PAYMENT_PROVIDER:
 *   paystack - PAYSTACK_SECRET_KEY (supports ZAR; webhook signed with the same secret)
 *   stripe   - STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
 *   dev      - instantly credits the wallet; only allowed outside production
 */
export type Provider = 'paystack' | 'stripe' | 'dev';

export function activeProvider(): Provider | null {
  const p = process.env.PAYMENT_PROVIDER;
  const prod = process.env.NODE_ENV === 'production';
  if (p === 'paystack' && process.env.PAYSTACK_SECRET_KEY) return 'paystack';
  if (p === 'stripe' && process.env.STRIPE_SECRET_KEY) return 'stripe';
  if ((p === 'dev' || !p) && !prod) return 'dev';
  return null;
}

export interface CheckoutInput {
  paymentId: string;
  amountCents: number;
  email: string;
  returnUrl: string;
  cancelUrl: string;
}

export async function createCheckout(provider: Provider, input: CheckoutInput): Promise<{ redirectUrl: string; providerRef?: string }> {
  if (provider === 'paystack') {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountCents,
        currency: 'ZAR',
        reference: input.paymentId,
        callback_url: input.returnUrl,
        metadata: { paymentId: input.paymentId, cancel_action: input.cancelUrl },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.status) throw new Error(`Paystack: ${data.message ?? res.status}`);
    return { redirectUrl: data.data.authorization_url, providerRef: data.data.reference };
  }
  if (provider === 'stripe') {
    const form = new URLSearchParams({
      mode: 'payment',
      success_url: `${input.returnUrl}${input.returnUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: input.cancelUrl,
      client_reference_id: input.paymentId,
      customer_email: input.email,
      'metadata[paymentId]': input.paymentId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'zar',
      'line_items[0][price_data][unit_amount]': String(input.amountCents),
      'line_items[0][price_data][product_data][name]': 'AUXED token top-up',
    });
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Stripe: ${data.error?.message ?? res.status}`);
    return { redirectUrl: data.url, providerRef: data.id };
  }
  return { redirectUrl: input.returnUrl, providerRef: `dev_${input.paymentId}` };
}

export interface VerifiedPayment {
  paymentId: string;
  amountCents: number;
  paid: boolean;
  providerRef?: string;
}

/** Confirms a payment when the user lands back on the return URL (backup to the webhook). */
export async function verifyReturn(provider: Provider, params: Record<string, string | undefined>): Promise<VerifiedPayment | null> {
  if (provider === 'paystack') {
    const ref = params.reference || params.trxref;
    if (!ref) return null;
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const data = await res.json();
    if (!res.ok || !data.status) return null;
    return { paymentId: data.data.reference, amountCents: data.data.amount, paid: data.data.status === 'success', providerRef: String(data.data.id) };
  }
  if (provider === 'stripe') {
    const sid = params.session_id;
    if (!sid) return null;
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    if (!res.ok) return null;
    return { paymentId: data.client_reference_id, amountCents: data.amount_total, paid: data.payment_status === 'paid', providerRef: data.id };
  }
  return null;
}

/** Verifies and parses a provider webhook. Returns null for events we don't act on. */
export function verifyWebhook(provider: 'paystack' | 'stripe', raw: Buffer, headers: Record<string, string | string[] | undefined>): VerifiedPayment | null {
  if (provider === 'paystack') {
    const sig = String(headers['x-paystack-signature'] ?? '');
    const expected = hmacHex('sha512', process.env.PAYSTACK_SECRET_KEY ?? '', raw);
    if (!sig || !safeEqual(sig, expected)) throw new Error('Invalid Paystack signature');
    const evt = JSON.parse(raw.toString('utf8'));
    if (evt.event !== 'charge.success') return null;
    return { paymentId: evt.data.reference, amountCents: evt.data.amount, paid: evt.data.status === 'success', providerRef: String(evt.data.id) };
  }
  const header = String(headers['stripe-signature'] ?? '');
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = parts.t;
  const signatures = header
    .split(',')
    .filter((kv) => kv.startsWith('v1='))
    .map((kv) => kv.slice(3));
  if (!t || !signatures.length) throw new Error('Invalid Stripe signature header');
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new Error('Stale Stripe webhook');
  const expected = hmacHex('sha256', process.env.STRIPE_WEBHOOK_SECRET ?? '', `${t}.${raw.toString('utf8')}`);
  if (!signatures.some((s) => safeEqual(s, expected))) throw new Error('Invalid Stripe signature');
  const evt = JSON.parse(raw.toString('utf8'));
  if (evt.type !== 'checkout.session.completed' && evt.type !== 'checkout.session.async_payment_succeeded') return null;
  const s = evt.data.object;
  return { paymentId: s.client_reference_id, amountCents: s.amount_total, paid: s.payment_status === 'paid', providerRef: s.id };
}

export async function readRawBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  return Buffer.concat(chunks);
}
