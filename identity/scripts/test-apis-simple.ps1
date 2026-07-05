# NexaPay Backend API - Simple Testing Script
# Tests all API endpoints with proper JWT authentication

$ErrorActionPreference = "Continue"

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

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [scriptblock]$Validator = $null
    )
    
    Write-Host "Testing: $Name..." -ForegroundColor Yellow -NoNewline
    try {
        $params = @{
            Uri = $Uri
            Method = $Method
            Headers = $Headers
            ContentType = "application/json"
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            if ($Body -is [hashtable]) {
                $params.Body = ($Body | ConvertTo-Json)
            } else {
                $params.Body = $Body
            }
        }
        
        $response = Invoke-RestMethod @params
        
        # Handle response wrapped in 'data' field (from TransformInterceptor)
        if ($response.data) {
            $actualResponse = $response.data
        } else {
            $actualResponse = $response
        }
        
        if ($Validator) {
            $validationResult = & $Validator $actualResponse
            if (-not $validationResult) {
                throw "Validation failed"
            }
        }
        
        Write-Host " PASSED" -ForegroundColor Green
        $script:passed++
        $script:testResults += @{ Name = $Name; Status = "PASSED" }
        return $actualResponse
    } catch {
        Write-Host " FAILED" -ForegroundColor Red
        $errorMsg = $_.Exception.Message
        Write-Host "  Error: $errorMsg" -ForegroundColor Red
        $script:failed++
        $script:testResults += @{ Name = $Name; Status = "FAILED"; Error = $errorMsg }
        return $null
    }
}

Write-Host ""
Write-Host "=== NexaPay Backend API Testing ===" -ForegroundColor Cyan
Write-Host "Base URL: $baseUrl" -ForegroundColor Gray
Write-Host ""

$testNum = 0
$totalTests = 30

# Test 1: Health Check
$testNum++
$healthResult = Test-Endpoint -Name "[$testNum/$totalTests] Health Check" `
    -Method "GET" `
    -Uri "$baseUrl/health" `
    -Headers @{} `
    -Validator { param($r) $r.status -eq "ok" }

# Test 2: Send OTP
$testNum++
$result = Test-Endpoint -Name "[$testNum/$totalTests] Send OTP" `
    -Method "POST" `
    -Uri "$baseUrl/auth/otp/send" `
    -Body @{ phone_number = $phone1 } `
    -Validator { param($r) $r.sent -eq $true }

# Test 3: Verify OTP
$testNum++
$otpResult = Test-Endpoint -Name "[$testNum/$totalTests] Verify OTP" `
    -Method "POST" `
    -Uri "$baseUrl/auth/otp/verify" `
    -Body @{ phone_number = $phone1; otp = $otp } `
    -Validator { 
        param($r) 
        if ($r.verified -and $r.otp_session_token) {
            $script:otpSessionToken = $r.otp_session_token
            return $true
        }
        return $false
    }

# Test 4: Set PIN
if ($otpSessionToken) {
    $testNum++
    Test-Endpoint -Name "[$testNum/$totalTests] Set PIN" `
        -Method "POST" `
        -Uri "$baseUrl/auth/pin/set" `
        -Body @{ otp_session_token = $otpSessionToken; pin = $pin } `
        -Validator { param($r) $r.success -eq $true }
} else {
    Write-Host "[$testNum/$totalTests] Set PIN... SKIPPED (no OTP session token)" -ForegroundColor Yellow
    $testNum++
}

# Test 5: Verify PIN and Get JWT
$testNum++
$result = Test-Endpoint -Name "[$testNum/$totalTests] Verify PIN (Get JWT)" `
    -Method "POST" `
    -Uri "$baseUrl/auth/pin/verify" `
    -Body @{ phone_number = $phone1; pin = $pin } `
    -Validator { 
        param($r) 
        if ($r.access_token) {
            $script:token = $r.access_token
            return $true
        }
        return $false
    }

if (-not $token) {
    Write-Host ""
    Write-Host "ERROR: Could not obtain JWT token. Cannot continue with authenticated tests." -ForegroundColor Red
    exit 1
}

$authHeaders = @{ Authorization = "Bearer $token" }

