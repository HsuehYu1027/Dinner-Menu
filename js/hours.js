/**
 * 營業時間的計算與顯示。
 *
 * 這個檔案不碰 DOM、不讀取全域狀態，所有輸入都由參數傳入 —— 包含「現在時間」。
 * 之所以把 now 當參數，是為了能在 test/hours.test.html 裡注入固定時間來驗證
 * 跨夜、午休、公休這些不容易手動測到的情況。
 *
 * hours 資料格式：
 *   key 為 "0"–"6"，對應 Date.getDay()，0 = 週日
 *   value 為當天時段陣列，每天最多兩段
 *   空陣列 = 當天公休
 *   收店時間 <= 開店時間 → 跨夜營業（例："17:00" → "02:00" 是到隔天凌晨 2 點）
 */

export const DAY_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

const MINUTES_PER_DAY = 24 * 60;
const CLOSING_SOON_MINUTES = 60; // 距離打烊多久算「即將打烊」

/** "HH:MM" → 從當天 00:00 起算的分鐘數。格式不合法時回傳 null。 */
export function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 分鐘數 → "HH:MM"。超過一天的部分會自動繞回（1500 → "01:00"）。 */
export function toTimeLabel(minutes) {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 補齊 7 天的 key，並濾掉格式不正確的時段，讓後續程式碼不用一直做防呆。 */
export function normalizeHours(hours) {
  const result = {};
  for (let day = 0; day < 7; day += 1) {
    const raw = hours && Array.isArray(hours[String(day)]) ? hours[String(day)] : [];
    result[String(day)] = raw
      .filter((seg) => Array.isArray(seg) && toMinutes(seg[0]) !== null && toMinutes(seg[1]) !== null)
      .map((seg) => [seg[0], seg[1]]);
  }
  return result;
}

/** 取得某天的時段，並換算成絕對分鐘數。跨夜的時段 end 會超過 1440。 */
function segmentsOf(hours, day) {
  const list = Array.isArray(hours?.[String(day)]) ? hours[String(day)] : [];
  return list
    .map((seg) => {
      const start = toMinutes(seg?.[0]);
      const end = toMinutes(seg?.[1]);
      if (start === null || end === null) return null;
      // 收店 <= 開店 視為跨夜，把收店時間推到隔天
      return { start, end: end <= start ? end + MINUTES_PER_DAY : end };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

/** 這個時段是否跨夜（顯示時會標註「隔日」）。 */
export function isOvernight(seg) {
  const start = toMinutes(seg?.[0]);
  const end = toMinutes(seg?.[1]);
  if (start === null || end === null) return false;
  return end <= start;
}

/**
 * 把一天的時段排成可讀文字，例如「11:00–14:00、17:00–20:30」。
 * 沒有時段時回傳「公休」。
 */
export function formatDayHours(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return '公休';
  return segments
    .map((seg) => `${seg[0]}–${seg[1]}${isOvernight(seg) ? '（隔日）' : ''}`)
    .join('、');
}

/** 這家店有沒有設定過任何營業時間。 */
export function hasAnyHours(hours) {
  for (let day = 0; day < 7; day += 1) {
    if (segmentsOf(hours, day).length > 0) return true;
  }
  return false;
}

/**
 * 從 now 往後找下一次開店的時間。
 * 掃 8 天（0–7）是為了涵蓋「只有週一營業，而現在是週一下午已收店」→ 下週一才開。
 */
function findNextOpening(hours, now) {
  const today = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (let offset = 0; offset <= 7; offset += 1) {
    const day = (today + offset) % 7;
    for (const seg of segmentsOf(hours, day)) {
      const absoluteStart = offset * MINUTES_PER_DAY + seg.start;
      if (absoluteStart > nowMinutes) {
        return {
          day,
          daysAhead: offset,
          time: toTimeLabel(seg.start),
          minutesUntil: absoluteStart - nowMinutes,
        };
      }
    }
  }
  return null;
}

function nextOpeningLabel(next) {
  if (!next) return '休息中';
  if (next.daysAhead === 0) return `休息中 · 今天 ${next.time} 開`;
  if (next.daysAhead === 1) return `休息中 · 明天 ${next.time} 開`;
  return `休息中 · ${DAY_NAMES[next.day]} ${next.time} 開`;
}

/**
 * 判斷店家目前狀態。
 *
 * @param {object}  hours      stores.hours 欄位
 * @param {boolean} tempClosed stores.temp_closed 欄位
 * @param {Date}    now        現在時間（測試時可注入固定值）
 * @returns {{state: 'open'|'closing_soon'|'closed', label: string,
 *            isOpen: boolean, closesAt: string|null, nextOpen: object|null}}
 */
export function getStoreStatus(hours, tempClosed = false, now = new Date()) {
  if (tempClosed) {
    return { state: 'closed', label: '臨時公休', isOpen: false, closesAt: null, nextOpen: null };
  }

  if (!hasAnyHours(hours)) {
    return { state: 'closed', label: '未設定營業時間', isOpen: false, closesAt: null, nextOpen: null };
  }

  const today = now.getDay();
  const yesterday = (today + 6) % 7;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // 依序找出「現在正落在哪一個時段裡」，記下該時段的收店時間（以今天 00:00 起算）
  let closeAt = null;

  // 先看昨天的跨夜時段 —— 週二 17:00–02:00 在週三凌晨一點仍然是營業中，
  // 只檢查今天的話會誤判成休息中。
  for (const seg of segmentsOf(hours, yesterday)) {
    if (seg.end > MINUTES_PER_DAY && nowMinutes < seg.end - MINUTES_PER_DAY) {
      closeAt = seg.end - MINUTES_PER_DAY;
      break;
    }
  }

  // 再看今天的時段
  if (closeAt === null) {
    for (const seg of segmentsOf(hours, today)) {
      if (nowMinutes >= seg.start && nowMinutes < seg.end) {
        closeAt = seg.end;
        break;
      }
    }
  }

  if (closeAt === null) {
    const nextOpen = findNextOpening(hours, now);
    return {
      state: 'closed',
      label: nextOpeningLabel(nextOpen),
      isOpen: false,
      closesAt: null,
      nextOpen,
    };
  }

  const minutesLeft = closeAt - nowMinutes;
  const closesAtLabel = toTimeLabel(closeAt);

  if (minutesLeft <= CLOSING_SOON_MINUTES) {
    return {
      state: 'closing_soon',
      label: `即將打烊 · ${closesAtLabel} 收`,
      isOpen: true,
      closesAt: closesAtLabel,
      nextOpen: null,
    };
  }

  return {
    state: 'open',
    label: `營業中 · ${closesAtLabel} 打烊`,
    isOpen: true,
    closesAt: closesAtLabel,
    nextOpen: null,
  };
}

/**
 * 檢查編輯畫面填的時間有沒有問題，回傳錯誤訊息陣列（空陣列代表沒問題）。
 * 只擋真正會壞掉的情況：時間格式錯、只填一半、同一天兩段重疊。
 */
export function validateHours(hours) {
  const errors = [];

  for (let day = 0; day < 7; day += 1) {
    const list = Array.isArray(hours?.[String(day)]) ? hours[String(day)] : [];
    const parsed = [];

    for (const seg of list) {
      const openRaw = seg?.[0] ?? '';
      const closeRaw = seg?.[1] ?? '';
      if (!openRaw && !closeRaw) continue;

      if (!openRaw || !closeRaw) {
        errors.push(`${DAY_NAMES[day]}：開始與結束時間要一起填`);
        continue;
      }
      const start = toMinutes(openRaw);
      const end = toMinutes(closeRaw);
      if (start === null || end === null) {
        errors.push(`${DAY_NAMES[day]}：時間格式不正確`);
        continue;
      }
      parsed.push({ start, end: end <= start ? end + MINUTES_PER_DAY : end });
    }

    parsed.sort((a, b) => a.start - b.start);
    for (let i = 1; i < parsed.length; i += 1) {
      if (parsed[i].start < parsed[i - 1].end) {
        errors.push(`${DAY_NAMES[day]}：兩個時段重疊了`);
        break;
      }
    }
  }

  return errors;
}
