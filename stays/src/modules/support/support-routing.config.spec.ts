import {
  calculateRoutingScore,
  emptyWorkload,
  isSupportAutoAssignEnabled,
  maxActiveTicketsPerAgent,
  pickSkillTier,
  selectBestAgent,
  SUPPORT_MAX_ACTIVE_TICKETS_PER_AGENT_DEFAULT,
  type RoutingAgentWorkload,
} from './support-routing.config';

function workload(
  agentId: string,
  partial: Partial<RoutingAgentWorkload>,
): RoutingAgentWorkload {
  return { ...emptyWorkload(agentId), ...partial, agentId };
}

describe('support routing score + selectBestAgent', () => {
  const originalAuto = process.env.SUPPORT_AUTO_ASSIGN;
  const originalMax = process.env.SUPPORT_MAX_ACTIVE_TICKETS_PER_AGENT;

  afterEach(() => {
    if (originalAuto === undefined) delete process.env.SUPPORT_AUTO_ASSIGN;
    else process.env.SUPPORT_AUTO_ASSIGN = originalAuto;
    if (originalMax === undefined) {
      delete process.env.SUPPORT_MAX_ACTIVE_TICKETS_PER_AGENT;
    } else {
      process.env.SUPPORT_MAX_ACTIVE_TICKETS_PER_AGENT = originalMax;
    }
  });

  it('defaults auto-assign on and capacity 20', () => {
    delete process.env.SUPPORT_AUTO_ASSIGN;
    delete process.env.SUPPORT_MAX_ACTIVE_TICKETS_PER_AGENT;
    expect(isSupportAutoAssignEnabled()).toBe(true);
    expect(maxActiveTicketsPerAgent()).toBe(
      SUPPORT_MAX_ACTIVE_TICKETS_PER_AGENT_DEFAULT,
    );
  });

  it('scores the plan example so Agent C wins despite more active tickets', () => {
    const a = workload('agent-a', {
      assigned: 4,
      inProgress: 2,
      waiting: 1,
    });
    const b = workload('agent-b', {
      assigned: 3,
      inProgress: 1,
      waiting: 2,
      atRisk: 1,
    });
    const c = workload('agent-c', { assigned: 5, inProgress: 1 });
    expect(calculateRoutingScore(a)).toBe(7.5);
    expect(calculateRoutingScore(b)).toBe(9.5);
    expect(calculateRoutingScore(c)).toBe(6.5);

    const picked = selectBestAgent({
      agentIds: ['agent-a', 'agent-b', 'agent-c'],
      workloads: new Map([
        ['agent-a', a],
        ['agent-b', b],
        ['agent-c', c],
      ]),
      lastAssignedAt: new Map(),
      priority: 'NORMAL',
      maxActive: 20,
    });
    expect(picked).toBe('agent-c');
  });

  it('excludes agents that are not in the eligible roster (frozen / Super Admin)', () => {
    const picked = selectBestAgent({
      agentIds: ['agent-active'],
      workloads: new Map([
        ['agent-active', workload('agent-active', { assigned: 8 })],
        ['agent-frozen', emptyWorkload('agent-frozen')],
        ['super-admin', emptyWorkload('super-admin')],
      ]),
      lastAssignedAt: new Map(),
      priority: 'NORMAL',
      maxActive: 20,
    });
    expect(picked).toBe('agent-active');
  });

  it('skips agents at capacity and stays unassigned when everyone is full', () => {
    const full = selectBestAgent({
      agentIds: ['agent-a', 'agent-b'],
      workloads: new Map([
        ['agent-a', workload('agent-a', { assigned: 20 })],
        ['agent-b', workload('agent-b', { assigned: 21 })],
      ]),
      lastAssignedAt: new Map(),
      priority: 'NORMAL',
      maxActive: 20,
    });
    expect(full).toBeNull();

    const mixed = selectBestAgent({
      agentIds: ['agent-a', 'agent-b'],
      workloads: new Map([
        ['agent-a', workload('agent-a', { assigned: 20 })],
        ['agent-b', workload('agent-b', { assigned: 19 })],
      ]),
      lastAssignedAt: new Map(),
      priority: 'NORMAL',
      maxActive: 20,
    });
    expect(mixed).toBe('agent-b');
  });

  it('URGENT prefers agents under 70% capacity when that pool is non-empty', () => {
    const picked = selectBestAgent({
      agentIds: ['agent-a', 'agent-b', 'agent-c'],
      workloads: new Map([
        ['agent-a', workload('agent-a', { assigned: 15 })],
        ['agent-b', workload('agent-b', { assigned: 13 })],
        ['agent-c', workload('agent-c', { assigned: 19 })],
      ]),
      lastAssignedAt: new Map(),
      priority: 'URGENT',
      maxActive: 20,
    });
    expect(picked).toBe('agent-b');
  });

  it('URGENT falls back to anyone under cap when nobody is under 70%', () => {
    const picked = selectBestAgent({
      agentIds: ['agent-a', 'agent-b'],
      workloads: new Map([
        ['agent-a', workload('agent-a', { assigned: 18 })],
        ['agent-b', workload('agent-b', { assigned: 15 })],
      ]),
      lastAssignedAt: new Map(),
      priority: 'URGENT',
      maxActive: 20,
    });
    expect(picked).toBe('agent-b');
  });

  it('breaks score ties by oldest last assignment then stable agent id', () => {
    const workloads = new Map([
      ['agent-b', emptyWorkload('agent-b')],
      ['agent-a', emptyWorkload('agent-a')],
    ]);
    expect(
      selectBestAgent({
        agentIds: ['agent-b', 'agent-a'],
        workloads,
        lastAssignedAt: new Map([
          ['agent-a', 2_000],
          ['agent-b', 1_000],
        ]),
        priority: 'NORMAL',
        maxActive: 20,
      }),
    ).toBe('agent-b');

    expect(
      selectBestAgent({
        agentIds: ['agent-b', 'agent-a'],
        workloads,
        lastAssignedAt: new Map(),
        priority: 'NORMAL',
        maxActive: 20,
      }),
    ).toBe('agent-a');
  });
});

