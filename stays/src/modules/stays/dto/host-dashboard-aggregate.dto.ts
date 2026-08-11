import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Response shape for GET /stays/host/dashboard (H3). */

export class HostDashboardTodayDto {
  @ApiProperty() checkins_today: number;
  @ApiProperty() checkouts_today: number;
  @ApiProperty() checkouts_tomorrow: number;
  @ApiProperty() currently_staying: number;
  @ApiProperty() new_bookings_today: number;
  @ApiProperty() awaiting_guest_payment: number;
}

export class HostDashboardMonthEarningsDto {
  @ApiProperty() gross_revenue: number;
  @ApiProperty() net_host_earnings: number;
  @ApiProperty() platform_fees: number;
  @ApiPropertyOptional({ nullable: true, type: Number })
  mom_pct?: number | null;
}

export class HostDashboardEarningsDto {
  @ApiProperty() gross_revenue_all_time: number;
  @ApiProperty() net_host_earnings_all_time: number;
  @ApiProperty() platform_fees_all_time: number;
  @ApiProperty({ type: HostDashboardMonthEarningsDto })
  this_month: HostDashboardMonthEarningsDto;
  @ApiProperty({ type: HostDashboardMonthEarningsDto })
  previous_month: Omit<HostDashboardMonthEarningsDto, 'mom_pct'>;
  @ApiProperty() upcoming_revenue_30d: number;
}

export class HostDashboardPayoutsDto {
  @ApiProperty({ example: 'mock' }) provider: string;
  @ApiProperty({ example: 'dogfood' }) mode: string;
  @ApiProperty() pending: number;
  @ApiProperty({ description: 'Always 0 until wallet settlement exists' })
  available: number;
  @ApiProperty({
    description: 'Sum of SETTLED HOST_PAYOUT ledger rows (typically 0 today)',
  })
  paid_out: number;
  @ApiProperty({ example: 'MAD' }) currency: string;
  @ApiProperty() disclaimer: string;
}

export class HostDashboardOperationsDto {
  @ApiProperty() upcoming_checkins: number;
  @ApiPropertyOptional({ nullable: true, type: String })
  next_checkin_date: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  next_guest_name: string | null;
}

export class HostDashboardInventoryDto {
  @ApiProperty() live_listings: number;
  @ApiProperty() pending_listings: number;
  @ApiProperty() total_listings: number;
  @ApiProperty() occupancy_pct_this_month: number;
  @ApiProperty({
    enum: ['BOOKED_OVER_CAPACITY_V1'],
    example: 'BOOKED_OVER_CAPACITY_V1',
  })
  occupancy_basis: 'BOOKED_OVER_CAPACITY_V1';
}

export class HostDashboardReviewsDto {
  @ApiPropertyOptional({ nullable: true, type: Number })
  avg_rating: number | null;
  @ApiProperty() total_reviews: number;
}

export class HostDashboardMessagingDto {
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Always null — no messaging coupling in H3',
  })
  unread_count: null;
  @ApiProperty({ enum: ['unavailable'] })
  status: 'unavailable';
}

export class HostDashboardCalendarStatusDto {
  @ApiProperty() healthy: boolean;
  @ApiProperty() listings_needing_attention: number;
}

export class HostDashboardListingHealthMissingDto {
  @ApiProperty() code: string;
  @ApiProperty() label: string;
  @ApiPropertyOptional() count?: number;
}

export class HostDashboardListingHealthDto {
  @ApiProperty() verified_live: boolean;
  @ApiProperty() calendar_synced: boolean;
  @ApiProperty() photos_complete: boolean;
  @ApiProperty() avg_completion_pct: number;
  @ApiProperty({ type: [HostDashboardListingHealthMissingDto] })
  missing: HostDashboardListingHealthMissingDto[];
}

export class HostDashboardBookingsSummaryDto {
  @ApiProperty() total: number;
  @ApiProperty() pending: number;
  @ApiProperty() active: number;
  @ApiProperty() completed: number;
  @ApiProperty() cancelled: number;
}

export class HostDashboardAggregateDto {
  @ApiProperty({ example: '2026-08-11T17:00:00.000Z' })
  as_of: string;
  @ApiProperty({ example: 'Africa/Casablanca' })
  timezone: string;
  @ApiProperty({ example: 'MAD' })
  currency: string;
  @ApiProperty({ type: HostDashboardTodayDto })
  today: HostDashboardTodayDto;
  @ApiProperty({ type: HostDashboardEarningsDto })
  earnings: HostDashboardEarningsDto;
  @ApiProperty({ type: HostDashboardPayoutsDto })
  payouts: HostDashboardPayoutsDto;
  @ApiProperty({ type: HostDashboardOperationsDto })
  operations: HostDashboardOperationsDto;
  @ApiProperty({ type: HostDashboardInventoryDto })
  inventory: HostDashboardInventoryDto;
  @ApiProperty({ type: HostDashboardReviewsDto })
  reviews: HostDashboardReviewsDto;
  @ApiProperty({ type: HostDashboardMessagingDto })
  messaging: HostDashboardMessagingDto;
  @ApiProperty({ type: HostDashboardCalendarStatusDto })
  calendar_status: HostDashboardCalendarStatusDto;
  @ApiProperty({ type: HostDashboardListingHealthDto })
  listing_health: HostDashboardListingHealthDto;
  @ApiProperty({ type: HostDashboardBookingsSummaryDto })
  bookings_summary: HostDashboardBookingsSummaryDto;
}
