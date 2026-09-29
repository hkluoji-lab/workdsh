/**
 * Cron and time-zone evaluation for scheduled rules (D12 / P2-03, automation 0.1).
 *
 * The official Schedule subsystem is *not* reused as a scheduler: its protocol states
 * it carries no calendar rule, no cron expression and no repeat-scheduling time zone
 * (`ScheduleDeliveryMode` is `session-local` only), so it cannot express a workbench
 * level plan that survives a Host restart. See the reuse record in
 * `docs/design/automations/README.md` section 3.
 *
 * What is implemented here is therefore a deliberate, small business difference:
 * - a 5-field POSIX (Vixie) cron expression, parsed strictly, with no seconds field;
 * - day matching follows Vixie's rule: when both the day-of-month and the day-of-week
 *   are restricted, a day matches if **either** matches;
 * - an IANA time zone applied through `Intl`, never a fixed UTC offset;
 * - a floor of {@link AUTOMATION_MIN_INTERVAL_SECONDS} between two triggers, matching
 *   the official Schedule lower bound;
 * - an optional active window; instants outside it never become occurrences.
 *
 * Evaluation is pure: it returns instants and stores nothing. The persisted
 * occurrence, not this module, is the deduplication authority.
 */
import type { AutomationSchedule } from 'workdsh-contracts/automations';
import { AutomationError } from './error.js';

const MINUTE_MS = 60_000;

/** Smallest accepted gap between two triggers of one rule, in seconds. */
export const AUTOMATION_MIN_INTERVAL_SECONDS = 300;

/** Hard stop for evaluation: a rule that never matches within this horizon has none. */
const SEARCH_HORIZON_DAYS = 366 * 5;

/** Longest accepted cron expression, so a hostile input cannot make parsing expensive. */
const CRON_MAX_CHARS = 128;

/** Upper bound for one preview request. */
export const AUTOMATION_PREVIEW_MAX_RUNS = 20;

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const WEEKDAY_INDEX: Readonly<Record<string, number>> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Parsed field sets of one cron expression. */
export interface CronFields {
  readonly minute: ReadonlySet<number>;
  readonly hour: ReadonlySet<number>;
  readonly dayOfMonth: ReadonlySet<number>;
  readonly month: ReadonlySet<number>;
  /** `0`–`6`, Sunday `0`; `7` is normalized to `0` on parse. */
  readonly dayOfWeek: ReadonlySet<number>;
  readonly dayOfMonthRestricted: boolean;
  readonly dayOfWeekRestricted: boolean;
}

/** One wall-clock reading in a named zone. `weekday` is `0`–`6`, Sunday `0`. */
export interface ZoneWall {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Validate an IANA zone name and return its formatter. A fixed offset (`+08:00`) is
 * rejected: the stored zone must stay meaningful across a DST boundary.
 */
function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const found = formatters.get(timeZone);
  if (found) return found;
  if (!timeZone.trim() || /^[+-]\d{2}:?\d{2}$/.test(timeZone.trim())) {
    throw new AutomationError('invalid_time_zone', '时区必须是 IANA 名称，例如 Asia/Shanghai。');
  }
  let created: Intl.DateTimeFormat;
  try {
    created = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    });
  } catch {
    throw new AutomationError('invalid_time_zone', '时区无法识别，请使用 IANA 名称。');
  }
  formatters.set(timeZone, created);
  return created;
}

/** Validate one IANA zone name. Throws `invalid_time_zone` when unusable. */
export function assertTimeZone(timeZone: string): void {
  zoneFormatter(timeZone);
}

/** Wall-clock reading of one instant in a zone. Seconds are discarded. */
export function zoneWall(instantMs: number, timeZone: string): ZoneWall {
  const parts = zoneFormatter(timeZone).formatToParts(new Date(instantMs));
  const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: Number(value('hour')) % 24,
    minute: Number(value('minute')),
    weekday: WEEKDAY_INDEX[value('weekday')] ?? 0,
  };
}

/** Flatten wall fields to the minute-aligned instant they would denote in UTC. */
const wallAsUtc = (wall: ZoneWall): number => Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);

const utcToWall = (instantMs: number): ZoneWall => {
  const date = new Date(instantMs);
  const weekday = date.getUTCDay();
  return {
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes(), weekday,
  };
};

const alignMinute = (instantMs: number): number => instantMs - (((instantMs % MINUTE_MS) + MINUTE_MS) % MINUTE_MS);

