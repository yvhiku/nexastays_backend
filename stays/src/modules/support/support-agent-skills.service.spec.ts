import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SupportAgentSkillsService } from './support-agent-skills.service';

describe('SupportAgentSkillsService', () => {
  function build(authz: Record<string, unknown> | null = {
    account_type: 'ADMIN',
    staff_role: 'SUPPORT_AGENT',
    status: 'ACTIVE',
  }) {
    const stored: Record<string, unknown> | null = null;
    let row = stored;
    const skillsRepo = {
      findOne: jest.fn(async () => row),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => {
        row = {
          ...value,
          updated_at: new Date('2026-08-15T00:00:00.000Z'),
        };
        return row;
      }),
    };
    const identityUsers = {
      getAuthz: jest.fn().mockResolvedValue(authz),
    };
    const service = new SupportAgentSkillsService(
      skillsRepo as never,
      identityUsers as never,
    );
    return { service, identityUsers };
  }

  it('canonicalizes mixed language spellings on save', async () => {
    const { service } = build();
    const saved = await service.putForAgent('agent-1', {
      languages: ['FR', 'fr', 'fr-FR'],
      categories: ['PAYMENT', 'KYC', 'PAYMENT'],
    });
    expect(saved.languages).toEqual(['fr']);
    expect(saved.categories).toEqual(['PAYMENT', 'KYC']);
  });

  it('rejects non-SUPPORT_AGENT targets', async () => {
    const { service } = build({
      account_type: 'ADMIN',
      staff_role: 'ADMIN',
      status: 'ACTIVE',
    });
    await expect(
      service.putForAgent('admin-1', { languages: ['fr'], categories: [] }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects missing agents', async () => {
    const { service } = build(null);
    await expect(
      service.putForAgent('missing', { languages: ['fr'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
