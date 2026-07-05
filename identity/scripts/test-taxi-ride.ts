/**
 * E2E test: Fatima orders a taxi, Test Driver accepts and completes; driver gets paid.
 * Run with: npm run test:taxi (backend must be running).
 */

const BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api/v1';
const FATIMA_PHONE = '+212698765432';
const DRIVER_PHONE = '+212655555555';
const PIN = '1234';
const OTP = '123456';
const FARE = 50;

async function req(
  method: string,
  path: string,
  body?: object,
  token?: string,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data };
}

async function login(phone: string, accountType: 'CONSUMER' | 'DRIVER'): Promise<string> {
  await req('POST', '/auth/otp/send', { phone_number: phone });
  const verify = await req('POST', '/auth/otp/verify', { phone_number: phone, otp: OTP });
  const verified = verify.data?.verified ?? verify.data?.data?.verified;
  if (!verified) {
    throw new Error(`OTP verify failed for ${phone}: ${JSON.stringify(verify.data)}`);
  }
  const pin = await req('POST', '/auth/verify-pin', {
    phone_number: phone,
    pin: PIN,
    account_type: accountType,
  });
  const token = pin.data?.data?.access_token ?? pin.data?.access_token;
  if (!token) {
    throw new Error(`verify-pin failed for ${phone}: ${JSON.stringify(pin.data)}`);
  }
  return token;
}

async function getBalance(token: string): Promise<number> {
  const res = await req('GET', '/wallets/balance', undefined, token);
  const raw = res.data?.data ?? res.data;
  const b = raw?.balance ?? raw;
  return Number(b ?? 0);
}

async function main() {
  console.log('1. Login as Fatima (CONSUMER)...');
  const fatimaToken = await login(FATIMA_PHONE, 'CONSUMER');
  const balanceBefore = await getBalance(fatimaToken);
  console.log(`   Fatima balance before: ${balanceBefore} MAD`);

  console.log('2. Create ride (50 MAD)...');
  const create = await req(
    'POST',
    '/go/rides',
    {
      pickup_location: 'Casablanca Central',
      dropoff_location: 'Mohammedia',
      fare_amount: FARE,
    },
    fatimaToken,
  );
  if (create.status !== 201 && create.status !== 200) {
    throw new Error(`Create ride failed: ${create.status} ${JSON.stringify(create.data)}`);
  }
  const ride = create.data?.data ?? create.data;
  const rideId = ride.id;
  if (!rideId) throw new Error('No ride id in response');
  console.log(`   Ride id: ${rideId}`);

  console.log('3. Login as Test Driver (DRIVER)...');
  const driverToken = await login(DRIVER_PHONE, 'DRIVER');
  const driverBalanceBefore = await getBalance(driverToken);
  console.log(`   Driver balance before: ${driverBalanceBefore} MAD`);

  console.log('4. Driver accepts ride...');
  const accept = await req('PATCH', `/go/rides/${rideId}/accept`, undefined, driverToken);
  if (accept.status !== 200) {
    throw new Error(`Accept failed: ${accept.status} ${JSON.stringify(accept.data)}`);
  }

  console.log('5. Driver completes ride...');
  const complete = await req('PATCH', `/go/rides/${rideId}/complete`, undefined, driverToken);
  if (complete.status !== 200) {
    throw new Error(`Complete failed: ${complete.status} ${JSON.stringify(complete.data)}`);
  }

  const completed = complete.data?.data ?? complete.data;
  if (completed.status !== 'COMPLETED') {
    throw new Error(`Ride status ${completed.status}, expected COMPLETED`);
  }

  console.log('6. Assert balances...');
  const balanceAfter = await getBalance(fatimaToken);
  const driverBalanceAfter = await getBalance(driverToken);
  const commission = Math.round(FARE * 0.1 * 100) / 100;
  const driverAmount = FARE - commission;
  const expectedRider = balanceBefore - FARE;
  const expectedDriver = driverBalanceBefore + driverAmount;

  if (Math.abs(balanceAfter - expectedRider) > 0.01) {
    throw new Error(
      `Rider balance: expected ~${expectedRider}, got ${balanceAfter}`,
    );
  }
  if (Math.abs(driverBalanceAfter - expectedDriver) > 0.01) {
    throw new Error(
      `Driver balance: expected ~${expectedDriver}, got ${driverBalanceAfter}`,
    );
  }

  console.log('   Rider balance after:', balanceAfter, 'MAD');
  console.log('   Driver balance after:', driverBalanceAfter, 'MAD');
  console.log('   Commission:', commission, 'MAD');
  console.log('\nTaxi ride test passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
