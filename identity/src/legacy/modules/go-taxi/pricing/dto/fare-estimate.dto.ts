export class FareEstimateBreakdownDto {
  baseFare: number;
  distanceComponent: number;
  timeComponent: number;
  minFareApplied: boolean;
}

export class FareEstimateDto {
  fare: number;
  bookingFee: number;
  commission: number;
  driverPayout: number;
  platformTake: number;
  passengerTotal: number;
  surgeActive: boolean;
  surgeMultiplier: number;
  currency: string;
  breakdown: FareEstimateBreakdownDto;
}

export interface FareEstimate {
  fare: number;
  bookingFee: number;
  commission: number;
  driverPayout: number;
  platformTake: number;
  passengerTotal: number;
  surgeMultiplier: number;
  surgeActive: boolean;
  breakdown: {
    baseFare: number;
    distanceComponent: number;
    timeComponent: number;
    minFareApplied: boolean;
  };
}
