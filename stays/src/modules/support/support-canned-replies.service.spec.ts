import { SupportCannedRepliesService } from './support-canned-replies.service';

describe('SupportCannedRepliesService', () => {
  function build() {
    const repo = {
      createQueryBuilder: jest.fn(() => ({
        orderBy: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            title: 'Hello',
            body: 'Hi there',
            category: null,
            created_by_admin_id: 'admin-1',
            updated_by_admin_id: 'admin-1',
            created_at: new Date(),
            updated_at: new Date(),
            is_active: true,
          },
        ]),
      })),
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({
        ...row,
        id: (row.id as string) ?? 'r-new',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      })),
      findOne: jest.fn(),
    };
    const staysAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new SupportCannedRepliesService(
      repo as never,
      staysAudit as never,
    );
    return { service, repo, staysAudit };
  }

  it('lists active replies by default', async () => {
    const { service, repo } = build();
    const listed = await service.list();
    expect(listed.items).toHaveLength(1);
    expect(repo.createQueryBuilder).toHaveBeenCalled();
  });

  it('creates a reply and audits without body in metadata', async () => {
    const { service, staysAudit } = build();
    const created = await service.create('admin-1', {
      title: 'Greeting',
      body: 'Thanks for contacting us',
      category: 'PAYMENT',
      language: 'fr-FR',
    });
    expect(created.category).toBe('PAYMENT');
    expect(created.language).toBe('fr');
    expect(created.title).toBe('Greeting');
    expect(staysAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'support_canned_reply_created',
        metadata: expect.objectContaining({ title: 'Greeting' }),
      }),
    );
    expect(staysAudit.log.mock.calls[0][0].metadata.body).toBeUndefined();
  });

  it('soft-deactivates on delete path', async () => {
    const { service, repo, staysAudit } = build();
    repo.findOne.mockResolvedValue({
      id: 'r1',
      title: 'Hello',
      body: 'Hi',
      category: null,
      created_by_admin_id: 'admin-1',
      updated_by_admin_id: 'admin-1',
      created_at: new Date(),
      updated_at: new Date(),
      is_active: true,
    });
    const row = await service.deactivate('r1', 'admin-2');
    expect(row.is_active).toBe(false);
    expect(staysAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'support_canned_reply_deactivated' }),
    );
  });

  it('rejects empty title', async () => {
    const { service } = build();
    await expect(
      service.create('admin-1', { title: '  ', body: 'Body' }),
    ).rejects.toThrow('Invalid title');
  });
});
