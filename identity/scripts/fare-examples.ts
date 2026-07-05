/**
 * Output example fare calculations for Casablanca pricing.
 * Run: npx ts-node -r tsconfig-paths/register scripts/fare-examples.ts
 */
import { FareCalculatorService } from '../src/modules/go-taxi/pricing/fare-calculator.service';

const calc = new FareCalculatorService();
const examples: Array<{ km: number; min: number }> = [
  { km: 3, min: 8 },
  { km: 5, min: 12 },
  { km: 8, min: 18 },
  { km: 12, min: 25 },
  { km: 15, min: 35 },
];

console.log('\n--- Nexa Go Casablanca Fare Examples (MAD) ---\n');
for (const { km, min } of examples) {
  const eco = calc.calculate({ rideType: 'economy', distanceKm: km, durationMin: min });
  const comf = calc.calculate({ rideType: 'comfort', distanceKm: km, durationMin: min });
  const moto = calc.calculate({ rideType: 'moto', distanceKm: km, durationMin: min });
  console.log(`${km} km / ${min} min:`);
  console.log(`  Economy: ${eco.riderPayable} MAD  |  Comfort: ${comf.riderPayable} MAD  |  Moto: ${moto.riderPayable} MAD`);
  console.log();
}
