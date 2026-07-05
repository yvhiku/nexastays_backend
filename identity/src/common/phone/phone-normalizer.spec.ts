import {
  DEFAULT_COUNTRY_CODE,
  normalizePhoneNumber,
  normalizePhoneOrThrow,
  tryNormalizePhoneNumber,
  validatePhoneNumber,
} from './phone-normalizer';

describe('phone-normalizer', () => {
  describe('Morocco formats', () => {
    it('normalizes 0612345678 to +212612345678', () => {
      expect(normalizePhoneNumber('0612345678')).toBe('+212612345678');
      expect(normalizePhoneOrThrow('0612345678')).toBe('+212612345678');
    });

    it('normalizes 612345678 to +212612345678', () => {
      expect(normalizePhoneNumber('612345678')).toBe('+212612345678');
      expect(normalizePhoneOrThrow('612345678')).toBe('+212612345678');
    });

    it('normalizes 212612345678 to +212612345678', () => {
      expect(normalizePhoneNumber('212612345678')).toBe('+212612345678');
      expect(normalizePhoneOrThrow('212612345678')).toBe('+212612345678');
    });

    it('normalizes +212612345678 (already E.164)', () => {
      expect(normalizePhoneNumber('+212612345678')).toBe('+212612345678');
      expect(normalizePhoneOrThrow('+212 612 34 56 78')).toBe('+212612345678');
    });

    it('handles spaces and dashes in Morocco numbers', () => {
      expect(normalizePhoneNumber('06 12 34 56 78')).toBe('+212612345678');
      expect(normalizePhoneNumber('06-12-34-56-78')).toBe('+212612345678');
    });

    it('strips national trunk 0 after +212 (+2120612345678 → +212612345678)', () => {
      expect(normalizePhoneNumber('+2120612345678')).toBe('+212612345678');
      expect(normalizePhoneNumber('2120612345678')).toBe('+212612345678');
      expect(normalizePhoneOrThrow('+212 06 12 34 56 78')).toBe('+212612345678');
    });
  });

  describe('international formats', () => {
    it('accepts US number with country code', () => {
      expect(normalizePhoneNumber('+12025551234')).toBe('+12025551234');
    });

    it('accepts French number', () => {
      expect(normalizePhoneNumber('+33612345678')).toBe('+33612345678');
    });

    it('accepts UK number', () => {
      expect(normalizePhoneNumber('+447911123456')).toBe('+447911123456');
    });
  });

  describe('validation', () => {
    it('rejects empty input', () => {
      const r = validatePhoneNumber('');
      expect(r.valid).toBe(false);
      expect(r.error).toContain('required');
    });

    it('rejects too few digits', () => {
      const r = validatePhoneNumber('61234');
      expect(r.valid).toBe(false);
      expect(r.error).toContain('too few');
    });

    it('rejects too many digits', () => {
      const r = validatePhoneNumber('+2126123456789012');
      expect(r.valid).toBe(false);
      expect(r.error).toContain('too many');
    });

    it('rejects ambiguous values (leading zeros only)', () => {
      const r = validatePhoneNumber('0000000000');
      expect(r.valid).toBe(false);
      expect(r.error).toContain('invalid or ambiguous');
    });

    it('rejects too short ambiguous', () => {
      const r = validatePhoneNumber('0123');
      expect(r.valid).toBe(false);
    });
  });

  describe('tryNormalizePhoneNumber', () => {
    it('returns normalized string for valid input', () => {
      expect(tryNormalizePhoneNumber('0612345678')).toBe('+212612345678');
    });

    it('returns null for invalid input', () => {
      expect(tryNormalizePhoneNumber('')).toBe(null);
      expect(tryNormalizePhoneNumber('123')).toBe(null);
    });
  });

  describe('normalizePhoneOrThrow', () => {
    it('throws BadRequestException for invalid input', () => {
      expect(() => normalizePhoneOrThrow('')).toThrow();
      expect(() => normalizePhoneOrThrow('abc')).toThrow();
    });
  });

  describe('DEFAULT_COUNTRY_CODE', () => {
    it('is 212 for Morocco', () => {
      expect(DEFAULT_COUNTRY_CODE).toBe('212');
    });
  });
});
