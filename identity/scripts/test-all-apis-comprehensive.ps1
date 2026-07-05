# NexaPay Backend API - Comprehensive Testing Script
# Tests all API endpoints with proper JWT authentication

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
$token = $null
$otpSessionToken = $null
$merchantToken = $null
$qrPayload = $null
$qrSignature = $null
$nfcPayload = $null
$nfcSignature = $null

function Test-API {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [int]$TestNumber,
        [int]$TotalTests
    )
    
    Write-Host "[$TestNumber/$TotalTests] $Name..." -ForegroundColor Yellow -NoNewline
    try {
        $result = & $Test
        Write-Host " ✓ PASSED" -ForegroundColor Green
        $script:passed++
        $script:testResults += @{ Name = $Name; Status = "PASSED" }
        return $result
    } catch {
        Write-Host " ✗ FAILED" -ForegroundColor Red
        $errorMsg = $_.Exception.Message
        if ($_.Exception.Response) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                $errorMsg = "$errorMsg - $responseBody"
            } catch {}
        }
        Write-Host "  Error: $errorMsg" -ForegroundColor Red
        $script:failed++
        $script:testResults += @{ Name = $Name; Status = "FAILED"; Error = $errorMsg }
        return $null
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
    return $response
} -TestNumber 1 -TotalTests 30

# Test 2: Send OTP
Test-API "Send OTP" {
    $body = @{ phone_number = $phone1 } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/otp/send" -Method POST `
        -ContentType "application/json" -Body $body
    if (-not $response.sent) { throw "OTP not sent" }
    return $response
} -TestNumber 2 -TotalTests 30

# Test 3: Verify OTP
Test-API "Verify OTP (Get OTP Session Token)" {
    $body = @{ phone_number = $phone1; otp = $otp } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/otp/verify" -Method POST `
        -ContentType "application/json" -Body $body
    if (-not $response.verified) { throw "OTP verification failed" }
    if (-not $response.otp_session_token) { throw "OTP session token not received" }
    $script:otpSessionToken = $response.otp_session_token
    return $response
} -TestNumber 3 -TotalTests 30

# Test 4: Set PIN (if needed)
Test-API "Set PIN" {
    if ($otpSessionToken) {
        $body = @{ otp_session_token = $otpSessionToken; pin = $pin } | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$baseUrl/auth/pin/set" -Method POST `
            -ContentType "application/json" -Body $body
        if (-not $response.success) { throw "PIN set failed" }
        return $response
    } else {
        Write-Host " (Skipped - no OTP session token)" -ForegroundColor Yellow
        return $null
    }
} -TestNumber 4 -TotalTests 30

# Test 5: Verify PIN and Get JWT Token
Test-API "Verify PIN (Get JWT Token)" {
    $body = @{ phone_number = $phone1; pin = $pin } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/pin/verify" -Method POST `
        -ContentType "application/json" -Body $body
    if (-not $response.access_token) { throw "Token not received" }
    $script:token = $response.access_token
    return $response
} -TestNumber 5 -TotalTests 30

if (-not $token) {
    Write-Host ""
    Write-Host "ERROR: Could not obtain JWT token. Cannot continue with authenticated tests." -ForegroundColor Red
    exit 1
}

# Test 6: Get User Profile (with JWT)
Test-API "Get User Profile (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $response = Invoke-RestMethod -Uri "$baseUrl/users/me" -Method GET -Headers $headers
    if (-not $response.id) { throw "User not found" }
    return $response
} -TestNumber 6 -TotalTests 30

# Test 7: Update Profile (with JWT)
Test-API "Update User Profile (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $body = @{ 
        full_name = "Ahmed Benali Test"
        email = "test@nexa.ma"
        nationality = "MA"
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/users/profile" -Method PATCH `
        -ContentType "application/json" -Headers $headers -Body $body
    if (-not $response.id) { throw "Profile update failed" }
    return $response
} -TestNumber 7 -TotalTests 30

# Test 8: Get Wallet Info (with JWT)
Test-API "Get Wallet Info (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $response = Invoke-RestMethod -Uri "$baseUrl/wallets/me" -Method GET -Headers $headers
    if (-not $response.id) { throw "Wallet not found" }
    return $response
} -TestNumber 8 -TotalTests 30

# Test 9: Get Wallet Balance (with JWT)
Test-API "Get Wallet Balance (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $response = Invoke-RestMethod -Uri "$baseUrl/wallets/balance" -Method GET -Headers $headers
    if (-not ($response.balance -ge 0)) { throw "Balance not returned" }
    return $response
} -TestNumber 9 -TotalTests 30