describe('pickSkillTier', () => {
  const skills = new Map([
    ['cat-lang', { languages: ['fr'], categories: ['KYC'] }],
    ['cat-only', { languages: ['en'], categories: ['KYC'] }],
    ['lang-only', { languages: ['fr'], categories: ['PAYMENT'] }],
    ['general', { languages: [] as string[], categories: [] as string[] }],
  ]);

  it('selects category + language when available', () => {
    expect(
      pickSkillTier({
        agentIds: ['cat-lang', 'cat-only', 'lang-only', 'general'],
        skills,
        category: 'KYC',
        language: 'fr',
      }),
    ).toEqual({
      agentIds: ['cat-lang'],
      skillTier: 'CATEGORY_AND_LANGUAGE',
      categoryMatch: true,
      languageMatch: true,
    });
  });

  it('falls back to category, then language, then general', () => {
    expect(
      pickSkillTier({
        agentIds: ['cat-only', 'lang-only', 'general'],
        skills,
        category: 'KYC',
        language: 'fr',
      }).skillTier,
    ).toBe('CATEGORY');
    expect(
      pickSkillTier({
        agentIds: ['lang-only', 'general'],
        skills,
        category: 'KYC',
        language: 'fr',
      }).skillTier,
    ).toBe('LANGUAGE');
    expect(
      pickSkillTier({
        agentIds: ['general'],
        skills,
        category: 'KYC',
        language: 'fr',
      }),
    ).toEqual({
      agentIds: ['general'],
      skillTier: 'GENERAL',
      categoryMatch: false,
      languageMatch: false,
    });
  });

  it('does not treat empty arrays as wildcards', () => {
    const picked = pickSkillTier({
      agentIds: ['general', 'cat-only'],
      skills,
      category: 'KYC',
      language: 'fr',
    });
    expect(picked.agentIds).toEqual(['cat-only']);
    expect(picked.skillTier).toBe('CATEGORY');
  });
});
