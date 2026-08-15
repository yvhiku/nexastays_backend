import {
  cannedDiscoveryRank,
  interpolateCannedBody,
} from './support-canned-render';

describe('interpolateCannedBody', () => {
  const vars = {
    customer_name: 'Mohamed',
    ticket_number: 'SUP-2026-000001',
    booking_reference: 'NX-12345',
    listing_name: 'Riad Atlas',
  };

  it('replaces only the allowlisted variables', () => {
    expect(
      interpolateCannedBody(
        'Hello {{customer_name}}, booking {{booking_reference}} for {{listing_name}} ({{ticket_number}}).',
        vars,
      ),
    ).toBe(
      'Hello Mohamed, booking NX-12345 for Riad Atlas (SUP-2026-000001).',
    );
  });

  it('turns unknown tokens and object paths into empty strings', () => {
    expect(
      interpolateCannedBody(
        'x{{user.password}}y{{process.env}}z{{ticket.anything}}',
        vars,
      ),
    ).toBe('xyz');
  });
});

describe('cannedDiscoveryRank', () => {
  it('orders exact category+language before GENERAL', () => {
    const ticket = { ticketCategory: 'PAYMENT', ticketLanguage: 'fr' };
    expect(
      cannedDiscoveryRank({
        category: 'PAYMENT',
        language: 'fr',
        ...ticket,
      }),
    ).toBe(0);
    expect(
      cannedDiscoveryRank({
        category: 'PAYMENT',
        language: null,
        ...ticket,
      }),
    ).toBe(1);
    expect(
      cannedDiscoveryRank({
        category: null,
        language: 'fr',
        ...ticket,
      }),
    ).toBe(2);
    expect(
      cannedDiscoveryRank({
        category: null,
        language: null,
        ...ticket,
      }),
    ).toBe(3);
  });
});
