import { nextStatusAfterCustomerMessage } from './support-ticket-state';

describe('nextStatusAfterCustomerMessage', () => {
  it('reopens RESOLVED to OPEN', () => {
    expect(
      nextStatusAfterCustomerMessage({ status: 'RESOLVED', party: 'GUEST' }),
    ).toBe('OPEN');
  });

  it('moves WAITING_FOR_CUSTOMER to IN_PROGRESS for guest or host party', () => {
    expect(
      nextStatusAfterCustomerMessage({
        status: 'WAITING_FOR_CUSTOMER',
        party: 'GUEST',
      }),
    ).toBe('IN_PROGRESS');
    expect(
      nextStatusAfterCustomerMessage({
        status: 'WAITING_FOR_CUSTOMER',
        party: 'HOST',
      }),
    ).toBe('IN_PROGRESS');
  });

  it('moves WAITING_FOR_HOST to OPEN only for HOST party', () => {
    expect(
      nextStatusAfterCustomerMessage({
        status: 'WAITING_FOR_HOST',
        party: 'HOST',
      }),
    ).toBe('OPEN');
    expect(
      nextStatusAfterCustomerMessage({
        status: 'WAITING_FOR_HOST',
        party: 'GUEST',
      }),
    ).toBe('WAITING_FOR_HOST');
  });

  it('preserves ESCALATED, OPEN, and IN_PROGRESS', () => {
    expect(
      nextStatusAfterCustomerMessage({ status: 'ESCALATED', party: 'GUEST' }),
    ).toBe('ESCALATED');
    expect(
      nextStatusAfterCustomerMessage({ status: 'OPEN', party: 'GUEST' }),
    ).toBe('OPEN');
    expect(
      nextStatusAfterCustomerMessage({ status: 'IN_PROGRESS', party: 'HOST' }),
    ).toBe('IN_PROGRESS');
  });
});
