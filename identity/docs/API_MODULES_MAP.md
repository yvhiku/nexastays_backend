# Nexa Backend — API + Modules Map

**Base URL:** `/api/v1`  
**Generated:** Phase 1 inventory (pre-refactor)

---

## 1. Modules under `src/modules` (current)

| Module | Path | Domain | Notes |
|--------|------|--------|-------|
| AuthModule | `modules/auth` | **Nexa Pay** | OTP, PIN, JWT, admin login |
| UsersModule | `modules/users` | **Nexa Pay** | Profile, registration |
| WalletsModule | `modules/wallets` | **Nexa Pay** | Balance, topup, withdraw, transfer |
| LedgerModule | `modules/ledger` | **Nexa Pay** | Ledger (controller has no routes) |
| TransactionsModule | `modules/transactions` | **Nexa Pay** | History, transfer |
| ComplianceModule | `modules/compliance` | **Nexa Pay** | KYC submit, status, document upload |
| AuditModule | `modules/audit` | **Nexa Pay** | Audit (controller has no routes) |
| AdminModule | `modules/admin` | **Nexa Pay** | Dashboard, users, KYC, transactions, wallets, risk, support, finance, system, audit |
| QrModule | `modules/qr` | **Nexa Pay** | QR generate, pay |
| NfcModule | `modules/nfc` | **Nexa Pay** | NFC prepare, pay |
| GoTaxiModule | `modules/go-taxi` | **Nexa Go Taxi** | Rides, drivers, commissions, matching, pricing |
| GoDeliveryModule | `modules/go-delivery` | **Nexa Go Delivery** | Orders, menus, merchants, couriers, restaurants, pricing, payouts |

**Unused / duplicate:** `modules/core/*` (auth, users, wallets, ledger, transactions, qr, nfc, compliance, audit) — not imported in `AppModule`; only seed script references `core/users`, `core/wallets`.  
**Legacy:** `modules/go-taxi/delivery/entities` — DeliveryOrder, CourierAvailability kept for DB schema; delivery API uses GoDeliveryModule.

---

## 2. Controllers and routes

### A) Nexa Pay

