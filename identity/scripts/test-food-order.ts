/**
 * E2E test: Ahmed orders food from Test Restaurant, order gets completed.
 * Run with: npm run test:food (backend must be running).
 */

const BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api/v1';
const AHMED_PHONE = '+212612345678';
const RESTAURANT_PHONE = '+212666666666';
const COURIER_PHONE = '+212777777777';
const PIN = '1234';
const OTP = '123456';
const DELIVERY_LAT = 33.5731; // Casablanca
const DELIVERY_LNG = -7.5898;

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

async function login(phone: string, accountType: 'CONSUMER' | 'MERCHANT' | 'DRIVER'): Promise<string> {
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
  console.log('1. Login as Ahmed (CONSUMER)...');
  const ahmedToken = await login(AHMED_PHONE, 'CONSUMER');
  const balanceBefore = await getBalance(ahmedToken);
  console.log(`   Ahmed balance before: ${balanceBefore} MAD`);

  console.log('2. Login as Test Restaurant (MERCHANT)...');
  const restaurantToken = await login(RESTAURANT_PHONE, 'MERCHANT');

  console.log('3. Onboard merchant...');
  const onboard = await req(
    'POST',
    '/go/delivery/merchants/onboard',
    { name: 'Test Restaurant' },
    restaurantToken,
  );
  if (onboard.status !== 201 && onboard.status !== 200) {
    throw new Error(`Merchant onboard failed: ${onboard.status} ${JSON.stringify(onboard.data)}`);
  }
  const merchant = onboard.data?.data ?? onboard.data;
  const merchantId = merchant.id;
  if (!merchantId) throw new Error('No merchant id in response');
  console.log(`   Merchant id: ${merchantId}`);

  console.log('4. Create menu...');
  const menu = await req(
    'POST',
    '/go/delivery/menus',
    { name: 'Main Menu' },
    restaurantToken,
  );
  if (menu.status !== 201 && menu.status !== 200) {
    throw new Error(`Create menu failed: ${menu.status} ${JSON.stringify(menu.data)}`);
  }
  const menuData = menu.data?.data ?? menu.data;
  const menuId = menuData.id;
  if (!menuId) throw new Error('No menu id in response');
  console.log(`   Menu id: ${menuId}`);

  console.log('5. Add menu items...');
  const item1 = await req(
    'POST',
    '/go/delivery/menus/items',
    { menu_id: menuId, name: 'Couscous', price: 45.00 },
    restaurantToken,
  );
  if (item1.status !== 201 && item1.status !== 200) {
    throw new Error(`Add menu item failed: ${item1.status} ${JSON.stringify(item1.data)}`);
  }
  const item1Data = item1.data?.data ?? item1.data;
  const item1Id = item1Data.id;
  if (!item1Id) throw new Error('No menu item id in response');

  const item2 = await req(
    'POST',
    '/go/delivery/menus/items',
    { menu_id: menuId, name: 'Tagine', price: 35.00 },
    restaurantToken,
  );
  if (item2.status !== 201 && item2.status !== 200) {
    throw new Error(`Add menu item failed: ${item2.status} ${JSON.stringify(item2.data)}`);
  }
  const item2Data = item2.data?.data ?? item2.data;
  const item2Id = item2Data.id;
  if (!item2Id) throw new Error('No menu item id in response');
  console.log(`   Added items: Couscous (${item1Id.substring(0, 8)}...), Tagine (${item2Id.substring(0, 8)}...)`);

  console.log('6. Create food order...');
  const create = await req(
    'POST',
    '/go/delivery/orders',
    {
      merchant_id: merchantId,
      items: [
        { menu_item_id: item1Id, quantity: 2 },
        { menu_item_id: item2Id, quantity: 1 },
      ],
      delivery_lat: DELIVERY_LAT,
      delivery_lng: DELIVERY_LNG,
    },
    ahmedToken,
  );
  if (create.status !== 201 && create.status !== 200) {
    throw new Error(`Create order failed: ${create.status} ${JSON.stringify(create.data)}`);
  }
  const order = create.data?.data ?? create.data;
  const orderId = order.id;
  if (!orderId) throw new Error('No order id in response');
  console.log(`   Order id: ${orderId}`);
  console.log(`   Total amount: ${order.total_amount} MAD`);

  console.log('7. Restaurant prepares order...');
  const prepare = await req('POST', `/go/delivery/orders/${orderId}/prepare`, undefined, restaurantToken);
  if (prepare.status !== 200 && prepare.status !== 201) {
    throw new Error(`Prepare order failed: ${prepare.status} ${JSON.stringify(prepare.data)}`);
  }
  const prepared = prepare.data?.data ?? prepare.data;
  if (prepared.status !== 'PREPARING') {
    throw new Error(`Expected status PREPARING, got ${prepared.status}`);
  }
  console.log(`   Order status: ${prepared.status}`);

  console.log('8. Restaurant marks order as ready...');
  const ready = await req('POST', `/go/delivery/orders/${orderId}/ready`, undefined, restaurantToken);
  if (ready.status !== 200 && ready.status !== 201) {
    throw new Error(`Ready order failed: ${ready.status} ${JSON.stringify(ready.data)}`);
  }
  const readied = ready.data?.data ?? ready.data;
  if (readied.status !== 'READY') {
    throw new Error(`Expected status READY, got ${readied.status}`);
  }
  console.log(`   Order status: ${readied.status}`);

  console.log('9. Login as Test Courier (CONSUMER)...');
  const courierToken = await login(COURIER_PHONE, 'CONSUMER');

  console.log('10. Onboard courier...');
  const courierOnboard = await req(
    'POST',
    '/go/delivery/couriers/onboard',
    {},
    courierToken,
  );
  if (courierOnboard.status !== 201 && courierOnboard.status !== 200) {
    throw new Error(`Courier onboard failed: ${courierOnboard.status} ${JSON.stringify(courierOnboard.data)}`);
  }
  console.log('   Courier onboarded successfully');

  console.log('11. Courier accepts order...');
  const accept = await req('POST', `/go/delivery/orders/${orderId}/accept`, undefined, courierToken);
  if (accept.status !== 200 && accept.status !== 201) {
    throw new Error(`Accept order failed: ${accept.status} ${JSON.stringify(accept.data)}`);
  }
  const accepted = accept.data?.data ?? accept.data;
  // Accept automatically transitions to PICKED_UP
  if (accepted.status !== 'PICKED_UP') {
    throw new Error(`Expected status PICKED_UP after accept, got ${accepted.status}`);
  }
  console.log(`   Order status: ${accepted.status} (accepted and picked up)`);

  console.log('12. Courier starts delivery...');
  // Note: acceptOrder already set status to PICKED_UP
  // The deliver endpoint will handle DELIVERED -> COMPLETED transition
  // We can go directly to deliver from PICKED_UP

  console.log('13. Courier delivers order (marks as DELIVERED and COMPLETED)...');
  const deliver = await req('POST', `/go/delivery/orders/${orderId}/deliver`, undefined, courierToken);
  if (deliver.status !== 200 && deliver.status !== 201) {
    throw new Error(`Deliver order failed: ${deliver.status} ${JSON.stringify(deliver.data)}`);
  }
  const delivered = deliver.data?.data ?? deliver.data;
  if (delivered.status !== 'COMPLETED') {
    throw new Error(`Expected status COMPLETED after deliver, got ${delivered.status}`);
  }
  console.log(`   Order status: ${delivered.status}`);

  console.log('14. Check final order status...');
  const finalOrder = await req('GET', `/go/delivery/orders/${orderId}`, undefined, ahmedToken);
  if (finalOrder.status !== 200) {
    throw new Error(`Get order failed: ${finalOrder.status} ${JSON.stringify(finalOrder.data)}`);
  }
  const final = finalOrder.data?.data ?? finalOrder.data;
  console.log(`   Order status: ${final.status}`);
  console.log(`   Order total: ${final.total_amount} MAD`);

  console.log('15. Assert balances...');
  const balanceAfter = await getBalance(ahmedToken);
  console.log(`   Ahmed balance before: ${balanceBefore} MAD`);
  console.log(`   Ahmed balance after: ${balanceAfter} MAD`);
  
  // Payment should be processed when order is COMPLETED
  if (final.status !== 'COMPLETED') {
    throw new Error(`Order should be COMPLETED, but got ${final.status}`);
  }
  
  // Verify payment was processed
  const expected = balanceBefore - Number(final.total_amount ?? 0);
  if (Math.abs(balanceAfter - expected) > 0.01) {
    throw new Error(
      `Ahmed balance: expected ~${expected}, got ${balanceAfter}`,
    );
  }
  console.log('   ✓ Payment processed correctly');

  console.log('\nFood order test passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
