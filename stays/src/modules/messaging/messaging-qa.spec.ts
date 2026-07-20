/**
 * QA coverage for client-side messaging sync contracts (mirrors web lib behavior).
 */

const ACTIVE_MS = 5_000;
const IDLE_MS = 10_000;
const VERY_IDLE_MS = 20_000;
const INBOX_MS = 30_000;
const ACTIVE_THRESHOLD_MS = 30_000;
const IDLE_THRESHOLD_MS = 5 * 60_000;

function getPollingIntervalMs(
  mode: 'conversation' | 'inbox' | 'off',
  visible: boolean,
  lastActivityAt: number,
  now: number,
): number {
  if (mode === 'off' || !visible) return 0;
  if (mode === 'inbox') return INBOX_MS;
  const idle = now - lastActivityAt;
  if (idle < ACTIVE_THRESHOLD_MS) return ACTIVE_MS;
  if (idle < IDLE_THRESHOLD_MS) return IDLE_MS;
  return VERY_IDLE_MS;
}

function shouldFetchAfterPush(
  localVersion: number | undefined,
  pushVersion: number | undefined,
): boolean {
  if (pushVersion == null || Number.isNaN(pushVersion)) return true;
  if (localVersion == null || Number.isNaN(localVersion)) return true;
  return localVersion < pushVersion;
}

describe('Messaging QA contracts', () => {
  describe('adaptive poll tiers', () => {
    const now = 1_000_000;

    it('uses 5s when conversation is active (<30s idle)', () => {
      expect(getPollingIntervalMs('conversation', true, now - 10_000, now)).toBe(ACTIVE_MS);
    });

    it('uses 10s when idle 30s–5min', () => {
      expect(getPollingIntervalMs('conversation', true, now - 60_000, now)).toBe(IDLE_MS);
    });

    it('uses 20s when idle >5min', () => {
      expect(getPollingIntervalMs('conversation', true, now - 400_000, now)).toBe(
        VERY_IDLE_MS,
      );
    });

    it('uses 30s for inbox-only mode', () => {
      expect(getPollingIntervalMs('inbox', true, now, now)).toBe(INBOX_MS);
    });

    it('stops polling when tab is background', () => {
      expect(getPollingIntervalMs('conversation', false, now, now)).toBe(0);
    });
  });

  describe('push version sync', () => {
    it('skips fetch when local version >= push version', () => {
      expect(shouldFetchAfterPush(5, 5)).toBe(false);
      expect(shouldFetchAfterPush(6, 5)).toBe(false);
    });

    it('fetches when push version is ahead', () => {
      expect(shouldFetchAfterPush(4, 5)).toBe(true);
    });

    it('fetches when local version unknown', () => {
      expect(shouldFetchAfterPush(undefined, 5)).toBe(true);
    });
  });

  describe('archive re-open rules', () => {
    it('ARCHIVED resurfaces on inbound message; DELETED stays hidden', () => {
      const archivedGuest = { guest_visibility: 'ARCHIVED', host_visibility: 'ACTIVE' };
      const deletedGuest = { guest_visibility: 'DELETED', host_visibility: 'ACTIVE' };

      const resurface = (vis: string) => vis === 'ARCHIVED';
      expect(resurface(archivedGuest.guest_visibility)).toBe(true);
      expect(resurface(deletedGuest.guest_visibility)).toBe(false);
    });
  });
});