# Test 6: Get User Profile
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Get User Profile" `
    -Method "GET" `
    -Uri "$baseUrl/users/me" `
    -Headers $authHeaders `
    -Validator { param($r) $null -ne $r.id }

# Test 7: Update Profile
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Update Profile" `
    -Method "PATCH" `
    -Uri "$baseUrl/users/profile" `
    -Headers $authHeaders `
    -Body @{ 
        full_name = "Ahmed Benali Test"
        email = "test@nexa.ma"
        nationality = "MA"
    } `
    -Validator { param($r) $null -ne $r.id }

# Test 8: Get Wallet Info
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Get Wallet Info" `
    -Method "GET" `
    -Uri "$baseUrl/wallets/me" `
    -Headers $authHeaders `
    -Validator { param($r) $null -ne $r.id }

# Test 9: Get Wallet Balance
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Get Wallet Balance" `
    -Method "GET" `
    -Uri "$baseUrl/wallets/balance" `
    -Headers $authHeaders `
    -Validator { param($r) $null -ne $r.balance }

# Test 10: Top Up Wallet
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Top Up Wallet" `
    -Method "POST" `
    -Uri "$baseUrl/wallets/topup" `
    -Headers $authHeaders `
    -Body @{ amount = 100 } `
    -Validator { param($r) $null -ne $r.id }

# Test 11: Get Transaction History
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Get Transaction History" `
    -Method "GET" `
    -Uri "$baseUrl/transactions/history" `
    -Headers $authHeaders

# Test 12: Get Transactions
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Get Transactions" `
    -Method "GET" `
    -Uri "$baseUrl/transactions" `
    -Headers $authHeaders

# Setup second user
Write-Host ""
Write-Host "Setting up second user..." -ForegroundColor Gray

# Test 13: Send OTP User 2
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Send OTP (User 2)" `
    -Method "POST" `
    -Uri "$baseUrl/auth/otp/send" `
    -Body @{ phone_number = $phone2 }

# Test 14: Verify OTP User 2
$testNum++
$result = Test-Endpoint -Name "[$testNum/$totalTests] Verify OTP (User 2)" `
    -Method "POST" `
    -Uri "$baseUrl/auth/otp/verify" `
    -Body @{ phone_number = $phone2; otp = $otp }

if ($result -and $result.otp_session_token) {
    Test-Endpoint -Name "Set PIN (User 2)" `
        -Method "POST" `
        -Uri "$baseUrl/auth/pin/set" `
        -Body @{ otp_session_token = $result.otp_session_token; pin = $pin }
}

# Test 15: Send P2P Transfer
$testNum++
$transferRef = "TEST-TXN-$(Get-Date -Format 'yyyyMMddHHmmss')"
Test-Endpoint -Name "[$testNum/$totalTests] Send P2P Transfer" `
    -Method "POST" `
    -Uri "$baseUrl/transfers/send" `
    -Headers $authHeaders `
    -Body @{
        receiver_phone_number = $phone2
        amount = 50
        reference = $transferRef
        idempotency_key = "test-key-$(Get-Date -Format 'yyyyMMddHHmmss')"
    }

# Test 16: Transfer via transactions endpoint
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Transfer via /transactions/transfer" `
    -Method "POST" `
    -Uri "$baseUrl/transactions/transfer" `
    -Headers $authHeaders `
    -Body @{
        receiver_phone_number = $phone2
        amount = 25
        reference = "TEST-TXN2-$(Get-Date -Format 'yyyyMMddHHmmss')"
    }

# Setup merchant
Write-Host ""
Write-Host "Setting up merchant..." -ForegroundColor Gray

# Test 17: Merchant Login
$testNum++
$result = Test-Endpoint -Name "[$testNum/$totalTests] Merchant Login" `
    -Method "POST" `
    -Uri "$baseUrl/auth/pin/verify" `
    -Body @{ phone_number = $merchantPhone; pin = $pin } `
    -Validator {
        param($r)
        if ($r.access_token) {
            $script:merchantToken = $r.access_token
            return $true
        }
        return $false
    }

$merchantHeaders = @{ Authorization = "Bearer $merchantToken" }

# Test 18: Generate QR Code
$testNum++
$result = Test-Endpoint -Name "[$testNum/$totalTests] Generate QR Code" `
    -Method "POST" `
    -Uri "$baseUrl/qr/generate" `
    -Headers $merchantHeaders `
    -Body @{ amount = 25 } `
    -Validator {
        param($r)
        if ($r.payload -and $r.signature) {
            $script:qrPayload = $r.payload
            $script:qrSignature = $r.signature
            return $true
        }
        return $false
    }

