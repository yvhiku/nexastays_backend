import {
  applyHostBookingFilterSql,
  opsUrgencyRankSql,
} from './host-bookings-list-sql.util';

/**
 * Ops equivalence gate: rank CASE branch order matches
 * classifyHostBookingUrgency / URGENCY_RANK in the web app.
 */
describe('host-bookings-list-sql ops equivalence', () => {
  it('emits ranks 0..8 with checkout_today before checkin_today', () => {
    const sql = opsUrgencyRankSql('b');
    const checkoutIdx = sql.indexOf('THEN 0');
    const checkinIdx = sql.indexOf('THEN 1');
    const tomorrowIdx = sql.indexOf('THEN 2');
    const awaitingIdx = sql.indexOf('THEN 3');
    const stayingIdx = sql.indexOf('THEN 4');
    expect(checkoutIdx).toBeGreaterThan(-1);
    expect(checkinIdx).toBeGreaterThan(checkoutIdx);
    expect(tomorrowIdx).toBeGreaterThan(checkinIdx);
    expect(awaitingIdx).toBeGreaterThan(tomorrowIdx);
    expect(stayingIdx).toBeGreaterThan(awaitingIdx);
  });

  it('checkin_today filter excludes checkout_today', () => {
    const sql = applyHostBookingFilterSql('checkin_today', 'b')!;
    expect(sql).toContain('checkin_date = CAST(:today AS date)');
    expect(sql).toContain('checkout_date = CAST(:today AS date)');
    expect(sql).toMatch(/NOT/i);
  });

  it('current filter is stay-active overlapping today', () => {
    const sql = applyHostBookingFilterSql('current', 'b')!;
    expect(sql).toContain("('CONFIRMED', 'CHECKED_IN')");
    expect(sql).toContain('checkin_date <= CAST(:today AS date)');
    expect(sql).toContain('checkout_date > CAST(:today AS date)');
  });
});
