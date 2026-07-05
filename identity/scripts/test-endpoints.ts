/**
 * Test script to verify orders and commissions endpoints
 * Run with: npx ts-node -r tsconfig-paths/register scripts/test-endpoints.ts
 */

const API_BASE = 'http://localhost:3000/api/v1';
const ADMIN_EMAIL = 'admin@nexapay.com';
const ADMIN_PASSWORD = 'admin123';

async function httpRequest(url: string, options: { method?: string; headers?: Record<string, string>; body?: any } = {}) {
  const { method = 'GET', headers = {}, body } = options;
  
  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  
  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, fetchOptions);
  const data = await response.json();
  
  return {
    status: response.status,
    data,
    ok: response.ok,
  };
}

async function login(): Promise<string> {
  const response = await httpRequest(`${API_BASE}/auth/admin/login`, {
    method: 'POST',
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Login failed: ${JSON.stringify(response.data)}`);
  }
  
  // TransformInterceptor wraps response: { data: { access_token: ... } }
  const token = response.data?.data?.access_token || response.data?.access_token;
  if (!token) {
    throw new Error('No access token received');
  }
  return token;
}

async function testOrdersEndpoint(token: string) {
  console.log('\n=== Testing Orders Endpoint ===');
  try {
    const response = await httpRequest(`${API_BASE}/go/delivery/orders`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error(`Request failed: ${JSON.stringify(response.data)}`);
    }
    
    console.log('Response status:', response.status);
    console.log('Response structure:', JSON.stringify(Object.keys(response.data), null, 2));
    
    // TransformInterceptor wraps: { data: { data: [...], total, page, limit } }
    const ordersData = response.data?.data || response.data;
    const orders = Array.isArray(ordersData) 
      ? ordersData 
      : ordersData?.data || ordersData?.orders || [];
    
    console.log(`Found ${orders.length} orders`);
    if (orders.length > 0) {
      console.log('First order:', JSON.stringify(orders[0], null, 2));
    }
    
    return { success: true, count: orders.length };
  } catch (error: any) {
    console.error('Orders endpoint error:', error.message || error);
    return { success: false, error: error.message || String(error) };
  }
}

async function testCommissionsEndpoint(token: string) {
  console.log('\n=== Testing Commissions Endpoint ===');
  try {
    const response = await httpRequest(`${API_BASE}/admin/finance/commissions`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error(`Request failed: ${JSON.stringify(response.data)}`);
    }
    
    console.log('Response status:', response.status);
    console.log('Response structure:', JSON.stringify(Object.keys(response.data), null, 2));
    
    // TransformInterceptor wraps: { data: { commissions: [...], summary: {...} } }
    const responseData = response.data?.data || response.data || {};
    const commissions = Array.isArray(responseData) 
      ? responseData 
      : responseData?.commissions || responseData?.items || [];
    const summary = responseData?.summary || null;
    
    console.log(`Found ${commissions.length} commission records`);
    console.log('Summary:', JSON.stringify(summary, null, 2));
    
    if (commissions.length > 0) {
      console.log('First commission:', JSON.stringify(commissions[0], null, 2));
    }
    
    return { success: true, count: commissions.length, summary };
  } catch (error: any) {
    console.error('Commissions endpoint error:', error.message || error);
    return { success: false, error: error.message || String(error) };
  }
}

async function main() {
  console.log('Testing Admin Endpoints...\n');
  
  try {
    const token = await login();
    console.log('✓ Login successful');
    
    const ordersResult = await testOrdersEndpoint(token);
    const commissionsResult = await testCommissionsEndpoint(token);
    
    console.log('\n=== Summary ===');
    console.log('Orders endpoint:', ordersResult.success ? `✓ ${ordersResult.count} orders` : `✗ ${ordersResult.error}`);
    console.log('Commissions endpoint:', commissionsResult.success 
      ? `✓ ${commissionsResult.count} commissions` 
      : `✗ ${commissionsResult.error}`);
    
    if (commissionsResult.summary) {
      console.log('\nCommission Summary:');
      console.log(`  Total: ${commissionsResult.summary.total_commissions || 0} MAD`);
      console.log(`  Nexa Pay: ${commissionsResult.summary.nexapay_commissions || 0} MAD`);
      console.log(`  Nexa Go (Rides): ${commissionsResult.summary.nexago_commissions || 0} MAD`);
      console.log(`  Nexa Go (Delivery): ${commissionsResult.summary.nexago_delivery_commissions || 0} MAD`);
    }
  } catch (error: any) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

main();
