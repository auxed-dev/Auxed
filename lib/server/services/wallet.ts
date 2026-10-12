import { and, eq, gte, sql } from 'drizzle-orm';
import type { DB, Tx } from '../../db';
import { ledger, payments, users } from '../../db/schema';
import { newId } from '../crypto';
import { HttpError } from '../http';

type Conn = DB | Tx;

/** Atomically debits the wallet; fails if the balance is too low. */
export async function debit(conn: Conn, userId: string, amountCents: number, note: string, requestId?: string) {
  const updated = await conn
    .update(users)
    .set({ walletCents: sql`${users.walletCents} - ${amountCents}` })
    .where(and(eq(users.id, userId), gte(users.walletCents, amountCents)))
    .returning({ walletCents: users.walletCents });
  if (!updated.length) {
    throw new HttpError(402, 'Not enough tokens in your wallet. Top up to make this request.', 'INSUFFICIENT_FUNDS');
  }
  await conn.insert(ledger).values({ id: newId(), userId, type: 'REQUEST', amountCents: -amountCents, note, requestId });
  return updated[0].walletCents;
}

export async function credit(
  conn: Conn,
  userId: string,
  amountCents: number,
  type: 'TOPUP' | 'REFUND' | 'ADJUSTMENT',
  note: string,
  refs: { requestId?: string; paymentId?: string } = {},
) {
  const updated = await conn
    .update(users)
    .set({ walletCents: sql`${users.walletCents} + ${amountCents}` })
    .where(eq(users.id, userId))
    .returning({ walletCents: users.walletCents });
  await conn.insert(ledger).values({ id: newId(), userId, type, amountCents, note, ...refs });
  return updated[0]?.walletCents ?? 0;
}

/**
 * Marks a pending payment as paid and credits the wallet exactly once, however many times the
 * provider retries the webhook or the user refreshes the return page.
 */
export async function settlePayment(db: DB, paymentId: string, paidAmountCents: number, providerRef?: string) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(payments)
      .set({ status: 'PAID', completedAt: new Date(), ...(providerRef ? { providerRef } : {}) })
      .where(and(eq(payments.id, paymentId), eq(payments.status, 'PENDING')))
      .returning();
    const p = rows[0];
    if (!p) return false; // already settled or unknown
    if (paidAmountCents !== p.amountCents) {
      console.warn(`[payments] amount mismatch for ${paymentId}: expected ${p.amountCents}, got ${paidAmountCents}`);
    }
    await credit(tx, p.userId, Math.min(paidAmountCents, p.amountCents), 'TOPUP', 'Token wallet top-up', { paymentId: p.id });
    return true;
  });
}

export async function failPayment(db: DB, paymentId: string) {
  await db
    .update(payments)
    .set({ status: 'FAILED', completedAt: new Date() })
    .where(and(eq(payments.id, paymentId), eq(payments.status, 'PENDING')));
}
