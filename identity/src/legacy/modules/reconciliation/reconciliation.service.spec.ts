import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService', () => {
  const ledgerEntryRepository = {
    createQueryBuilder: jest.fn(),
  };
  const ledgerAccountRepository = {
    createQueryBuilder: jest.fn(),
  };
  const reconciliationIssueRepository = {
    save: jest.fn(),
  };
  const riskAlertRepository = {
    save: jest.fn(),
  };
  const auditService = {
    audit: jest.fn().mockResolvedValue(undefined),
  };

  let service: ReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
    reconciliationIssueRepository.save.mockResolvedValue({
      id: 'issue-1',
      report_date: '2026-02-26',
      issue_type: 'IMBALANCE',
      severity: 'HIGH',
      description: 'mismatch',
      status: 'OPEN',
      metadata: { debit_total: 120, credit_total: 90, difference: 30 },
      created_at: new Date('2026-02-27T00:05:00.000Z'),
      updated_at: new Date('2026-02-27T00:05:00.000Z'),
    });
    riskAlertRepository.save.mockResolvedValue({});
    service = new ReconciliationService(
      ledgerEntryRepository as never,
      ledgerAccountRepository as never,
      reconciliationIssueRepository as never,
      riskAlertRepository as never,
      auditService as never,
    );
  });

  it('creates reconciliation issue when debit and credit are imbalanced', async () => {
    jest
      .spyOn(service as never, 'calculateDailySums')
      .mockResolvedValue({
        debit_total: 120,
        credit_total: 90,
        difference: 30,
      });
    jest
      .spyOn(service as never, 'countOrphanLedgerEntries')
      .mockResolvedValue(0);
    jest
      .spyOn(service as never, 'findUnauthorizedNegativeBalances')
      .mockResolvedValue([]);

    const report = await service.runReconciliationForDate(
      new Date('2026-02-26T12:00:00.000Z'),
    );

    expect(report.checks.debits_equal_credits).toBe(false);
    expect(report.issue_count).toBe(1);
    expect(reconciliationIssueRepository.save).toHaveBeenCalledTimes(1);
    expect(riskAlertRepository.save).toHaveBeenCalledTimes(1);
    expect(auditService.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RECONCILIATION_ISSUE_CREATED',
        targetType: 'RECONCILIATION_ISSUE',
      }),
    );
  });
});