# Test 19: Pay via QR
if ($qrPayload -and $qrSignature) {
    $testNum++
    Test-Endpoint -Name "[$testNum/$totalTests] Pay via QR" `
        -Method "POST" `
        -Uri "$baseUrl/qr/pay" `
        -Headers $authHeaders `
        -Body @{
            payload = $qrPayload
            signature = $qrSignature
            amount = 25
        }
} else {
    Write-Host "[$testNum/$totalTests] Pay via QR... SKIPPED" -ForegroundColor Yellow
    $testNum++
}

# Test 20: Prepare NFC Token
$testNum++
$result = Test-Endpoint -Name "[$testNum/$totalTests] Prepare NFC Token" `
    -Method "POST" `
    -Uri "$baseUrl/nfc/prepare" `
    -Headers $merchantHeaders `
    -Body @{ amount = 15 } `
    -Validator {
        param($r)
        if ($r.payload -and $r.signature) {
            $script:nfcPayload = $r.payload
            $script:nfcSignature = $r.signature
            return $true
        }
        return $false
    }

# Test 21: Pay via NFC
if ($nfcPayload -and $nfcSignature) {
    $testNum++
    Test-Endpoint -Name "[$testNum/$totalTests] Pay via NFC" `
        -Method "POST" `
        -Uri "$baseUrl/nfc/pay" `
        -Headers $authHeaders `
        -Body @{
            payload = $nfcPayload
            signature = $nfcSignature
            amount = 15
        }
} else {
    Write-Host "[$testNum/$totalTests] Pay via NFC... SKIPPED" -ForegroundColor Yellow
    $testNum++
}

# Test 22: Submit KYC
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Submit KYC" `
    -Method "POST" `
    -Uri "$baseUrl/kyc/submit" `
    -Body @{
        phone_number = $phone1
        documents = @{
            id_document = $true
            selfie = $true
        }
    } `
    -Validator { param($r) $null -ne $r.user_id }

# Test 23: Get KYC Status
$testNum++
$kycUri = "$baseUrl/kyc/status?phone_number=$phone1"
Test-Endpoint -Name "[$testNum/$totalTests] Get KYC Status" `
    -Method "GET" `
    -Uri $kycUri `
    -Validator { param($r) $null -ne $r.status }

# Test 24: Withdraw from Wallet
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Withdraw from Wallet" `
    -Method "POST" `
    -Uri "$baseUrl/wallets/withdraw" `
    -Headers $authHeaders `
    -Body @{ amount = 10 }

# Test 25: Logout
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Logout" `
    -Method "POST" `
    -Uri "$baseUrl/auth/logout"

# Test 26: Error Handling - Invalid Token
$testNum++
Write-Host "[$testNum/$totalTests] Error Handling (Invalid Token)..." -ForegroundColor Yellow -NoNewline
try {
    $badHeaders = @{ Authorization = "Bearer invalid-token-12345" }
    Invoke-RestMethod -Uri "$baseUrl/users/me" -Method GET -Headers $badHeaders -ErrorAction Stop | Out-Null
    Write-Host " FAILED (should have rejected)" -ForegroundColor Red
    $script:failed++
} catch {
    Write-Host " PASSED" -ForegroundColor Green
    $script:passed++
}

# Test 27: Error Handling - Missing Token
$testNum++
Write-Host "[$testNum/$totalTests] Error Handling (Missing Token)..." -ForegroundColor Yellow -NoNewline
try {
    Invoke-RestMethod -Uri "$baseUrl/users/me" -Method GET -ErrorAction Stop | Out-Null
    Write-Host " FAILED (should have rejected)" -ForegroundColor Red
    $script:failed++
} catch {
    Write-Host " PASSED" -ForegroundColor Green
    $script:passed++
}

# Test 28: Admin Login
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Admin Login" `
    -Method "POST" `
    -Uri "$baseUrl/auth/admin/login" `
    -Body @{ email = "admin@nexa.ma"; password = "admin123" }

# Test 29: Root Endpoint
$testNum++
Test-Endpoint -Name "[$testNum/$totalTests] Root Endpoint" `
    -Method "GET" `
    -Uri "$baseUrl"

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
    Write-Host "All tests passed!" -ForegroundColor Green
    Write-Host ""
    exit 0
}