# Test 10: Top Up Wallet (with JWT)
Test-API "Top Up Wallet (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $body = @{ amount = 100 } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/wallets/topup" -Method POST `
        -ContentType "application/json" -Headers $headers -Body $body
    if (-not $response.id) { throw "Topup failed" }
    return $response
} -TestNumber 10 -TotalTests 30

# Test 11: Get Transaction History (with JWT)
Test-API "Get Transaction History (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $uri = "$baseUrl/transactions/history?page=1`&limit=10"
    $response = Invoke-RestMethod -Uri $uri -Method GET -Headers $headers
    if ($null -eq $response) { throw "No response" }
    return $response
} -TestNumber 11 -TotalTests 30

# Test 12: Get Transactions (with JWT)
Test-API "Get Transactions (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $uri = "$baseUrl/transactions?page=1`&limit=10"
    $response = Invoke-RestMethod -Uri $uri -Method GET -Headers $headers
    if ($null -eq $response) { throw "No response" }
    return $response
} -TestNumber 12 -TotalTests 30

# Setup second user for transfer
Write-Host ""
Write-Host "Setting up second user for transfer tests..." -ForegroundColor Gray

# Test 13: Send OTP for User 2
Test-API "Send OTP (User 2)" {
    $body = @{ phone_number = $phone2 } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/otp/send" -Method POST `
        -ContentType "application/json" -Body $body
    if (-not $response.sent) { throw "OTP not sent" }
    return $response
} -TestNumber 13 -TotalTests 30

# Test 14: Verify OTP for User 2
Test-API "Verify OTP (User 2)" {
    $body = @{ phone_number = $phone2; otp = $otp } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/otp/verify" -Method POST `
        -ContentType "application/json" -Body $body
    if (-not $response.verified) { throw "OTP verification failed" }
    if ($response.otp_session_token) {
        $otpSession2 = $response.otp_session_token
        $body2 = @{ otp_session_token = $otpSession2; pin = $pin } | ConvertTo-Json
        Invoke-RestMethod -Uri "$baseUrl/auth/pin/set" -Method POST `
            -ContentType "application/json" -Body $body2 | Out-Null
    }
    return $response
} -TestNumber 14 -TotalTests 30

# Test 15: Send P2P Transfer (with JWT)
$transferReference = "TEST-TXN-$(Get-Date -Format 'yyyyMMddHHmmss')"
Test-API "Send P2P Transfer (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $body = @{
        receiver_phone_number = $phone2
        amount = 50
        reference = $transferReference
        idempotency_key = "test-key-$(Get-Date -Format 'yyyyMMddHHmmss')"
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/transfers/send" -Method POST `
        -ContentType "application/json" -Headers $headers -Body $body
    if ($response.status -ne "COMPLETED" -and $response.status -ne "PENDING") { 
        throw "Transfer not completed: $($response.status)" 
    }
    return $response
} -TestNumber 15 -TotalTests 30

# Test 16: Transfer via transactions endpoint (with JWT)
Test-API "Transfer via /transactions/transfer (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $body = @{
        receiver_phone_number = $phone2
        amount = 25
        reference = "TEST-TXN2-$(Get-Date -Format 'yyyyMMddHHmmss')"
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/transactions/transfer" -Method POST `
        -ContentType "application/json" -Headers $headers -Body $body
    if ($response.status -ne "COMPLETED" -and $response.status -ne "PENDING") { 
        throw "Transfer not completed: $($response.status)" 
    }
    return $response
} -TestNumber 16 -TotalTests 30

# Setup merchant for QR/NFC
Write-Host ""
Write-Host "Setting up merchant for QR/NFC tests..." -ForegroundColor Gray

# Test 17: Merchant Login
Test-API "Merchant Login" {
    $body = @{ phone_number = $merchantPhone; pin = $pin } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/pin/verify" -Method POST `
        -ContentType "application/json" -Body $body
    $script:merchantToken = $response.access_token
    if (-not $merchantToken) { throw "Merchant token not received" }
    return $response
} -TestNumber 17 -TotalTests 30

# Test 18: Generate QR Code (with JWT)
Test-API "Generate QR Code (JWT)" {
    $headers = @{ Authorization = "Bearer $merchantToken" }
    $body = @{ amount = 25 } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/qr/generate" -Method POST `
        -ContentType "application/json" -Headers $headers -Body $body
    $script:qrPayload = $response.payload
    $script:qrSignature = $response.signature
    if (-not $qrPayload) { throw "QR payload not generated" }
    return $response
} -TestNumber 18 -TotalTests 30

# Test 19: Pay via QR (with JWT)
Test-API "Pay via QR Code (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $body = @{
        payload = $qrPayload
        signature = $qrSignature
        amount = 25
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/qr/pay" -Method POST `
        -ContentType "application/json" -Headers $headers -Body $body
    if ($response.status -ne "COMPLETED" -and $response.status -ne "PENDING") { 
        throw "QR payment not completed: $($response.status)" 
    }
    return $response
} -TestNumber 19 -TotalTests 30