/** Zone offset of one instant, in milliseconds east of UTC. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const aligned = alignMinute(instantMs);
  return wallAsUtc(zoneWall(aligned, timeZone)) - aligned;
}

/**
 * Convert wall fields to the instant they denote in the zone.
 *
 * Two correction passes are enough for every real zone: the first uses the offset at
 * the naive guess, the second the offset at the corrected instant. A wall time that
 * does not exist (spring-forward gap) resolves to a real instant whose local reading
 * differs, and the caller verifies the result before accepting it — a nonexistent
 * wall time is skipped rather than silently shifted.
 */
function instantFromWall(wall: ZoneWall, timeZone: string): number {
  const naive = wallAsUtc(wall);
  const first = naive - zoneOffsetMs(naive, timeZone);
  return naive - zoneOffsetMs(first, timeZone);
}

function parseValue(raw: string, names: readonly string[] | undefined, label: string): number {
  const text = raw.trim().toUpperCase();
  if (!text) throw new AutomationError('invalid_cron', `${label} 字段为空。`);
  const numeric = Number(text);
  if (Number.isInteger(numeric)) return numeric;
  const index = names?.indexOf(text) ?? -1;
  if (index >= 0) return names === WEEKDAY_NAMES ? index : index + 1;
  throw new AutomationError('invalid_cron', `${label} 字段无法识别：${raw.trim()}。`);
}

interface FieldBounds {
  readonly min: number;
  readonly max: number;
  readonly label: string;
  readonly names?: readonly string[];
  /** Value a raw `7` collapses to, for the weekday field. */
  readonly wrapTo?: number;
}

function parseField(spec: string, bounds: FieldBounds): ReadonlySet<number> {
  const values = new Set<number>();
  for (const item of spec.split(',')) {
    const piece = item.trim();
    if (!piece) throw new AutomationError('invalid_cron', `${bounds.label} 字段存在空项。`);
    const [rangeText, stepText, ...rest] = piece.split('/');
    if (rest.length) throw new AutomationError('invalid_cron', `${bounds.label} 字段的步长写法无效。`);
    let step = 1;
    if (stepText !== undefined) {
      step = Number(stepText);
      if (!Number.isInteger(step) || step < 1) throw new AutomationError('invalid_cron', `${bounds.label} 字段的步长必须是正整数。`);
    }
    let from: number;
    let to: number;
    if (rangeText === '*') {
      from = bounds.min;
      to = bounds.max;
    } else if (rangeText.includes('-')) {
      const [fromText, toText, ...extra] = rangeText.split('-');
      if (extra.length || !fromText || !toText) throw new AutomationError('invalid_cron', `${bounds.label} 字段的区间写法无效。`);
      from = parseValue(fromText, bounds.names, bounds.label);
      to = parseValue(toText, bounds.names, bounds.label);
    } else {
      from = parseValue(rangeText, bounds.names, bounds.label);
      to = from;
      // A bare value with a step has no POSIX meaning, so it is rejected rather than
      // guessed: `5/10` would be read differently by different cron implementations.
      if (stepText !== undefined) throw new AutomationError('invalid_cron', `${bounds.label} 字段不支持「单值/步长」，请写区间或 *。`);
    }
    if (from > to) throw new AutomationError('invalid_cron', `${bounds.label} 字段的区间起点大于终点。`);
    for (const value of [from, to]) {
      if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
        throw new AutomationError('invalid_cron', `${bounds.label} 字段超出取值范围 ${bounds.min}-${bounds.max}。`);
      }
    }
    for (let value = from; value <= to; value += step) {
      values.add(bounds.wrapTo !== undefined && value === bounds.wrapTo ? 0 : value);
    }
  }
  if (!values.size) throw new AutomationError('invalid_cron', `${bounds.label} 字段没有匹配值。`);
  return values;
}

/** Parse a 5-field cron expression. Throws `invalid_cron` with a readable reason. */
export function parseCron(expression: string): CronFields {
  if (typeof expression !== 'string' || !expression.trim()) {
    throw new AutomationError('invalid_cron', '请填写 cron 表达式。');
  }
  if (expression.length > CRON_MAX_CHARS) throw new AutomationError('invalid_cron', 'cron 表达式过长。');
  if (/[\u0000-\u001f]/.test(expression)) throw new AutomationError('invalid_cron', 'cron 表达式包含控制字符。');
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new AutomationError('invalid_cron', 'cron 表达式必须是 5 个字段：分 时 日 月 周（不支持秒）。');
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [string, string, string, string, string];
  return {
    minute: parseField(minute, { min: 0, max: 59, label: '分钟' }),
    hour: parseField(hour, { min: 0, max: 23, label: '小时' }),
    dayOfMonth: parseField(dayOfMonth, { min: 1, max: 31, label: '日' }),
    month: parseField(month, { min: 1, max: 12, label: '月', names: MONTH_NAMES }),
    dayOfWeek: parseField(dayOfWeek, { min: 0, max: 7, label: '周', names: WEEKDAY_NAMES, wrapTo: 7 }),
    dayOfMonthRestricted: dayOfMonth.trim() !== '*',
    dayOfWeekRestricted: dayOfWeek.trim() !== '*',
  };
}

