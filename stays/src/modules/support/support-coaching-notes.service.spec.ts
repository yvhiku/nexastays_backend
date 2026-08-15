import { ConflictException } from '@nestjs/common';
import { SupportCoachingNotesService } from './support-coaching-notes.service';

describe('SupportCoachingNotesService', () => {
  function build() {
    const row = {
      id: 'note-1',
      agent_user_id: 'agent-1',
      created_by: 'admin-1',
      note: 'Review payment process',
      status: 'COMPLETED' as const,
      follow_up_at: null,
      completed_at: new Date('2026-08-01T00:00:00.000Z'),
      completed_by: 'admin-1',
      created_at: new Date('2026-08-01T00:00:00.000Z'),
      updated_at: new Date('2026-08-01T00:00:00.000Z'),
    };
    const repo = {
      find: jest.fn().mockResolvedValue([row]),
      findOne: jest.fn().mockResolvedValue({ ...row }),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: unknown) => value),
    };
    const service = new SupportCoachingNotesService(repo as never);
    return { service, repo };
  }

  it('rejects silent edits to a completed note', async () => {
    const { service } = build();
    await expect(
      service.patch('note-1', 'admin-2', { note: 'rewritten history' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
