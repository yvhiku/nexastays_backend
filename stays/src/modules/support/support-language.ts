import type { SupportTicketCategory } from './entities/stays-support-ticket.entity';

const TICKET_CATEGORIES: SupportTicketCategory[] = [
  'BOOKING',
  'PAYMENT',
  'REFUND',
  'CANCELLATION',
  'HOST',
  'GUEST',
  'LISTING',
  'KYC',
  'TECHNICAL',
  'FRAUD',
  'OTHER',
];

export const SUPPORT_ROUTING_LANGUAGES = ['ar', 'fr', 'en'] as const;
export type SupportRoutingLanguage = (typeof SUPPORT_ROUTING_LANGUAGES)[number];

export function canonicalizeRequesterLanguage(
  raw: string | null | undefined,
): SupportRoutingLanguage | null {
  if (raw == null) return null;
  const primary = String(raw).trim().toLowerCase().split(/[-_]/)[0];
  if (
    primary === 'ar' ||
    primary === 'fr' ||
    primary === 'en'
  ) {
    return primary;
  }
  return null;
}

export function canonicalizeAgentLanguages(raw: unknown): SupportRoutingLanguage[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<SupportRoutingLanguage>();
  for (const value of raw) {
    const lang = canonicalizeRequesterLanguage(String(value ?? ''));
    if (lang) seen.add(lang);
  }
  return [...seen];
}

export function canonicalizeAgentCategories(raw: unknown): SupportTicketCategory[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(TICKET_CATEGORIES);
  const seen = new Set<SupportTicketCategory>();
  for (const value of raw) {
    const category = String(value ?? '').trim().toUpperCase();
    if (allowed.has(category)) {
      seen.add(category as SupportTicketCategory);
    }
  }
  return [...seen];
}
