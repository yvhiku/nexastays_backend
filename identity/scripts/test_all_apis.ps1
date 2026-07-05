# NexaPay Backend API - Comprehensive Testing Script
# This script tests all API endpoints in sequence

$ErrorActionPreference = "Stop"

$baseUrl = "http://localhost:3000/api/v1"
$phone1 = "+212612345678"
$phone2 = "+212698765432"
$merchantPhone = "+212611111111"
$pin = "123456"
$otp = "123456"

$testResults = @()
$passed = 0
$failed = 0

function Test-API {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [int]$TestNumber,
        [int]$TotalTests
    )
    
    Write-Host "[$TestNumber/$TotalTests] $Name..." -ForegroundColor Yellow -NoNewline
    try {
        & $Test | Out-Null
        Write-Host " ✓ PASSED" -ForegroundColor Green
        $script:passed++
        $script:testResults += @{ Name = $Name; Status = "PASSED" }
    } catch {
        Write-Host " ✗ FAILED" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
        $script:testResults += @{ Name = $Name; Status = "FAILED"; Error = $_.Exception.Message }
    }
}

Write-Host ""
Write-Host "=== NexaPay Backend API - Comprehensive Testing ===" -ForegroundColor Cyan
Write-Host "Base URL: $baseUrl" -ForegroundColor Gray
Write-Host ""

# Test 1: Health Check
Test-API "Health Check" {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    if ($response.status -ne "ok") { throw "Health check failed" }
} -TestNumber 1 -TotalTests 20

# Test 2: Send OTP
Test-API "Send OTP" {
    $body = @{ phone_number = $phone1 } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/otp/send" -Method POST `
        -ContentType "application/json" -Body $body
    if (-not $response.sent) { throw "OTP not sent" }
} -TestNumber 2 -TotalTests 20

# Test 3: Verify OTP
Test-API "Verify OTP" {
    $body = @{ phone_number = $phone1; otp = $otp } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/otp/verify" -Method POST `
        -ContentType "application/json" -Body $body
    if (-not $response.verified) { throw "OTP verification failed" }
} -TestNumber 3 -TotalTests 20

# Test 4: Verify PIN and Get JWT
$token = $null
Test-API "Verify PIN (Get JWT Token)" {
    $body = @{ phone_number = $phone1; pin = $pin } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/pin/verify" -Method POST `
        -ContentType "application/json" -Body $body
    if (-not $response.access_token) { throw "Token not received" }
    $script:token = $response.access_token
} -TestNumber 4 -TotalTests 20

# Test 5: Get User Profile
Test-API "Get User Profile" {
    $response = Invoke-RestMethod -Uri "$baseUrl/users/me?phone_number=$phone1" -Method GET
    if (-not $response.id) { throw "User not found" }
} -TestNumber 5 -TotalTests 20

