# NexaPay API - Full Collection Test Script
# This script runs all endpoints in logical order

Write-Host "🚀 Starting NexaPay API Collection Tests" -ForegroundColor Green
Write-Host ""

# Step 1: Health Check
Write-Host "📋 Step 1: Health Check" -ForegroundColor Cyan
newman run NexaPay_API_Collection.json --folder "Health Check" --reporters cli
Write-Host ""

# Step 2: Authentication Tests
Write-Host "📋 Step 2: Authentication Tests" -ForegroundColor Cyan
newman run NexaPay_API_Collection.json --folder "Authentication" --reporters cli
Write-Host ""

# Step 3: User Endpoints (requires token from auth)
Write-Host "📋 Step 3: User Endpoints" -ForegroundColor Cyan
newman run NexaPay_API_Collection.json --folder "Users" --reporters cli
Write-Host ""

# Step 4: Wallet Endpoints
Write-Host "📋 Step 4: Wallet Endpoints" -ForegroundColor Cyan
newman run NexaPay_API_Collection.json --folder "Wallets" --reporters cli
Write-Host ""

# Step 5: Transaction Endpoints
Write-Host "📋 Step 5: Transaction Endpoints" -ForegroundColor Cyan
newman run NexaPay_API_Collection.json --folder "Transactions" --reporters cli
Write-Host ""

# Step 6: QR Payment Endpoints
Write-Host "📋 Step 6: QR Payment Endpoints" -ForegroundColor Cyan
newman run NexaPay_API_Collection.json --folder "QR Payments" --reporters cli
Write-Host ""

# Step 7: NFC Payment Endpoints
Write-Host "📋 Step 7: NFC Payment Endpoints" -ForegroundColor Cyan
newman run NexaPay_API_Collection.json --folder "NFC Payments" --reporters cli
Write-Host ""

# Step 8: KYC Endpoints
Write-Host "📋 Step 8: KYC Endpoints" -ForegroundColor Cyan
newman run NexaPay_API_Collection.json --folder "KYC" --reporters cli
Write-Host ""

# Step 9: Admin Endpoints (requires admin token)
Write-Host "📋 Step 9: Admin Endpoints" -ForegroundColor Cyan
newman run NexaPay_API_Collection.json --folder "Admin" --reporters cli
Write-Host ""

Write-Host "✅ All endpoint tests completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Note: Some endpoints may fail if:" -ForegroundColor Yellow
Write-Host "  - Tokens haven't been generated (run Authentication first)" -ForegroundColor Yellow
Write-Host "  - Required data doesn't exist (create users/transactions first)" -ForegroundColor Yellow
Write-Host "  - Variables aren't set (run requests in order)" -ForegroundColor Yellow