/** Whether one wall day matches the expression's two day fields (Vixie rule). */
export function matchesDay(fields: CronFields, wall: ZoneWall): boolean {
  const byMonthDay = fields.dayOfMonth.has(wall.day);
  const byWeekday = fields.dayOfWeek.has(wall.weekday);
  if (fields.dayOfMonthRestricted && fields.dayOfWeekRestricted) return byMonthDay || byWeekday;
  if (fields.dayOfMonthRestricted) return byMonthDay;
  if (fields.dayOfWeekRestricted) return byWeekday;
  return true;
}

/** Whether one wall reading matches the whole expression. */
export function matchesWall(fields: CronFields, wall: ZoneWall): boolean {
  return matchesDay(fields, wall)
    && fields.month.has(wall.month)
    && fields.hour.has(wall.hour)
    && fields.minute.has(wall.minute);
}

const firstAllowedAbove = (allowed: ReadonlySet<number>, above: number): number | undefined => {
  let best: number | undefined;
  for (const value of allowed) if (value > above && (best === undefined || value < best)) best = value;
  return best;
};

/**
 * First matching instant strictly after `afterMs`, or `undefined` when the expression
 * has no match inside the search horizon.
 *
 * The search walks calendar fields rather than every minute: a restricted month, day,
 * hour or minute jumps straight to its next candidate, so even a rare schedule
 * (`0 0 29 2 *`) resolves immediately instead of scanning two million minutes.
 */
export function nextRunAfter(fields: CronFields, timeZone: string, afterMs: number): number | undefined {
  const firstMonth = Math.min(...fields.month);
  const firstMinute = Math.min(...fields.minute);
  let wall = zoneWall(alignMinute(afterMs) + MINUTE_MS, timeZone);
  for (let guard = 0; guard < SEARCH_HORIZON_DAYS + 1; guard += 1) {
    if (!fields.month.has(wall.month)) {
      const month = firstAllowedAbove(fields.month, wall.month);
      wall = month === undefined
        ? utcToWall(Date.UTC(wall.year + 1, firstMonth - 1, 1))
        : utcToWall(Date.UTC(wall.year, month - 1, 1));
      continue;
    }
    if (!matchesDay(fields, wall)) {
      wall = utcToWall(Date.UTC(wall.year, wall.month - 1, wall.day + 1));
      continue;
    }
    if (!fields.hour.has(wall.hour)) {
      const hour = firstAllowedAbove(fields.hour, wall.hour);
      wall = hour === undefined
        ? utcToWall(Date.UTC(wall.year, wall.month - 1, wall.day + 1))
        : { ...wall, hour, minute: firstMinute };
      continue;
    }
    if (!fields.minute.has(wall.minute)) {
      const minute = firstAllowedAbove(fields.minute, wall.minute);
      wall = minute === undefined
        ? utcToWall(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour + 1))
        : { ...wall, minute };
      continue;
    }
    const instant = instantFromWall(wall, timeZone);
    const actual = zoneWall(instant, timeZone);
    // Spring-forward gap: the wall reading does not exist, so the instant carries an
    // earlier local time. Skip it instead of firing at an unspecified moment — and
    // advance from the *candidate* wall, not from that earlier reading, or the search
    // would step backwards into the same gap forever.
    if (matchesWall(fields, actual)) return instant;
    wall = utcToWall(Math.max(wallAsUtc(wall), wallAsUtc(actual)) + MINUTE_MS);
  }
  return undefined;
}

/** Normalize an active window bound to an instant. Throws `invalid_schedule` when unusable. */
function parseInstant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new AutomationError('invalid_schedule', `${label} 不是有效时间。`);
  return parsed;
}

/**
 * Validate one schedule completely: shape, cron expression, zone, minimum interval and
 * active window. Throws the design's stable codes so both the page and the scheduler
 * report the same reason.
 */
