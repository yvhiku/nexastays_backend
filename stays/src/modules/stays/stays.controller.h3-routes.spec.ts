import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { StaysController } from './stays.controller';

/**
 * H3-BUG: runtime returned Cannot GET /api/v1/stays/host/dashboard while
 * host/stats still worked. Source/route registration must keep this handler.
 * Stale node processes (dist rebuilt without restart) cause the same symptom.
 */
describe('StaysController H3/H10 host route registration', () => {
  it('registers GET host/dashboard (H3)', () => {
    const handler = StaysController.prototype.getHostDashboard;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('host/dashboard');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
  });

  it('registers GET host/stats (legacy KPI) and GET host/analytics (H10)', () => {
    const stats = StaysController.prototype.getHostStats;
    const analytics = StaysController.prototype.getHostAnalytics;
    expect(Reflect.getMetadata(PATH_METADATA, stats)).toBe('host/stats');
    expect(Reflect.getMetadata(METHOD_METADATA, stats)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, analytics)).toBe('host/analytics');
    expect(Reflect.getMetadata(METHOD_METADATA, analytics)).toBe(
      RequestMethod.GET,
    );
  });

  it('controller prefix remains stays (global api/v1 → /api/v1/stays/...)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, StaysController)).toBe('stays');
  });
});