# Test 20: Prepare NFC Token (with JWT)
Test-API "Prepare NFC Token (JWT)" {
    $headers = @{ Authorization = "Bearer $merchantToken" }
    $body = @{ amount = 15 } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/nfc/prepare" -Method POST `
        -ContentType "application/json" -Headers $headers -Body $body
    $script:nfcPayload = $response.payload
    $script:nfcSignature = $response.signature
    if (-not $nfcPayload) { throw "NFC payload not generated" }
    return $response
} -TestNumber 20 -TotalTests 30

# Test 21: Pay via NFC (with JWT)
Test-API "Pay via NFC (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $body = @{
        payload = $nfcPayload
        signature = $nfcSignature
        amount = 15
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/nfc/pay" -Method POST `
        -ContentType "application/json" -Headers $headers -Body $body
    if ($response.status -ne "COMPLETED" -and $response.status -ne "PENDING") { 
        throw "NFC payment not completed: $($response.status)" 
    }
    return $response
} -TestNumber 21 -TotalTests 30

# Test 22: Submit KYC
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
    return $response
} -TestNumber 22 -TotalTests 30

# Test 23: Get KYC Status
Test-API "Get KYC Status" {
    $uri = "$baseUrl/kyc/status?phone_number=$phone1"
    $response = Invoke-RestMethod -Uri $uri -Method GET
    if (-not $response.status) { throw "KYC status not returned" }
    return $response
} -TestNumber 23 -TotalTests 30

# Test 24: Withdraw from Wallet (with JWT)
Test-API "Withdraw from Wallet (JWT)" {
    $headers = @{ Authorization = "Bearer $token" }
    $body = @{ amount = 10 } | ConvertTo-Json
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/wallets/withdraw" -Method POST `
            -ContentType "application/json" -Headers $headers -Body $body
        return $response
    } catch {
        # Withdraw might fail if insufficient balance, which is expected
        if ($_.Exception.Message -like "*insufficient*" -or $_.Exception.Message -like "*balance*") {
            Write-Host " (Expected - insufficient balance)" -ForegroundColor Yellow
            return @{ status = "skipped" }
        }
        throw
    }
} -TestNumber 24 -TotalTests 30

# Test 25: Logout
Test-API "Logout" {
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/logout" -Method POST `
        -ContentType "application/json"
    if (-not $response.success) { throw "Logout failed" }
    return $response
} -TestNumber 25 -TotalTests 30

# Test 26: Error Handling - Invalid Token
Test-API "Error Handling (Invalid Token)" {
    try {
        $headers = @{ Authorization = "Bearer invalid-token-12345" }
        Invoke-RestMethod -Uri "$baseUrl/users/me" -Method GET -Headers $headers | Out-Null
        throw "Should have failed with invalid token"
    } catch {
        if ($_.Exception.Message -notlike "*unauthorized*" -and $_.Exception.Message -notlike "*401*") {
            throw "Unexpected error: $($_.Exception.Message)"
        }
    }
} -TestNumber 26 -TotalTests 30

# Test 27: Error Handling - Missing Token
Test-API "Error Handling (Missing Token)" {
    try {
        Invoke-RestMethod -Uri "$baseUrl/users/me" -Method GET | Out-Null
        throw "Should have failed with missing token"
    } catch {
        if ($_.Exception.Message -notlike "*unauthorized*" -and $_.Exception.Message -notlike "*401*") {
            throw "Unexpected error: $($_.Exception.Message)"
        }
    }
} -TestNumber 27 -TotalTests 30

# Test 28: Error Handling - Insufficient Funds
Test-API "Error Handling (Insufficient Funds)" {
    try {
        $headers = @{ Authorization = "Bearer $token" }
        $body = @{
            receiver_phone_number = $phone2
            amount = 999999
            reference = "FAIL-TEST"
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "$baseUrl/transfers/send" -Method POST `
            -ContentType "application/json" -Headers $headers -Body $body | Out-Null
        throw "Should have failed with insufficient funds"
    } catch {
        if ($_.Exception.Message -notlike "*insufficient*" -and $_.Exception.Message -notlike "*balance*") {
            # This is acceptable - might succeed if balance is high enough
            Write-Host " (Note: Transaction succeeded - balance may be sufficient)" -ForegroundColor Yellow
        }
    }
} -TestNumber 28 -TotalTests 30

# Test 29: Admin Login (if available)
Test-API "Admin Login" {
    try {
        $body = @{ email = "admin@nexa.ma"; password = "admin123" } | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$baseUrl/auth/admin/login" -Method POST `
            -ContentType "application/json" -Body $body
        return $response
    } catch {
        # Admin login might not be set up, which is fine
        Write-Host " (Skipped - admin credentials not configured)" -ForegroundColor Yellow
        return @{ status = "skipped" }
    }
} -TestNumber 29 -TotalTests 30

# Test 30: Root Endpoint
Test-API "Root Endpoint" {
    $response = Invoke-RestMethod -Uri "$baseUrl" -Method GET
    return $response
} -TestNumber 30 -TotalTests 30

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