export function assertSchedule(schedule: AutomationSchedule): void {
  if (!schedule || typeof schedule !== 'object') throw new AutomationError('invalid_schedule', '计划配置无效。');
  if (schedule.kind !== 'once' && schedule.kind !== 'cron') throw new AutomationError('invalid_schedule', '计划类型只能是单次或 cron。');
  assertTimeZone(schedule.timeZone);
  if (schedule.kind === 'once') {
    if (typeof schedule.at !== 'string' || !Number.isFinite(Date.parse(schedule.at))) {
      throw new AutomationError('invalid_schedule', '单次计划需要有效的执行时间。');
    }
  } else {
    if (typeof schedule.cron !== 'string') throw new AutomationError('invalid_cron', '请填写 cron 表达式。');
    const fields = parseCron(schedule.cron);
    assertMinimumInterval(fields, schedule.timeZone);
  }
  if (schedule.activeFrom !== undefined) parseInstant(schedule.activeFrom, '生效起始时间');
  if (schedule.activeUntil !== undefined) parseInstant(schedule.activeUntil, '生效结束时间');
  if (schedule.activeFrom !== undefined && schedule.activeUntil !== undefined
    && Date.parse(schedule.activeUntil) <= Date.parse(schedule.activeFrom)) {
    throw new AutomationError('invalid_schedule', '生效结束时间必须晚于起始时间。');
  }
}

/**
 * Enforce {@link AUTOMATION_MIN_INTERVAL_SECONDS}.
 *
 * Day-of-month and day-of-week restrictions only *remove* matches, so the unrestricted
 * daily pattern contains the smallest gap the expression can produce. Observing that one
 * pattern plus its wrap into the next day — `|hour| × |minute| + 1` consecutive runs — is
 * therefore enough for every restricted schedule too. Real instants are walked, so a DST
 * boundary is measured rather than assumed. Fewer steps would miss a gap that only shows
 * up across the day boundary, e.g. `58,2 23,0 * * *`.
 */
export function assertMinimumInterval(fields: CronFields, timeZone: string): void {
  const steps = fields.hour.size * fields.minute.size + 1;
  let cursor = Date.UTC(2024, 0, 1, 0, 0);
  let previous: number | undefined;
  for (let index = 0; index < steps; index += 1) {
    const next = nextRunAfter(fields, timeZone, cursor);
    if (next === undefined) return;
    if (previous !== undefined && next - previous < AUTOMATION_MIN_INTERVAL_SECONDS * 1000) {
      throw new AutomationError('interval_too_short', `触发间隔不能小于 ${AUTOMATION_MIN_INTERVAL_SECONDS} 秒。`);
    }
    previous = next;
    cursor = next;
  }
}

const withinWindow = (schedule: AutomationSchedule, instant: number): boolean => {
  if (schedule.activeFrom !== undefined && instant < Date.parse(schedule.activeFrom)) return false;
  if (schedule.activeUntil !== undefined && instant > Date.parse(schedule.activeUntil)) return false;
  return true;
};

/**
 * The next `count` instants this schedule would fire, strictly after `afterMs`.
 *
 * Read-only and stateless: no occurrence is written and no history is consulted, so a
 * preview can be shown for an unsaved rule. An empty result means the schedule really
 * has no further trigger inside its window or the search horizon.
 */
export function upcomingRuns(schedule: AutomationSchedule, afterMs: number, count: number): readonly number[] {
  const wanted = Math.max(1, Math.min(Math.trunc(count) || 1, AUTOMATION_PREVIEW_MAX_RUNS));
  if (schedule.kind === 'once') {
    const at = Date.parse(schedule.at ?? '');
    return Number.isFinite(at) && at > afterMs && withinWindow(schedule, at) ? [at] : [];
  }
  const fields = parseCron(schedule.cron ?? '');
  const runs: number[] = [];
  let cursor = alignMinute(afterMs);
  // Bounded by the same horizon as one search plus one extra step per collected run.
  for (let guard = 0; guard < SEARCH_HORIZON_DAYS && runs.length < wanted; guard += 1) {
    const next = nextRunAfter(fields, schedule.timeZone, cursor);
    if (next === undefined) break;
    if (schedule.activeUntil !== undefined && next > Date.parse(schedule.activeUntil)) break;
    if (schedule.activeFrom !== undefined && next < Date.parse(schedule.activeFrom)) {
      cursor = Date.parse(schedule.activeFrom) - MINUTE_MS;
      continue;
    }
    runs.push(next);
    cursor = next;
  }
  return runs;
}

/** ISO representation used by every stored field and by the transport. */
export const isoAt = (instantMs: number): string => new Date(instantMs).toISOString();
