import {
  computeSupportSla,
  suggestRouting,
  slaStateFor,
  SUPPORT_SLA,
} from './support-sla.config';

describe('SUPPORT_SLA + computeSupportSla', () => {
  const created = new Date('2026-08-01T00:00:00.000Z');

  it('exposes locked priority thresholds', () => {
    expect(SUPPORT_SLA.URGENT).toEqual({
      firstResponseHours: 1,
      resolutionHours: 8,
    });
    expect(SUPPORT_SLA.LOW.resolutionHours).toBe(120);
  });

  it('marks incomplete first-response AT_RISK near end of window', () => {
    // NORMAL first response = 12h; 80% = 9.6h
    const now = new Date(created.getTime() + 10 * 60 * 60 * 1000);
    const sla = computeSupportSla(
      {
        createdAt: created,
        priority: 'NORMAL',
        firstAdminResponseAt: null,
        resolvedAt: null,
      },
      now,
    );
    expect(sla.firstResponse.state).toBe('AT_RISK');
  });

  it('marks completed first response ON_TRACK when before target', () => {
    const responded = new Date(created.getTime() + 30 * 60 * 1000);
    const sla = computeSupportSla(
      {
        createdAt: created,
        priority: 'URGENT',
        firstAdminResponseAt: responded,
        resolvedAt: null,
      },
      new Date(created.getTime() + 2 * 60 * 60 * 1000),
    );
    expect(sla.firstResponse.state).toBe('ON_TRACK');
    expect(sla.firstResponse.completedAt).toBe(responded.toISOString());
  });

  it('marks first-resolution BREACHED when resolved after target', () => {
    const resolved = new Date(created.getTime() + 10 * 60 * 60 * 1000);
    const sla = computeSupportSla(
      {
        createdAt: created,
        priority: 'URGENT',
        firstAdminResponseAt: new Date(created.getTime() + 10 * 60 * 1000),
        resolvedAt: resolved,
      },
      new Date(),
    );
    expect(sla.resolution.state).toBe('BREACHED');
  });

  it('slaStateFor treats completion after target as BREACHED', () => {
    const target = new Date(created.getTime() + 3600_000);
    const completed = new Date(created.getTime() + 7200_000);
    expect(slaStateFor(created, target, completed, new Date())).toBe('BREACHED');
  });
});

describe('suggestRouting', () => {
  it('suggests HIGH for safety-linked tickets', () => {
    expect(
      suggestRouting({
        category: 'OTHER',
        currentPriority: 'LOW',
        hasSafetyIssueId: true,
      }).suggestedPriority,
    ).toBe('HIGH');
  });

  it('never downgrades URGENT', () => {
    expect(
      suggestRouting({
        category: 'LISTING',
        currentPriority: 'URGENT',
      }).suggestedPriority,
    ).toBe('URGENT');
  });
});
