import { eq } from 'drizzle-orm';
import { performers } from '../db/schema';
import { forbidden, requireRole, type Ctx } from './http';

/** The performer profile of the signed-in artist (created at sign-up). */
export async function requirePerformer(ctx: Ctx) {
  const user = requireRole(ctx, 'PERFORMER');
  const row = (await ctx.db.select().from(performers).where(eq(performers.userId, user.id)).limit(1))[0];
  if (!row) throw forbidden('Set up your artist profile first.');
  return { user, performer: row };
}

export function requireOwner(ctx: Ctx) {
  return requireRole(ctx, 'OWNER');
}
