import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysHostProfile } from '../stays/entities/stays-host-profile.entity';
import { StaysBookingOccupant } from '../stays/entities/stays-booking-occupant.entity';

export interface ParticipantIdentity {
  userId: string;
  displayName: string;
}

@Injectable()
export class ParticipantPresentationService {
  constructor(
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
    @InjectRepository(StaysBookingOccupant)
    private readonly occupantRepo: Repository<StaysBookingOccupant>,
  ) {}

  async resolveHostDisplayName(hostUserId: string): Promise<string | null> {
    const profile = await this.hostProfileRepo.findOne({
      where: { user_id: hostUserId },
    });
    const name = profile?.full_name?.trim();
    return name && name.length > 0 ? name : null;
  }

  async resolveGuestDisplayName(bookingId: string): Promise<string | null> {
    const occupants = await this.occupantRepo.find({
      where: { booking_id: bookingId },
      order: { is_primary: 'DESC', created_at: 'ASC' },
    });
    const primary = occupants.find((o) => o.is_primary) ?? occupants[0];
    const name = primary?.full_name?.trim();
    return name && name.length > 0 ? name : null;
  }

  async resolveForBooking(
    hostUserId: string,
    bookingId: string,
  ): Promise<{ host: ParticipantIdentity; guest: ParticipantIdentity | null }> {
    const [hostName, guestName] = await Promise.all([
      this.resolveHostDisplayName(hostUserId),
      this.resolveGuestDisplayName(bookingId),
    ]);
    return {
      host: {
        userId: hostUserId,
        displayName: hostName ?? 'Host',
      },
      guest: guestName
        ? { userId: '', displayName: guestName }
        : null,
    };
  }
}
