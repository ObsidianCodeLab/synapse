import type { TimeRange } from '@rd-view/types';

const TZ_OFFSET = '+08:00';

type Ymd = { year: number; month: number; day: number };

function getShanghaiYmd(now: Date): Ymd {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, day] = formatted.split('-').map(Number);
  return { year, month, day };
}

/** 周一=1 … 周日=7（上海时区） */
function getShanghaiWeekdayMondayFirst(now: Date): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
  }).format(now);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[weekday] ?? 1;
}

function addDays(ymd: Ymd, delta: number): Ymd {
  const utc = Date.UTC(ymd.year, ymd.month - 1, ymd.day + delta, 12);
  const next = new Date(utc);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatIso(year: number, month: number, day: number, boundary: 'start' | 'end'): string {
  const time = boundary === 'start' ? '00:00:00' : '23:59:59';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${time}${TZ_OFFSET}`;
}

/** 按视图 Segmented（日/周/月/季/年）计算 rd_view_query 的 begin_time / end_time */
export function getRdViewTimeRangeBounds(
  range: TimeRange,
  now: Date = new Date(),
): { begin_time: string; end_time: string } {
  const today = getShanghaiYmd(now);

  switch (range) {
    case 'day':
      return {
        begin_time: formatIso(today.year, today.month, today.day, 'start'),
        end_time: formatIso(today.year, today.month, today.day, 'end'),
      };
    case 'week': {
      const weekday = getShanghaiWeekdayMondayFirst(now);
      const monday = addDays(today, -(weekday - 1));
      const sunday = addDays(monday, 6);
      return {
        begin_time: formatIso(monday.year, monday.month, monday.day, 'start'),
        end_time: formatIso(sunday.year, sunday.month, sunday.day, 'end'),
      };
    }
    case 'month': {
      const lastDay = daysInMonth(today.year, today.month);
      return {
        begin_time: formatIso(today.year, today.month, 1, 'start'),
        end_time: formatIso(today.year, today.month, lastDay, 'end'),
      };
    }
    case 'quarter': {
      const quarterStartMonth = Math.floor((today.month - 1) / 3) * 3 + 1;
      const quarterEndMonth = quarterStartMonth + 2;
      const lastDay = daysInMonth(today.year, quarterEndMonth);
      return {
        begin_time: formatIso(today.year, quarterStartMonth, 1, 'start'),
        end_time: formatIso(today.year, quarterEndMonth, lastDay, 'end'),
      };
    }
    case 'year':
      return {
        begin_time: formatIso(today.year, 1, 1, 'start'),
        end_time: formatIso(today.year, 12, 31, 'end'),
      };
  }
}

/** 与当前 Segmented 周期等长的上一周期（用于 KPI 环比） */
export function getPreviousRdViewTimeRangeBounds(
  range: TimeRange,
  now: Date = new Date(),
): { begin_time: string; end_time: string } {
  const today = getShanghaiYmd(now);

  switch (range) {
    case 'day': {
      const yesterday = addDays(today, -1);
      return {
        begin_time: formatIso(yesterday.year, yesterday.month, yesterday.day, 'start'),
        end_time: formatIso(yesterday.year, yesterday.month, yesterday.day, 'end'),
      };
    }
    case 'week': {
      const weekday = getShanghaiWeekdayMondayFirst(now);
      const monday = addDays(today, -(weekday - 1));
      const prevMonday = addDays(monday, -7);
      const prevSunday = addDays(prevMonday, 6);
      return {
        begin_time: formatIso(prevMonday.year, prevMonday.month, prevMonday.day, 'start'),
        end_time: formatIso(prevSunday.year, prevSunday.month, prevSunday.day, 'end'),
      };
    }
    case 'month': {
      let year = today.year;
      let month = today.month - 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      const lastDay = daysInMonth(year, month);
      return {
        begin_time: formatIso(year, month, 1, 'start'),
        end_time: formatIso(year, month, lastDay, 'end'),
      };
    }
    case 'quarter': {
      const quarterStartMonth = Math.floor((today.month - 1) / 3) * 3 + 1;
      let prevStartMonth = quarterStartMonth - 3;
      let year = today.year;
      if (prevStartMonth < 1) {
        prevStartMonth += 12;
        year -= 1;
      }
      const prevEndMonth = prevStartMonth + 2;
      const lastDay = daysInMonth(year, prevEndMonth);
      return {
        begin_time: formatIso(year, prevStartMonth, 1, 'start'),
        end_time: formatIso(year, prevEndMonth, lastDay, 'end'),
      };
    }
    case 'year':
      return {
        begin_time: formatIso(today.year - 1, 1, 1, 'start'),
        end_time: formatIso(today.year - 1, 12, 31, 'end'),
      };
  }
}