| Controller | Route prefix | Method | Path | Description |
|------------|--------------|--------|------|-------------|
| AppController | (root) | GET | / | Hello |
| AppController | (root) | GET | /health | Health check |
| AuthController | auth | POST | /auth/login | Login |
| AuthController | auth | POST | /auth/send-otp | Send OTP |
| AuthController | auth | POST | /auth/otp/send | Send OTP (alias) |
| AuthController | auth | POST | /auth/verify-otp | Verify OTP |
| AuthController | auth | POST | /auth/otp/verify | Verify OTP (alias) |
| AuthController | auth | POST | /auth/pin/set | Set PIN |
| AuthController | auth | POST | /auth/verify-pin | Verify PIN |
| AuthController | auth | POST | /auth/pin/verify | Verify PIN (alias) |
| AuthController | auth | POST | /auth/logout | Logout |
| AuthController | auth | POST | /auth/admin/login | Admin login |
| UsersController | users | POST | /users | Create user |
| UsersController | users | GET | /users/me | Current user |
| UsersController | users | PATCH | /users/profile | Update profile |
| WalletsController | wallets | GET | /wallets/me | My wallet |
| WalletsController | wallets | GET | /wallets/balance | Balance |
| WalletsController | wallets | GET | /wallets/debug | Debug (dev) |
| WalletsController | wallets | POST | /wallets/transfer-to-consumer | Transfer to consumer |
| WalletsController | wallets | POST | /wallets/topup | Top up |
| WalletsController | wallets | POST | /wallets/withdraw | Withdraw |
| LedgerController | ledger | — | /ledger | No routes |
| TransactionsController | transactions | GET | /transactions/history | Transaction history |
| TransactionsController | transactions | GET | /transactions | List transactions |
| TransactionsController | transactions | POST | /transactions/transfer | Transfer |
| TransfersController | transfers | POST | /transfers/send | Send transfer |
| ComplianceController | kyc | POST | /kyc/submit | Submit KYC |
| ComplianceController | kyc | GET | /kyc/status | KYC status |
| ComplianceController | kyc | POST | /kyc/upload/document | Upload document |
| ComplianceController | kyc | POST | /kyc/upload/selfie | Upload selfie |
| ComplianceController | kyc | GET | /kyc/files/:userId/:filename | Get KYC file |
| AuditController | audit | — | /audit | No routes |
| QrController | qr | POST | /qr/generate | Generate QR |
| QrController | qr | POST | /qr/pay | Pay via QR |
| NfcController | nfc | POST | /nfc/prepare | Prepare NFC |
| NfcController | nfc | POST | /nfc/pay | Pay via NFC |
| AdminDashboardController | admin/dashboard | GET | /admin/dashboard/stats | Dashboard stats |
| AdminUsersController | admin/users | GET | /admin/users | List users |
| AdminUsersController | admin/users | GET | /admin/users/check-driver-courier-consumer | Check account types |
| AdminUsersController | admin/users | GET | /admin/users/:id | User by ID |
| AdminUsersController | admin/users | GET | /admin/users/:id/wallet | User wallet |
| AdminUsersController | admin/users | GET | /admin/users/:id/kyc | User KYC |
| AdminUsersController | admin/users | PATCH | /admin/users/:id/status | Update user status |
| AdminUsersController | admin/users | POST | /admin/users/:userId/freeze | Freeze user |
| AdminUsersController | admin/users | POST | /admin/users/:userId/unfreeze | Unfreeze user |
| AdminKycController | admin/kyc | GET | /admin/kyc/applications | KYC applications |
| AdminKycController | admin/kyc | GET | /admin/kyc/:id | KYC by ID |
| AdminKycController | admin/kyc | POST | /admin/kyc/:userId/approve | Approve KYC |
| AdminKycController | admin/kyc | POST | /admin/kyc/:userId/reject | Reject KYC |
| AdminTransactionsController | admin/transactions | GET | /admin/transactions | List transactions |
| AdminTransactionsController | admin/transactions | GET | /admin/transactions/export | Export |
| AdminTransactionsController | admin/transactions | GET | /admin/transactions/:id | Transaction by ID |
| AdminTransactionsController | admin/transactions | POST | /admin/transactions/:id/reverse | Reverse transaction |
| AdminWalletsController | admin/wallets | GET | /admin/wallets | List wallets |
| AdminWalletsController | admin/wallets | GET | /admin/wallets/:id | Wallet by ID |
| AdminWalletsController | admin/wallets | GET | /admin/wallets/:id/ledger | Wallet ledger |
| AdminRiskController | admin/risk | GET | /admin/risk/alerts | Risk alerts |
| AdminRiskController | admin/risk | GET | /admin/risk/stats | Risk stats |
| AdminRiskController | admin/risk | POST | /admin/risk/alerts/:alertId/escalate | Escalate alert |
| AdminRiskController | admin/risk | POST | /admin/risk/transactions/:transactionId/flag | Flag transaction |
| AdminSupportController | admin/support | GET | /admin/support/tickets | Support tickets |
| AdminSupportController | admin/support | GET | /admin/support/tickets/:id | Ticket by ID |
| AdminSupportController | admin/support | GET | /admin/support/refunds | Refunds |
| AdminSupportController | admin/support | GET | /admin/support/refunds/:id | Refund by ID |
| AdminFinanceController | admin/finance | GET | /admin/finance/revenue | Revenue |
| AdminFinanceController | admin/finance | GET | /admin/finance/commissions | Commissions |
| AdminFinanceController | admin/finance | GET | /admin/finance/driver-payouts | Driver payouts |
| AdminFinanceController | admin/finance | GET | /admin/finance/merchant-settlements | Merchant settlements |
| AdminSystemController | admin/system | GET | /admin/system/accounts | Accounts |
| AdminSystemController | admin/system | GET | /admin/system/feature-flags | Feature flags |
| AdminSystemController | admin/system | PATCH | /admin/system/feature-flags/:key | Update feature flag |
| AdminAuditController | admin/audit | GET | /admin/audit/logs | Audit logs |
| AdminAuditController | admin/audit | GET | /admin/audit/logs/export | Export logs |

### B) Nexa Go

