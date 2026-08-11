import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Supported analytics periods (H7 locked vocabulary). */
export const HOST_ANALYTICS_PERIODS = [
  'this_month',
  'previous_month',
  'all_time',
  'next_30d',
] as const;

export type HostAnalyticsPeriodId = (typeof HOST_ANALYTICS_PERIODS)[number];

export const HOST_ANALYTICS_OCCUPANCY_BASIS =
  'BOOKED_NIGHTS_OVER_PERIOD_DAYS_V1' as const;

export class HostAnalyticsPeriodDto {
  @ApiProperty({ enum: HOST_ANALYTICS_PERIODS })
  id: HostAnalyticsPeriodId;

  @ApiProperty({
    description: 'Casablanca calendar start YYYY-MM-DD (inclusive)',
    example: '2026-08-01',
  })
  start: string;

  @ApiProperty({
    description: 'Casablanca calendar end YYYY-MM-DD (exclusive)',
    example: '2026-09-01',
  })
  end_exclusive: string;
}

export class HostAnalyticsPropertyBookingsDto {
  @ApiProperty() total: number;
  @ApiProperty() payment_pending: number;
  @ApiProperty() upcoming: number;
  @ApiProperty() current: number;
  @ApiProperty() completed: number;
  @ApiProperty() cancelled: number;
}

export class HostAnalyticsPropertyNightsDto {
  @ApiProperty({
    description:
      'Booked nights of earning bookings overlapping the resolved period window',
  })
  booked_in_period: number;
}

export class HostAnalyticsPropertyEarningsDto {
  @ApiProperty() gross_revenue: number;
  @ApiProperty() net_host_earnings: number;
  @ApiProperty() platform_fees: number;
  @ApiProperty({
    description:
      'Net for CONFIRMED|CHECKED_IN with check-in in [today, today+30) Casablanca (H3 rule)',
  })
  upcoming_revenue_30d: number;
}

export class HostAnalyticsPropertyOccupancyDto {
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description:
      'booked_nights / period_days * 100. Null when period has no finite day count (all_time).',
  })
  value: number | null;

  @ApiProperty({
    enum: [HOST_ANALYTICS_OCCUPANCY_BASIS],
    example: HOST_ANALYTICS_OCCUPANCY_BASIS,
  })
  basis: typeof HOST_ANALYTICS_OCCUPANCY_BASIS;
}

export class HostAnalyticsPropertyReviewsDto {
  @ApiPropertyOptional({ nullable: true, type: Number })
  avg_rating: number | null;

  @ApiProperty() total_reviews: number;
}

export class HostAnalyticsPropertyOperationsDto {
  @ApiProperty() checkins_today: number;
  @ApiProperty() checkouts_today: number;
  @ApiPropertyOptional({ nullable: true, type: String })
  next_checkin_date: string | null;
  @ApiProperty() upcoming_bookings: number;
  @ApiProperty() currently_staying: number;
}

export class HostAnalyticsPropertyPayoutsDto {
  @ApiProperty() pending: number;
  @ApiProperty() paid_out: number;
}

export class HostAnalyticsHealthMissingDto {
  @ApiProperty() code: string;
  @ApiProperty() label: string;
}

export class HostAnalyticsPropertyHealthDto {
  @ApiProperty() completion_percentage: number;
  @ApiProperty() photos_complete: boolean;
  @ApiProperty({
    description: 'Per-listing calendar readiness (NONE | ACTIVE | SYNCING | ERROR | PAUSED | MIXED)',
  })
  calendar_status: string;
  @ApiProperty({ type: [HostAnalyticsHealthMissingDto] })
  missing: HostAnalyticsHealthMissingDto[];
  @ApiProperty({
    type: [String],
    description: 'Attention flags derived from existing signals (no composite score)',
  })
  attention: string[];
}

export class HostAnalyticsPropertyDto {
  @ApiProperty() listing_id: string;
  @ApiProperty() title: string;
  @ApiProperty() city: string;
  @ApiProperty() status: string;
  @ApiProperty({ type: HostAnalyticsPropertyBookingsDto })
  bookings: HostAnalyticsPropertyBookingsDto;
  @ApiProperty({ type: HostAnalyticsPropertyNightsDto })
  nights: HostAnalyticsPropertyNightsDto;
  @ApiProperty({ type: HostAnalyticsPropertyEarningsDto })
  earnings: HostAnalyticsPropertyEarningsDto;
  @ApiProperty({ type: HostAnalyticsPropertyOccupancyDto })
  occupancy: HostAnalyticsPropertyOccupancyDto;
  @ApiProperty({ type: HostAnalyticsPropertyReviewsDto })
  reviews: HostAnalyticsPropertyReviewsDto;
  @ApiProperty({ type: HostAnalyticsPropertyOperationsDto })
  operations: HostAnalyticsPropertyOperationsDto;
  @ApiProperty({ type: HostAnalyticsPropertyPayoutsDto })
  payouts: HostAnalyticsPropertyPayoutsDto;
  @ApiProperty({ type: HostAnalyticsPropertyHealthDto })
  health: HostAnalyticsPropertyHealthDto;
}

/** Response for GET /stays/host/analytics (H7 / H10). */
export class HostAnalyticsResponseDto {
  @ApiProperty() as_of: string;
  @ApiProperty({ example: 'Africa/Casablanca' }) timezone: string;
  @ApiProperty({ example: 'MAD' }) currency: string;
  @ApiProperty({ type: HostAnalyticsPeriodDto })
  period: HostAnalyticsPeriodDto;
  @ApiProperty({
    type: [String],
    example: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'],
  })
  eligible_booking_statuses: string[];
  @ApiProperty({ type: [HostAnalyticsPropertyDto] })
  properties: HostAnalyticsPropertyDto[];
}
