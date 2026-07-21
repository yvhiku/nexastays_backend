import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysHostProfile } from '../stays/entities/stays-host-profile.entity';
import { StaysBookingOccupant } from '../stays/entities/stays-booking-occupant.entity';
import { IdentityUserClient } from '../../common/identity/identity-user.client';

export interface ParticipantIdentity {
  userId: string;
  displayName: string;
  verified?: boolean;
}

@Injectable()
export class ParticipantPresentationService {
  constructor(
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
    @InjectRepository(StaysBookingOccupant)
    private readonly occupantRepo: Repository<StaysBookingOccupant>,
    private readonly identityUsers: IdentityUserClient,
  ) {}

  async resolveHostDisplayName(hostUserId: string): Promise<string | null> {
    const profile = await this.hostProfileRepo.findOne({
      where: { user_id: hostUserId },
    });
    const fromProfile = profile?.full_name?.trim();
    if (fromProfile) return fromProfile;
    return this.identityUsers.getDisplayName(hostUserId);
  }

  async resolveGuestDisplayName(
    bookingId: string,
    guestUserId?: string | null,
  ): Promise<string | null> {
    const occupants = await this.occupantRepo.find({
      where: { booking_id: bookingId },
      order: { is_primary: 'DESC', created_at: 'ASC' },
    });
    const primary = occupants.find((o) => o.is_primary) ?? occupants[0];
    const fromOccupant = primary?.full_name?.trim();
    if (fromOccupant) return fromOccupant;
    if (guestUserId) return this.identityUsers.getDisplayName(guestUserId);
    return null;
  }

  async resolveCounterpartIdentity(
    hostUserId: string,
    guestUserId: string | null,
    bookingId: string | null,
    viewerIsGuest: boolean,
  ): Promise<ParticipantIdentity> {
    if (viewerIsGuest) {
      const displayName =
        (await this.resolveHostDisplayName(hostUserId)) ??
        (bookingId ? 'Your host' : 'Host');
      return { userId: hostUserId, displayName };
    }

    const displayName =
      (guestUserId && bookingId
        ? await this.resolveGuestDisplayName(bookingId, guestUserId)
        : bookingId
          ? await this.resolveGuestDisplayName(bookingId)
          : guestUserId
            ? await this.identityUsers.getDisplayName(guestUserId)
            : null) ?? 'Guest';

    return { userId: guestUserId ?? '', displayName };
  }

  async resolveForBooking(
    hostUserId: string,
    bookingId: string,
    guestUserId?: string | null,
  ): Promise<{ host: ParticipantIdentity; guest: ParticipantIdentity | null }> {
    const [hostName, guestName] = await Promise.all([
      this.resolveHostDisplayName(hostUserId),
      this.resolveGuestDisplayName(bookingId, guestUserId),
    ]);
    return {
      host: {
        userId: hostUserId,
        displayName: hostName ?? 'Your host',
      },
      guest: guestName
        ? { userId: guestUserId ?? '', displayName: guestName }
        : null,
    };
  }
}