# Test 6: Update Profile
Test-API "Update User Profile" {
    $body = @{ 
        full_name = "Ahmed Benali Test"
        email = "test@nexa.ma"
        nationality = "MA"
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/users/profile?phone_number=$phone1" -Method PATCH `
        -ContentType "application/json" -Body $body
    if (-not $response.id) { throw "Profile update failed" }
} -TestNumber 6 -TotalTests 20

# Test 7: Get Wallet Balance
Test-API "Get Wallet Balance" {
    $response = Invoke-RestMethod -Uri "$baseUrl/wallets/balance?phone_number=$phone1" -Method GET
    if (-not ($response.balance -ge 0)) { throw "Balance not returned" }
} -TestNumber 7 -TotalTests 20

# Test 8: Get Wallet Info
Test-API "Get Wallet Info" {
    $response = Invoke-RestMethod -Uri "$baseUrl/wallets/me?phone_number=$phone1" -Method GET
    if (-not $response.id) { throw "Wallet not found" }
} -TestNumber 8 -TotalTests 20

# Test 9: Top Up Wallet
Test-API "Top Up Wallet" {
    $body = @{ phone_number = $phone1; amount = 100 } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/wallets/topup" -Method POST `
        -ContentType "application/json" -Body $body
    if (-not $response.id) { throw "Topup failed" }
} -TestNumber 9 -TotalTests 20

# Test 10: Send P2P Transfer
$transferReference = "TEST-TXN-$(Get-Date -Format 'yyyyMMddHHmmss')"
Test-API "Send P2P Transfer" {
    $body = @{
        sender_phone_number = $phone1
        receiver_phone_number = $phone2
        amount = 50
        reference = $transferReference
        idempotency_key = "test-key-$(Get-Date -Format 'yyyyMMddHHmmss')"
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/transfers/send" -Method POST `
        -ContentType "application/json" -Body $body
    if ($response.status -ne "COMPLETED") { throw "Transfer not completed" }
} -TestNumber 10 -TotalTests 20

# Test 11: Get Transaction History
Test-API "Get Transaction History" {
    $response = Invoke-RestMethod -Uri "$baseUrl/transactions/history?phone_number=$phone1&page=1&limit=10" -Method GET
    if ($response.Count -eq 0) { throw "No transactions found" }
} -TestNumber 11 -TotalTests 20

# Test 12: Merchant Login
$merchantToken = $null
Test-API "Merchant Login" {
    $body = @{ phone_number = $merchantPhone; pin = $pin } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/pin/verify" -Method POST `
        -ContentType "application/json" -Body $body
    $script:merchantToken = $response.access_token
    if (-not $merchantToken) { throw "Merchant token not received" }
} -TestNumber 12 -TotalTests 20

# Test 13: Generate QR Code
$qrPayload = $null
$qrSignature = $null
Test-API "Generate QR Code" {
    $headers = @{ Authorization = "Bearer $merchantToken" }
    $body = @{ merchant_phone_number = $merchantPhone; amount = 25 } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/qr/generate" -Method POST `
        -ContentType "application/json" -Headers $headers -Body $body
    $script:qrPayload = $response.payload
    $script:qrSignature = $response.signature
    if (-not $qrPayload) { throw "QR payload not generated" }
} -TestNumber 13 -TotalTests 20

# Test 14: Pay via QR
Test-API "Pay via QR Code" {
    $body = @{
        payer_phone_number = $phone1
        payload = $qrPayload
        signature = $qrSignature
        amount = 25
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/qr/pay" -Method POST `
        -ContentType "application/json" -Body $body
    if ($response.status -ne "COMPLETED") { throw "QR payment not completed" }
} -TestNumber 14 -TotalTests 20

# Test 15: Prepare NFC Token
$nfcPayload = $null
$nfcSignature = $null
Test-API "Prepare NFC Token" {
    $headers = @{ Authorization = "Bearer $merchantToken" }
    $body = @{ merchant_phone_number = $merchantPhone; amount = 15 } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/nfc/prepare" -Method POST `
        -ContentType "application/json" -Headers $headers -Body $body
    $script:nfcPayload = $response.payload
    $script:nfcSignature = $response.signature
    if (-not $nfcPayload) { throw "NFC payload not generated" }
} -TestNumber 15 -TotalTests 20

# Test 16: Pay via NFC
Test-API "Pay via NFC" {
    $body = @{
        payer_phone_number = $phone2
        payload = $nfcPayload
        signature = $nfcSignature
        amount = 15
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/nfc/pay" -Method POST `
        -ContentType "application/json" -Body $body
    if ($response.status -ne "COMPLETED") { throw "NFC payment not completed" }
} -TestNumber 16 -TotalTests 20

# Test 17: Submit KYC
Test-API "Submit KYC Documents" {
    $body = @{
        phone_number = $phone1
        documents = @{
            id_document = $true
            selfie = $true
        }
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/kyc/submit" -Method POST `
        -ContentType "application/json" -Body $body
    if (-not $response.user_id) { throw "KYC submission failed" }
} -TestNumber 17 -TotalTests 20

# Test 18: Get KYC Status
Test-API "Get KYC Status" {
    $response = Invoke-RestMethod -Uri "$baseUrl/kyc/status?phone_number=$phone1" -Method GET
    if (-not $response.status) { throw "KYC status not returned" }
} -TestNumber 18 -TotalTests 20

# Test 19: Error Handling - Insufficient Funds
Test-API "Error Handling (Insufficient Funds)" {
    try {
        $body = @{
            sender_phone_number = $phone2
            receiver_phone_number = $phone1
            amount = 999999
            reference = "FAIL-TEST"
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "$baseUrl/transfers/send" -Method POST `
            -ContentType "application/json" -Body $body | Out-Null
        throw "Should have failed with insufficient funds"
    } catch {
        if ($_.Exception.Message -notlike "*Insufficient*") {
            throw "Unexpected error: $($_.Exception.Message)"
        }
    }
} -TestNumber 19 -TotalTests 20

# Test 20: Error Handling - Transaction Limit
Test-API "Error Handling (Transaction Limit)" {
    try {
        $body = @{
            sender_phone_number = $phone1
            receiver_phone_number = $phone2
            amount = 9999
            reference = "LIMIT-TEST"
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "$baseUrl/transfers/send" -Method POST `
            -ContentType "application/json" -Body $body | Out-Null
        throw "Should have failed with transaction limit"
    } catch {
        if ($_.Exception.Message -notlike "*limit*" -and $_.Exception.Message -notlike "*exceed*") {
            throw "Unexpected error: $($_.Exception.Message)"
        }
    }
} -TestNumber 20 -TotalTests 20

# Summary
Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "Total Tests: $($passed + $failed)" -ForegroundColor White
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($failed -gt 0) {
    Write-Host "Failed Tests:" -ForegroundColor Red
    $testResults | Where-Object { $_.Status -eq "FAILED" } | ForEach-Object {
        Write-Host "  - $($_.Name): $($_.Error)" -ForegroundColor Red
    }
    Write-Host ""
    exit 1
} else {
    Write-Host "✓ All tests passed!" -ForegroundColor Green
    Write-Host ""
    exit 0
}
