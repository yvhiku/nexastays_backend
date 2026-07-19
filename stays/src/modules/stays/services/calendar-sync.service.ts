import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as ical from 'node-ical';
import { StaysExternalCalendar } from '../entities/stays-external-calendar.entity';
import { StaysExternalCalendarEvent } from '../entities/stays-external-calendar-event.entity';
import { StaysExternalCalendarSyncLog } from '../entities/stays-external-calendar-sync-log.entity';
import { StaysAvailabilityBlock } from '../entities/stays-availability-block.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysBooking } from '../entities/stays-booking.entity';
import { BOOKED_STATUSES } from './stays-availability.service';

const MAX_CALENDARS_PER_LISTING = 10;
const SYNC_COOLDOWN_MS = 30_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_ICS_BYTES = 2_000_000;
const IMPORT_PAST_DAYS = 30;
const HORIZON_MONTHS = 18;
const BATCH_LIMIT = 100;

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.0\.0\.0|\[::1\])/i;

export type SyncSummary = {
  calendar_id: string;
  outcome: 'SUCCESS' | 'NOT_MODIFIED' | 'TIMEOUT' | 'ERROR';
  imported_events: number;
  removed_events: number;
  blocked_nights: number;
  duration_ms: number;
  last_reservation: { start: string; end: string } | null;
  message?: string;
};

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    @InjectRepository(StaysExternalCalendar)
    private readonly calendarRepo: Repository<StaysExternalCalendar>,
    @InjectRepository(StaysExternalCalendarEvent)
    private readonly eventRepo: Repository<StaysExternalCalendarEvent>,
    @InjectRepository(StaysExternalCalendarSyncLog)
    private readonly logRepo: Repository<StaysExternalCalendarSyncLog>,
    @InjectRepository(StaysAvailabilityBlock)
    private readonly blockRepo: Repository<StaysAvailabilityBlock>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
  ) {}

  async listCalendars(listingId: string, hostUserId: string) {
    await this.assertListingOwner(listingId, hostUserId);
    const calendars = await this.calendarRepo.find({
      where: { listing_id: listingId },
      order: { created_at: 'ASC' },
    });
    const enriched = await Promise.all(
      calendars.map(async (c) => {
        const history = await this.logRepo.find({
          where: { external_calendar_id: c.id },
          order: { started_at: 'DESC' },
          take: 5,
        });
        return this.toCalendarDto(c, history);
      }),
    );
    return {
      listing_id: listingId,
      connected_calendars_count: calendars.length,
      calendars: enriched,
    };
  }

  async connectCalendar(
    listingId: string,
    hostUserId: string,
    input: {
      provider: StaysExternalCalendar['provider'];
      ics_url: string;
      label?: string;
      provider_listing_reference?: string;
    },
  ) {
    await this.assertListingOwner(listingId, hostUserId);
    const icsUrl = this.validateIcsUrl(input.ics_url);

    const count = await this.calendarRepo.count({
      where: { listing_id: listingId },
    });
    if (count >= MAX_CALENDARS_PER_LISTING) {
      throw new BadRequestException(
        `Maximum ${MAX_CALENDARS_PER_LISTING} calendars per listing`,
      );
    }

    const dup = await this.calendarRepo.findOne({
      where: { listing_id: listingId, ics_url: icsUrl },
    });
    if (dup) {
      throw new ConflictException('This calendar URL is already connected');
    }

    const cal = this.calendarRepo.create({
      listing_id: listingId,
      provider: input.provider,
      label: (input.label ?? '').trim() || input.provider,
      ics_url: icsUrl,
      provider_listing_reference:
        input.provider_listing_reference?.trim() || null,
      status: 'ACTIVE',
      next_sync_at: new Date(),
    });
    await this.calendarRepo.save(cal);

    const summary = await this.syncCalendar(cal.id, { force: true });
    const fresh = await this.calendarRepo.findOneOrFail({ where: { id: cal.id } });
    const history = await this.logRepo.find({
      where: { external_calendar_id: cal.id },
      order: { started_at: 'DESC' },
      take: 5,
    });
    return {
      calendar: this.toCalendarDto(fresh, history),
      sync: summary,
    };
  }

  async updateCalendar(
    listingId: string,
    calendarId: string,
    hostUserId: string,
    patch: { label?: string; status?: 'ACTIVE' | 'PAUSED' },
  ) {
    const cal = await this.getOwnedCalendar(listingId, calendarId, hostUserId);
    if (patch.label !== undefined) cal.label = patch.label.trim();
    if (patch.status === 'PAUSED' || patch.status === 'ACTIVE') {
      cal.status = patch.status;
      if (patch.status === 'ACTIVE') {
        cal.next_sync_at = new Date();
        cal.consecutive_failures = 0;
      }
    }
    await this.calendarRepo.save(cal);
    return this.toCalendarDto(cal);
  }

  async deleteCalendar(
    listingId: string,
    calendarId: string,
    hostUserId: string,
  ) {
    await this.getOwnedCalendar(listingId, calendarId, hostUserId);
    // Cascade removes events, logs, ICAL blocks via FK
    await this.calendarRepo.delete({ id: calendarId });
    return { deleted: true, calendar_id: calendarId };
  }

  async syncNow(listingId: string, calendarId: string, hostUserId: string) {
    const cal = await this.getOwnedCalendar(listingId, calendarId, hostUserId);
    if (cal.status === 'PAUSED') {
      throw new BadRequestException('Calendar is paused — resume before syncing');
    }
    if (
      cal.last_attempt_at &&
      Date.now() - cal.last_attempt_at.getTime() < SYNC_COOLDOWN_MS
    ) {
      throw new BadRequestException('Please wait 30 seconds between syncs');
    }
    return this.syncCalendar(calendarId, { force: true });
  }

  async getOrCreateExport(
    listingId: string,
    hostUserId: string,
  ): Promise<{ url: string; token: string }> {
    const listing = await this.assertListingOwner(listingId, hostUserId);
    if (!listing.calendar_export_token) {
      listing.calendar_export_token = randomUUID();
      await this.listingRepo.save(listing);
    }
    return {
      token: listing.calendar_export_token,
      url: this.publicExportUrl(listing.calendar_export_token),
    };
  }

  async regenerateExport(
    listingId: string,
    hostUserId: string,
  ): Promise<{ url: string; token: string }> {
    const listing = await this.assertListingOwner(listingId, hostUserId);
    listing.calendar_export_token = randomUUID();
    await this.listingRepo.save(listing);
    return {
      token: listing.calendar_export_token,
      url: this.publicExportUrl(listing.calendar_export_token),
    };
  }

  async buildExportIcs(token: string): Promise<string> {
    const listing = await this.listingRepo.findOne({
      where: { calendar_export_token: token },
      select: ['id', 'title'],
    });
    if (!listing) throw new NotFoundException('Calendar not found');

    const { from, to } = this.exportHorizon();
    const bookings = await this.bookingRepo
      .createQueryBuilder('b')
      .where('b.listing_id = :listingId', { listingId: listing.id })
      .andWhere('b.status IN (:...statuses)', { statuses: [...BOOKED_STATUSES] })
      .andWhere('b.checkin_date < :to', { to })
      .andWhere('b.checkout_date > :from', { from })
      .getMany();

    const blocks = await this.blockRepo
      .createQueryBuilder('ab')
      .where('ab.listing_id = :listingId', { listingId: listing.id })
      .andWhere('ab.is_blocked = true')
      .andWhere('ab.source IN (:...sources)', { sources: ['HOST', 'ADMIN'] })
      .andWhere('ab.date >= :from', { from })
      .andWhere('ab.date < :to', { to })
      .getMany();

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Nexa Stays//Calendar Export//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    for (const b of bookings) {
      const start = this.dateStr(b.checkin_date);
      const end = this.dateStr(b.checkout_date);
      lines.push(
        'BEGIN:VEVENT',
        `UID:nexa-booking-${b.id}@nexastays`,
        `DTSTART;VALUE=DATE:${start.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${end.replace(/-/g, '')}`,
        'SUMMARY:Reserved',
        'END:VEVENT',
      );
    }

    // Collapse consecutive HOST/ADMIN nights into ranges for cleaner ICS
    const nights = blocks
      .map((b) => this.dateStr(b.date))
      .sort();
    for (const range of this.collapseNights(nights)) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:nexa-block-${listing.id}-${range.start}@nexastays`,
        `DTSTART;VALUE=DATE:${range.start.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${range.end.replace(/-/g, '')}`,
        'SUMMARY:Unavailable',
        'END:VEVENT',
      );
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  /** Cron: drain due calendars */
  async processDueCalendars(): Promise<number> {
    const now = new Date();
    const due = await this.calendarRepo
      .createQueryBuilder('c')
      .where('c.status IN (:...statuses)', { statuses: ['ACTIVE', 'ERROR'] })
      .andWhere('c.next_sync_at <= :now', { now })
      .andWhere('(c.locked_until IS NULL OR c.locked_until < :now)', { now })
      .orderBy('c.next_sync_at', 'ASC')
      .take(BATCH_LIMIT)
      .getMany();

    let n = 0;
    for (const cal of due) {
      try {
        await this.syncCalendar(cal.id, { force: false });
        n += 1;
      } catch (err) {
        this.logger.warn(
          `Sync failed for ${cal.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return n;
  }

  async syncCalendar(
    calendarId: string,
    opts: { force: boolean },
  ): Promise<SyncSummary> {
    const started = Date.now();
    const claimUntil = new Date(Date.now() + 2 * 60_000);
    const claim = await this.calendarRepo
      .createQueryBuilder()
      .update(StaysExternalCalendar)
      .set({
        status: 'SYNCING',
        locked_until: claimUntil,
        last_attempt_at: new Date(),
      })
      .where('id = :id', { id: calendarId })
      .andWhere('(locked_until IS NULL OR locked_until < NOW())')
      .andWhere('status != :syncing', { syncing: 'SYNCING' })
      .execute();

    if (!claim.affected && !opts.force) {
      return {
        calendar_id: calendarId,
        outcome: 'ERROR',
        imported_events: 0,
        removed_events: 0,
        blocked_nights: 0,
        duration_ms: 0,
        last_reservation: null,
        message: 'Sync already in progress',
      };
    }

    // Force path: still try claim; if locked by another, wait/fail
    if (!claim.affected && opts.force) {
      const forced = await this.calendarRepo
        .createQueryBuilder()
        .update(StaysExternalCalendar)
        .set({
          status: 'SYNCING',
          locked_until: claimUntil,
          last_attempt_at: new Date(),
        })
        .where('id = :id', { id: calendarId })
        .andWhere('(locked_until IS NULL OR locked_until < NOW())')
        .execute();
      if (!forced.affected) {
        throw new ConflictException('Sync already in progress');
      }
    }

    const cal = await this.calendarRepo.findOneOrFail({
      where: { id: calendarId },
    });
    const previousStatus = cal.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE';

    try {
      const fetched = await this.fetchIcs(cal);
      if (fetched.notModified) {
        const duration_ms = Date.now() - started;
        const summary: SyncSummary = {
          calendar_id: calendarId,
          outcome: 'NOT_MODIFIED',
          imported_events: 0,
          removed_events: 0,
          blocked_nights: cal.sync_result?.blocked_nights ?? 0,
          duration_ms,
          last_reservation: cal.sync_result?.last_reservation ?? null,
        };
        await this.finishSuccess(cal, summary, {
          not_modified: true,
          restoreStatus: previousStatus === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
        });
        return summary;
      }

      const parsed = this.parseIcsEvents(fetched.body);
      const { from, to } = this.importHorizon();
      const inHorizon = parsed.filter(
        (e) => e.end_date > from && e.start_date < to,
      );

      const oldEvents = await this.eventRepo.find({
        where: { external_calendar_id: calendarId },
      });
      await this.eventRepo.delete({ external_calendar_id: calendarId });

      if (inHorizon.length) {
        await this.eventRepo.insert(
          inHorizon.map((e) => ({
            external_calendar_id: calendarId,
            uid: e.uid,
            recurrence_id: e.recurrence_id,
            start_date: this.parseYmd(e.start_date),
            end_date: this.parseYmd(e.end_date),
            summary: e.summary,
          })),
        );
      }

      const nights = this.expandNights(inHorizon, from, to);
      const removed_events = Math.max(0, oldEvents.length - inHorizon.length);

      // Remove ICAL nights belonging to this calendar that are no longer present
      const existingIcal = await this.blockRepo.find({
        where: { external_calendar_id: calendarId, source: 'ICAL' },
      });
      const toRemove = existingIcal.filter(
        (b) => !nights.has(this.dateStr(b.date)),
      );
      if (toRemove.length) {
        await this.blockRepo.delete({ id: In(toRemove.map((b) => b.id)) });
      }

      // Insert new ICAL nights without overwriting HOST/ADMIN
      let blocked_nights = 0;
      for (const night of nights) {
        const existing = await this.blockRepo.findOne({
          where: {
            listing_id: cal.listing_id,
            date: this.parseYmd(night) as unknown as Date,
          },
        });
        if (existing?.source === 'HOST' || existing?.source === 'ADMIN') {
          continue;
        }
        if (
          existing?.source === 'ICAL' &&
          existing.external_calendar_id &&
          existing.external_calendar_id !== calendarId
        ) {
          blocked_nights += 1;
          continue;
        }
        await this.blockRepo.upsert(
          {
            listing_id: cal.listing_id,
            date: this.parseYmd(night),
            is_blocked: true,
            source: 'ICAL',
            external_calendar_id: calendarId,
          },
          ['listing_id', 'date'],
        );
        blocked_nights += 1;
      }

      // Recount actual ICAL nights for this calendar
      blocked_nights = await this.blockRepo.count({
        where: {
          external_calendar_id: calendarId,
          source: 'ICAL',
          is_blocked: true,
        },
      });

      const last_reservation = this.pickLastReservation(inHorizon);
      const duration_ms = Date.now() - started;
      const summary: SyncSummary = {
        calendar_id: calendarId,
        outcome: 'SUCCESS',
        imported_events: inHorizon.length,
        removed_events,
        blocked_nights,
        duration_ms,
        last_reservation,
      };

      if (fetched.etag) cal.etag = fetched.etag;
      if (fetched.lastModified) cal.last_modified = fetched.lastModified;

      await this.finishSuccess(cal, summary, {
        restoreStatus: 'ACTIVE',
      });
      return summary;
    } catch (err) {
      const duration_ms = Date.now() - started;
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || /timeout/i.test(err.message));
      const message = err instanceof Error ? err.message : String(err);
      const summary: SyncSummary = {
        calendar_id: calendarId,
        outcome: isTimeout ? 'TIMEOUT' : 'ERROR',
        imported_events: 0,
        removed_events: 0,
        blocked_nights: cal.sync_result?.blocked_nights ?? 0,
        duration_ms,
        last_reservation: cal.sync_result?.last_reservation ?? null,
        message,
      };
      await this.finishFailure(cal, summary);
      return summary;
    }
  }

  private async finishSuccess(
    cal: StaysExternalCalendar,
    summary: SyncSummary,
    opts: { not_modified?: boolean; restoreStatus: 'ACTIVE' | 'PAUSED' },
  ) {
    const now = new Date();
    cal.status = opts.restoreStatus;
    cal.locked_until = null;
    cal.last_successful_sync_at = now;
    cal.last_error = null;
    cal.consecutive_failures = 0;
    cal.next_sync_at = this.nextSyncAt(0);
    cal.sync_result = {
      imported_events: summary.imported_events,
      removed_events: summary.removed_events,
      blocked_nights: summary.blocked_nights,
      duration_ms: summary.duration_ms,
      not_modified: opts.not_modified ?? false,
      last_reservation: summary.last_reservation,
    };
    await this.calendarRepo.save(cal);
    await this.appendLog(cal.id, summary);
    await this.trimLogs(cal.id);
  }

  private async finishFailure(cal: StaysExternalCalendar, summary: SyncSummary) {
    const failures = (cal.consecutive_failures ?? 0) + 1;
    cal.status = 'ERROR';
    cal.locked_until = null;
    cal.last_error = summary.message ?? 'Sync failed';
    cal.consecutive_failures = failures;
    cal.next_sync_at = this.nextSyncAt(failures);
    cal.sync_result = {
      ...(cal.sync_result ?? {}),
      duration_ms: summary.duration_ms,
    };
    await this.calendarRepo.save(cal);
    await this.appendLog(cal.id, summary);
    await this.trimLogs(cal.id);
  }

  private async appendLog(calendarId: string, summary: SyncSummary) {
    await this.logRepo.save(
      this.logRepo.create({
        external_calendar_id: calendarId,
        started_at: new Date(Date.now() - (summary.duration_ms || 0)),
        finished_at: new Date(),
        outcome: summary.outcome,
        message: summary.message ?? null,
        imported_events: summary.imported_events,
        removed_events: summary.removed_events,
        blocked_nights: summary.blocked_nights,
        duration_ms: summary.duration_ms,
      }),
    );
  }

  private async trimLogs(calendarId: string) {
    const keep = await this.logRepo.find({
      where: { external_calendar_id: calendarId },
      order: { started_at: 'DESC' },
      take: 5,
      select: ['id'],
    });
    const keepIds = keep.map((l) => l.id);
    if (keepIds.length === 0) return;
    await this.logRepo
      .createQueryBuilder()
      .delete()
      .from(StaysExternalCalendarSyncLog)
      .where('external_calendar_id = :cid', { cid: calendarId })
      .andWhere('id NOT IN (:...ids)', { ids: keepIds })
      .execute();
  }

  private nextSyncAt(consecutiveFailures: number): Date {
    const steps = [5, 15, 60, 180, 360]; // minutes
    const idx = Math.min(consecutiveFailures, steps.length - 1);
    const baseMin = consecutiveFailures === 0 ? 5 : steps[idx];
    const jitterMs = Math.floor(Math.random() * 60_000);
    return new Date(Date.now() + baseMin * 60_000 + jitterMs);
  }

  private async fetchIcs(cal: StaysExternalCalendar): Promise<{
    body: string;
    notModified: boolean;
    etag?: string;
    lastModified?: string;
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {
        Accept: 'text/calendar, text/plain, */*',
        'User-Agent': 'NexaStaysCalendarSync/1.0',
      };
      if (cal.etag) headers['If-None-Match'] = cal.etag;
      if (cal.last_modified) headers['If-Modified-Since'] = cal.last_modified;

      const res = await fetch(cal.ics_url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'follow',
      });

      if (res.status === 304) {
        return { body: '', notModified: true };
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching calendar`);
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_ICS_BYTES) {
        throw new Error('Calendar file too large');
      }
      return {
        body: buf.toString('utf8'),
        notModified: false,
        etag: res.headers.get('etag') ?? undefined,
        lastModified: res.headers.get('last-modified') ?? undefined,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private parseIcsEvents(body: string): Array<{
    uid: string;
    recurrence_id: string;
    start_date: string;
    end_date: string;
    summary: string | null;
  }> {
    const data = ical.sync.parseICS(body);
    const out: Array<{
      uid: string;
      recurrence_id: string;
      start_date: string;
      end_date: string;
      summary: string | null;
    }> = [];

    for (const key of Object.keys(data)) {
      const ev = data[key];
      if (!ev || (ev as { type?: string }).type !== 'VEVENT') continue;
      const vevent = ev as ical.VEvent;
      if (vevent.status === 'CANCELLED') continue;
      const start = this.toDateOnly(vevent.start);
      let end = this.toDateOnly(vevent.end);
      if (!start) continue;
      if (!end || end <= start) {
        // All-day single day or missing end → one night
        const d = new Date(start + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        end = d.toISOString().slice(0, 10);
      }
      const uid = String(vevent.uid ?? key);
      const recurrence_id = vevent.recurrenceid
        ? this.toDateOnly(vevent.recurrenceid) ?? ''
        : '';
      out.push({
        uid,
        recurrence_id,
        start_date: start,
        end_date: end,
        summary: vevent.summary ? String(vevent.summary) : null,
      });
    }
    return out;
  }

  private toDateOnly(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'string') {
      const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.replace(/-/g, ''));
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return null;
  }

  private expandNights(
    events: Array<{ start_date: string; end_date: string }>,
    from: string,
    to: string,
  ): Set<string> {
    const nights = new Set<string>();
    for (const e of events) {
      let cursor = e.start_date < from ? from : e.start_date;
      const end = e.end_date > to ? to : e.end_date;
      while (cursor < end) {
        nights.add(cursor);
        const d = new Date(cursor + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        cursor = d.toISOString().slice(0, 10);
      }
    }
    return nights;
  }

  private pickLastReservation(
    events: Array<{ start_date: string; end_date: string }>,
  ): { start: string; end: string } | null {
    if (!events.length) return null;
    const sorted = [...events].sort((a, b) =>
      b.start_date.localeCompare(a.start_date),
    );
    return { start: sorted[0].start_date, end: sorted[0].end_date };
  }

  private importHorizon(): { from: string; to: string } {
    const now = new Date();
    const fromD = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    fromD.setUTCDate(fromD.getUTCDate() - IMPORT_PAST_DAYS);
    const toD = new Date(fromD);
    toD.setUTCDate(toD.getUTCDate() + IMPORT_PAST_DAYS);
    toD.setUTCMonth(toD.getUTCMonth() + HORIZON_MONTHS);
    return {
      from: fromD.toISOString().slice(0, 10),
      to: toD.toISOString().slice(0, 10),
    };
  }

  private exportHorizon(): { from: string; to: string } {
    const now = new Date();
    const fromD = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const toD = new Date(fromD);
    toD.setUTCMonth(toD.getUTCMonth() + HORIZON_MONTHS);
    return {
      from: fromD.toISOString().slice(0, 10),
      to: toD.toISOString().slice(0, 10),
    };
  }

  private collapseNights(
    nights: string[],
  ): Array<{ start: string; end: string }> {
    if (!nights.length) return [];
    const ranges: Array<{ start: string; end: string }> = [];
    let start = nights[0];
    let prev = nights[0];
    for (let i = 1; i < nights.length; i++) {
      const nextExpected = (() => {
        const d = new Date(prev + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().slice(0, 10);
      })();
      if (nights[i] === nextExpected) {
        prev = nights[i];
        continue;
      }
      const endD = new Date(prev + 'T00:00:00Z');
      endD.setUTCDate(endD.getUTCDate() + 1);
      ranges.push({ start, end: endD.toISOString().slice(0, 10) });
      start = nights[i];
      prev = nights[i];
    }
    const endD = new Date(prev + 'T00:00:00Z');
    endD.setUTCDate(endD.getUTCDate() + 1);
    ranges.push({ start, end: endD.toISOString().slice(0, 10) });
    return ranges;
  }

  private validateIcsUrl(raw: string): string {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new BadRequestException('Invalid calendar URL');
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException('Calendar URL must use HTTPS');
    }
    if (PRIVATE_HOST_RE.test(url.hostname)) {
      throw new BadRequestException('Calendar URL host is not allowed');
    }
    return url.toString();
  }

  private publicExportUrl(token: string): string {
    const base =
      process.env.STAYS_PUBLIC_URL?.replace(/\/$/, '') ||
      'http://127.0.0.1:3002';
    return `${base}/api/v1/stays/calendar/${token}.ics`;
  }

  private dateStr(d: Date | string): string {
    if (typeof d === 'string') return d.slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  private parseYmd(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  private async assertListingOwner(listingId: string, hostUserId: string) {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
      select: ['id', 'host_user_id', 'calendar_export_token', 'title'],
    });
    if (!listing || listing.host_user_id !== hostUserId) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  private async getOwnedCalendar(
    listingId: string,
    calendarId: string,
    hostUserId: string,
  ) {
    await this.assertListingOwner(listingId, hostUserId);
    const cal = await this.calendarRepo.findOne({
      where: { id: calendarId, listing_id: listingId },
    });
    if (!cal) throw new NotFoundException('Calendar not found');
    return cal;
  }

  private toCalendarDto(
    c: StaysExternalCalendar,
    history?: StaysExternalCalendarSyncLog[],
  ) {
    const health =
      c.status === 'PAUSED'
        ? 'Paused'
        : c.status === 'ERROR'
          ? 'Error'
          : c.status === 'SYNCING'
            ? 'Syncing'
            : 'Healthy';
    return {
      id: c.id,
      listing_id: c.listing_id,
      provider: c.provider,
      provider_listing_reference: c.provider_listing_reference,
      label: c.label,
      ics_url: c.ics_url,
      status: c.status,
      health,
      next_sync_at: c.next_sync_at,
      last_attempt_at: c.last_attempt_at,
      last_successful_sync_at: c.last_successful_sync_at,
      last_error: c.last_error,
      sync_result: c.sync_result,
      sync_version: c.sync_version,
      created_at: c.created_at,
      history: (history ?? []).map((h) => ({
        id: h.id,
        started_at: h.started_at,
        finished_at: h.finished_at,
        outcome: h.outcome,
        message: h.message,
        imported_events: h.imported_events,
        blocked_nights: h.blocked_nights,
        duration_ms: h.duration_ms,
      })),
    };
  }
}
