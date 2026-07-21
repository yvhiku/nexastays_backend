# Service Complexity Metrics

Services >300 lines in launch scope. **Recommendation:** split Very High before adding features.

| Service | Path | Lines | Methods | Repo/DB | HTTP | TX blocks | Complexity | Recommendation |
|---------|------|-------|---------|---------|------|-----------|------------|----------------|
| StaysService | `stays/stays.service.ts` | 1127 | 13 | 26 | 2 | 1 | **Very High** | Split: booking, explore/public, host blocks |
| AdminStaysService | `admin/admin-stays.service.ts` | 1020 | 19 | 77 | 0 | 0 | **Very High** | Split ops dashboard vs listing lifecycle |
| CalendarSyncService | `stays/services/calendar-sync.service.ts` | 854 | 10 | 34 | 1 | 2 | **High** | OK for v1; monitor |
| HostListingsService | `stays/services/host-listings.service.ts` | 824 | 12 | 23 | 1 | 3 | **High** | OK |
| ExploreService | `stays/explore/explore.service.ts` | 776 | 2 | 6 | 0 | 0 | **Medium** | 2 huge methods — extract query builders |
| MessagesService | `messaging/messages.service.ts` | 444 | 4 | 15 | 0 | 3 | **Medium** | OK |
| StaysPaymentsService | `stays/payments/stays-payments.service.ts` | 318 | 3 | 14 | 0 | 1 | **Medium** | Critical path — add tests |
| UsersService | `identity/modules/users/users.service.ts` | ~800+ | 20+ | 40+ | 1 | several | **Very High** | Split profile vs admin vs notifications |

**AdminStaysService.getOpsOverview()** alone ~445 lines with 30+ parallel DB calls — scale risk at ops load.
