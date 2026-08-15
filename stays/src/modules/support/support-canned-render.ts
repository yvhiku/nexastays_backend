export const CANNED_REPLY_VARIABLES = [
  'customer_name',
  'ticket_number',
  'booking_reference',
  'listing_name',
] as const;

export type CannedReplyVariable = (typeof CANNED_REPLY_VARIABLES)[number];

const ALLOWLIST = new Set<string>(CANNED_REPLY_VARIABLES);

export type CannedReplyVars = Record<CannedReplyVariable, string>;

/** Unknown {{tokens}} become empty. Never evaluates paths or expressions. */
export function interpolateCannedBody(
  body: string,
  vars: CannedReplyVars,
): string {
  return body.replace(/\{\{([^}]+)\}\}/g, (_, raw: string) => {
    const key = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (!ALLOWLIST.has(key)) return '';
    return vars[key as CannedReplyVariable] ?? '';
  });
}

export function cannedDiscoveryRank(input: {
  category: string | null;
  language: string | null;
  ticketCategory: string | null;
  ticketLanguage: string | null;
}): number {
  const cat = input.category;
  const lang = input.language;
  const exactCat = Boolean(cat && cat === input.ticketCategory);
  const exactLang = Boolean(lang && lang === input.ticketLanguage);
  const generalCat = cat == null;
  const generalLang = lang == null;
  if (exactCat && exactLang) return 0;
  if (exactCat && generalLang) return 1;
  if (generalCat && exactLang) return 2;
  if (generalCat && generalLang) return 3;
  return 4;
}
