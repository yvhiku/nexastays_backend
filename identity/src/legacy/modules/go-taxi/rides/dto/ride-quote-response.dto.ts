export enum DemandLevel {
  LOW = 'LOW',
  SLIGHTLY_HIGH = 'SLIGHTLY_HIGH',
  HIGH = 'HIGH',
}

export interface AvailabilityStats {
  online_drivers: number;
  total_drivers: number;
}

export interface DemandInfo {
  level: DemandLevel;
  multiplier: number;
  note: string;
}

export interface PickupBreakdown {
  minimum_price: number;
  included_wait_minutes: number;
  extra_wait_fee: number;
  demand_surcharge: number;
}

export interface ExtraTimeBreakdown {
  minutes: number;
  rate_per_min: number;
  cost: number;
}

export interface ExtraDistanceBreakdown {
  km: number;
  rate_per_km: number;
  cost: number;
}

export interface RideBreakdown {
  estimated_distance_km: number;
  estimated_time_min: number;
  included_distance_km: number;
  included_time_min: number;
  extra_time: ExtraTimeBreakdown;
  extra_distance: ExtraDistanceBreakdown;
}

export interface TotalBreakdown {
  amount: number;
  currency: string;
}

export interface RideQuoteResponse {
  service_class: string;
  availability: AvailabilityStats;
  demand: DemandInfo;
  pickup: PickupBreakdown;
  ride: RideBreakdown;
  total: TotalBreakdown;
}
