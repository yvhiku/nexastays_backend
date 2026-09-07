import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

/**
 * Gate 3 / original 043–045, 048 — booking read/cancel ownership.
 * Mirrors StaysService.getBookingById + StaysCancellationService.cancel
 * party checks (guest_user_id OR listing.host_user_id).
 */
describe('BOLA — booking ownership contract', () => {
  const actors = {
    guestA: 'guest-a',
    guestB: 'guest-b',
    hostA: 'host-a',
    hostB: 'host-b',
  } as const;

  type BookingRow = {
    id: string;
    guest_user_id: string;
    status: string;
    listing: { host_user_id: string };
  };

  function assertBookingViewer(booking: BookingRow | null, userId: string) {
    if (!booking) throw new NotFoundException('Booking not found');
    const isGuest = booking.guest_user_id === userId;
    const isHost = !isGuest && booking.listing?.host_user_id === userId;
    if (!isGuest && !isHost) {
      throw new NotFoundException('Booking not found');
    }
    return { isGuest, isHost };
  }

  function assertCancelParty(
    booking: BookingRow | null,
    userId: string,
    cancelledBy: 'guest' | 'host',
  ) {
    if (!booking) throw new NotFoundException('Booking not found');
    const isGuest = booking.guest_user_id === userId;
    const isHost = booking.listing?.host_user_id === userId;
    if (!isGuest && !isHost) {
      throw new NotFoundException('Booking not found');
    }
    if (cancelledBy === 'guest' && !isGuest) {
      throw new BadRequestException('Only the guest can cancel as guest');
    }
    if (cancelledBy === 'host' && !isHost) {
      throw new BadRequestException('Only the host can cancel as host');
    }
    return booking;
  }

  const bookingOnHostA: BookingRow = {
    id: 'booking-a',
    guest_user_id: actors.guestA,
    status: 'CONFIRMED',
    listing: { host_user_id: actors.hostA },
  };

  it('guest A can read own booking; guest B cannot (404)', () => {
    expect(() => assertBookingViewer(bookingOnHostA, actors.guestA)).not.toThrow();
    expect(() => assertBookingViewer(bookingOnHostA, actors.guestB)).toThrow(
      NotFoundException,
    );
  });

  it('host A can read booking on own listing; host B cannot (404)', () => {
    expect(() => assertBookingViewer(bookingOnHostA, actors.hostA)).not.toThrow();
    expect(() => assertBookingViewer(bookingOnHostA, actors.hostB)).toThrow(
      NotFoundException,
    );
  });

  it('host B cannot cancel host A booking as host — no party match → 404', () => {
    expect(() =>
      assertCancelParty(bookingOnHostA, actors.hostB, 'host'),
    ).toThrow(NotFoundException);
  });

  it('guest B cannot cancel guest A booking as guest — no party match → 404', () => {
    expect(() =>
      assertCancelParty(bookingOnHostA, actors.guestB, 'guest'),
    ).toThrow(NotFoundException);
  });

  it('host A cannot cancel as guest even when listing owner', () => {
    expect(() =>
      assertCancelParty(bookingOnHostA, actors.hostA, 'guest'),
    ).toThrow(BadRequestException);
  });

  it('guest A can cancel as guest; host A can cancel as host', () => {
    expect(
      assertCancelParty(bookingOnHostA, actors.guestA, 'guest').id,
    ).toBe('booking-a');
    expect(
      assertCancelParty(bookingOnHostA, actors.hostA, 'host').id,
    ).toBe('booking-a');
  });

  it('ID guess for missing booking is 404 (same as foreign)', () => {
    expect(() =>
      assertBookingViewer(null, actors.guestA),
    ).toThrow(NotFoundException);
  });
});
