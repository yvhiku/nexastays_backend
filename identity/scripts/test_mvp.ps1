$ErrorActionPreference = "Stop"

$baseUrl = "http://localhost:3000/api/v1"
$sender = "+212612345678"
$receiver = "+212698765432"

Write-Host "1) Send OTP (demo)"
Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/otp/send" -ContentType "application/json" -Body (@{ phone_number = $sender } | ConvertTo-Json)

Write-Host "2) Verify OTP (demo)"
Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/otp/verify" -ContentType "application/json" -Body (@{ phone_number = $sender; otp = "123456" } | ConvertTo-Json)

Write-Host "3) Verify PIN (demo JWT)"
$pinResp = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/pin/verify" -ContentType "application/json" -Body (@{ phone_number = $sender; pin = "123456" } | ConvertTo-Json)
Write-Host "Token issued: $($pinResp.access_token)"

Write-Host "4) Transfer 10 MAD"
Invoke-RestMethod -Method Post -Uri "$baseUrl/transfers/send" -ContentType "application/json" -Body (@{
  sender_phone_number = $sender
  receiver_phone_number = $receiver
  amount = 10
  reference = "TEST_TRANSFER_001"
  idempotency_key = "transfer-001"
} | ConvertTo-Json)

Write-Host "5) Insufficient funds test (expect error)"
try {
  Invoke-RestMethod -Method Post -Uri "$baseUrl/transfers/send" -ContentType "application/json" -Body (@{
    sender_phone_number = $sender
    receiver_phone_number = $receiver
    amount = 999999
    reference = "TEST_TRANSFER_FAIL"
  } | ConvertTo-Json)
} catch {
  Write-Host "Expected failure: $($_.Exception.Message)"
}

Write-Host "6) Max single transfer limit test (expect error)"
try {
  Invoke-RestMethod -Method Post -Uri "$baseUrl/transfers/send" -ContentType "application/json" -Body (@{
    sender_phone_number = $sender
    receiver_phone_number = $receiver
    amount = 9999
    reference = "TEST_TRANSFER_LIMIT"
  } | ConvertTo-Json)
} catch {
  Write-Host "Expected failure: $($_.Exception.Message)"
}

Write-Host "7) QR expiration test"
$qr = Invoke-RestMethod -Method Post -Uri "$baseUrl/qr/generate" -ContentType "application/json" -Body (@{
  merchant_phone_number = $receiver
  amount = 5
} | ConvertTo-Json)

Write-Host "Generated QR payload. To simulate expiration, update DB:"
Write-Host "UPDATE qr_payments SET expires_at = NOW() - interval '1 minute' WHERE payload = '$($qr.payload)';"
Write-Host "Then call /qr/pay to verify expiry handling."

