import type { venues } from '../db/schema';
import { num, oneOf, safeUrl, str } from './http';

type VenueInsert = typeof venues.$inferInsert;

/** Validates venue fields from a create/update request. `partial` skips missing fields. */
export function venueInput(b: Record<string, unknown>, partial = false): Partial<VenueInsert> {
  const out: Partial<VenueInsert> = {};
  const has = (k: string) => !partial || b[k] !== undefined;
  if (has('name')) out.name = str(b.name, 'Venue name', { min: 2, max: 80 });
  if (has('kind')) out.kind = oneOf(b.kind, 'Venue type', ['CLUB', 'RESTAURANT', 'GYM', 'LOUNGE', 'FESTIVAL'] as const);
  if (has('city')) out.city = str(b.city, 'City', { min: 2, max: 60 });
  if (b.address !== undefined) out.address = str(b.address, 'Address', { optional: true, max: 160 });
  if (has('lat')) out.lat = num(b.lat, 'Latitude', { min: -90, max: 90 });
  if (has('lng')) out.lng = num(b.lng, 'Longitude', { min: -180, max: 180 });
  if (b.imageUrl !== undefined) out.imageUrl = safeUrl(b.imageUrl, 'Photo');
  if (b.logoStyle !== undefined) out.logoStyle = oneOf(b.logoStyle, 'Title style', ['wide', 'serif', 'cond'] as const);
  if (b.description !== undefined) out.description = str(b.description, 'Description', { optional: true, max: 400 });
  if (b.chatLabel !== undefined) out.chatLabel = str(b.chatLabel, 'Chat name', { min: 2, max: 30 }).toUpperCase();
  if (b.managementLabel !== undefined) out.managementLabel = str(b.managementLabel, 'Management label', { min: 2, max: 40 });
  if (b.capacity !== undefined) out.capacity = num(b.capacity, 'Capacity', { min: 0, max: 200000, int: true });
  if (b.liveCapacity !== undefined) out.liveCapacity = num(b.liveCapacity, 'Live capacity', { min: 0, max: 200000, int: true });
  if (b.avgWeek !== undefined) out.avgWeek = num(b.avgWeek, 'Average per week', { min: 0, max: 10_000_000, int: true });
  if (b.avgMonth !== undefined) out.avgMonth = num(b.avgMonth, 'Average per month', { min: 0, max: 10_000_000, int: true });
  if (b.waitMinutes !== undefined) out.waitMinutes = b.waitMinutes === null || b.waitMinutes === '' ? null : num(b.waitMinutes, 'Wait time', { min: 0, max: 600, int: true });
  if (b.safetyPhone !== undefined) {
    const phone = str(b.safetyPhone, 'Safety phone', { optional: true, max: 20 });
    out.safetyPhone = phone ? phone.replace(/[^\d+]/g, '') : null;
  }
  if (b.artistSharePct !== undefined) out.artistSharePct = num(b.artistSharePct, 'Artist share', { min: 0, max: 100, int: true });
  return out;
}
