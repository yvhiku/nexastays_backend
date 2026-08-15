import {
  canonicalizeAgentCategories,
  canonicalizeAgentLanguages,
  canonicalizeRequesterLanguage,
} from './support-language';

describe('support language canonicalization', () => {
  it('snapshots only ar/fr/en primary tags', () => {
    expect(canonicalizeRequesterLanguage('fr-FR')).toBe('fr');
    expect(canonicalizeRequesterLanguage('EN')).toBe('en');
    expect(canonicalizeRequesterLanguage('ar')).toBe('ar');
    expect(canonicalizeRequesterLanguage('de')).toBeNull();
    expect(canonicalizeRequesterLanguage('')).toBeNull();
    expect(canonicalizeRequesterLanguage(null)).toBeNull();
  });

  it('dedupes mixed language spellings', () => {
    expect(canonicalizeAgentLanguages(['FR', 'fr', 'fr-FR', 'de', 'ar'])).toEqual(
      ['fr', 'ar'],
    );
  });

  it('keeps only canonical ticket categories', () => {
    expect(
      canonicalizeAgentCategories(['payment', 'KYC', 'KYC', 'UNKNOWN']),
    ).toEqual(['PAYMENT', 'KYC']);
  });
});