| Controller | Route prefix | Method | Path | Description |
|------------|--------------|--------|------|-------------|
| RidesController (go) | go | POST | /go/rides | Create ride |
| RidesController (go) | go | PATCH | /go/rides/:id/accept | Accept ride |
| RidesController (go) | go | PATCH | /go/rides/:id/arrive | Arrive |
| RidesController (go) | go | PATCH | /go/rides/:id/start | Start ride |
| RidesController (go) | go | PATCH | /go/rides/:id/complete | Complete ride |
| RidesController (go) | go | GET | /go/rides | List rides |
| RidesController (go) | go | GET | /go/rides/:id | Ride by ID |
| DriversController | go/drivers | GET | /go/drivers | List drivers |
| DriversController | go/drivers | GET | /go/drivers/:id | Driver by ID |
| DriversController | go/drivers | POST | /go/drivers/onboard | Onboard driver |
| DriversController | go/drivers | POST | /go/drivers/online | Set online |
| DriversController | go/drivers | POST | /go/drivers/offline | Set offline |
| OrdersController | go/delivery/orders | POST | /go/delivery/orders | Create order |
| OrdersController | go/delivery/orders | GET | /go/delivery/orders/customer | Customer orders |
| OrdersController | go/delivery/orders | GET | /go/delivery/orders/my | My orders |
| OrdersController | go/delivery/orders | GET | /go/delivery/orders/merchant | Merchant orders |
| OrdersController | go/delivery/orders | GET | /go/delivery/orders | List orders |
| OrdersController | go/delivery/orders | GET | /go/delivery/orders/available | Available orders |
| OrdersController | go/delivery/orders | GET | /go/delivery/orders/my-orders | My orders (courier) |
| OrdersController | go/delivery/orders | GET | /go/delivery/orders/assigned | Assigned orders |
| OrdersController | go/delivery/orders | GET | /go/delivery/orders/history | History |
| OrdersController | go/delivery/orders | GET | /go/delivery/orders/:id | Order by ID |
| OrdersController | go/delivery/orders | POST | /go/delivery/orders/:id/cancel | Cancel order |
| OrdersController | go/delivery/orders | POST | /go/delivery/orders/:id/prepare | Prepare (merchant) |
| OrdersController | go/delivery/orders | POST | /go/delivery/orders/:id/ready | Ready (merchant) |
| OrdersController | go/delivery/orders | POST | /go/delivery/orders/:id/accept | Accept (courier) |
| OrdersController | go/delivery/orders | POST | /go/delivery/orders/:id/pickup | Pickup (courier) |
| OrdersController | go/delivery/orders | POST | /go/delivery/orders/:id/deliver | Deliver (courier) |
| MenusController | go/delivery/menus | GET | /go/delivery/menus/merchant/:merchantId | Menu by merchant |
| MenusController | go/delivery/menus | POST | /go/delivery/menus | Create menu |
| MenusController | go/delivery/menus | POST | /go/delivery/menus/items | Add menu item |
| MerchantsController | go/delivery/merchants | GET | /go/delivery/merchants | List merchants |
| MerchantsController | go/delivery/merchants | POST | /go/delivery/merchants/onboard | Onboard merchant |
| MerchantsController | go/delivery/merchants | GET | /go/delivery/merchants/me | Current merchant |
| RestaurantsController | go/delivery/restaurants | GET | /go/delivery/restaurants | List restaurants |
| RestaurantsController | go/delivery/restaurants | GET | /go/delivery/restaurants/:id/menu | Restaurant menu |
| CouriersController | go/delivery/couriers | POST | /go/delivery/couriers/onboard | Onboard courier |
| CouriersController | go/delivery/couriers | POST | /go/delivery/couriers/online | Set online |

---

## 3. Cross-cutting / shared

- **Auth:** JWT strategy, guards (JwtAuthGuard, RolesGuard, AccountTypeGuard), decorators (CurrentUser, Roles, Public, AccountType).
- **Users:** Shared entity used by Pay (profile, KYC) and Go (driver/courier/consumer accounts).
- **Database:** Single DatabaseModule; entities for Pay + Go in one TypeORM config.
- **Config:** `src/config` (app, database).
- **Common:** `src/common` — decorators, dto (pagination), filters (HttpExceptionFilter), guards, interceptors (TransformInterceptor).

---

## 4. Domain boundary (target after refactor)

```
src/
  domains/
    pay/
      auth/
      users/
      wallets/
      ledger/
      transactions/
      kyc/          (compliance)
      admin/
      qr/
      nfc/
    go/
      rides/
      drivers/
      deliveries/   (go-delivery: orders, menus, merchants, couriers, restaurants, pricing, payouts)
      dispatch/     (if any; else omit)
      pricing/
      tracking/     (if any; else omit)
  common/
    config/
    database/
    guards/
    interceptors/
    filters/
    pipes/
    utils/
    dto/
    constants/
```

---

## 5. Route prefix plan (Phase 2)

- **Current:** All under `/api/v1` (no domain prefix).
- **New (with aliases):**
  - Nexa Pay: `/api/v1/pay/*` (e.g. `/api/v1/pay/auth/login`). Keep `/api/v1/auth/login` as alias.
  - Nexa Go: `/api/v1/go/*` (already partially prefixed: `/api/v1/go/rides`, `/api/v1/go/delivery/orders`). Keep existing paths as aliases.
