import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const SCHOOL = { name: '운호고등학교', homepage: 'https://school.cbe.go.kr/unho-h', mealUrl: 'https://school.cbe.go.kr/unho-h/M01080301/list', comciCode: 69092, timetableUrl: 'http://comci.net:4082/st' };
const PREVIOUS_URL = 'https://maratang1425-hue.github.io/ondo-study/school-data.json';
const COMCI_ORIGIN = 'http://comci.net:4082';
const koreaDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const dateKey = compact => `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}`;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function plainText(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, value) => String.fromCodePoint(value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseMeals(html, month) {
  if (!html.includes('운호고등학교') || !html.includes(`${Number(month.slice(0,4))}년 ${Number(month.slice(5,7))}월`)) throw new Error('학교 식단 페이지의 학교명 또는 월이 일치하지 않습니다.');
  const days = {};
  for (const match of html.matchAll(/<a\b[^>]*href="[^"]*\/M01080301\/list\?ymd=(\d{8})"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const date = dateKey(match[1]);
    if (!date.startsWith(month) || !validDate(date)) continue;
    for (const meal of match[2].matchAll(/<dl\b[^>]*>\s*<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>\s*<\/dl>/gi)) {
      const type = plainText(meal[1]);
      if (!['중식', '석식'].includes(type)) continue;
      const dishes = Array.from(meal[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi), item => plainText(item[1])).filter(Boolean);
      if (!dishes.length) continue;
      days[date] ||= {};
      days[date][type === '중식' ? 'lunch' : 'dinner'] = dishes;
    }
  }
  return days;
}

export function parseTimetable(raw) {
  const start = raw['시작일'];
  if (!validDate(start) || !Array.isArray(raw['자료147']) || !Array.isArray(raw['자료492'])) throw new Error('컴시간 시간표 응답 형식이 변경되었습니다.');
  const limit = raw['열람제한일'];
  const hasLimit = validDate(limit) && Number(limit.slice(0,4)) >= 2014;
  const counts = raw['학급수']?.slice(1,4).map(value => Math.min(40, Math.max(0, Number(value) || 0))) || [];
  const days = {};
  for (let weekday = 1; weekday <= 5; weekday++) {
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + weekday - 1);
    const key = date.toISOString().slice(0,10);
    if (hasLimit && key >= limit) continue;
    const classes = {};
    for (let grade = 1; grade <= 3; grade++) {
      for (let room = 1; room <= (counts[grade - 1] || 0); room++) {
        const codes = raw['자료147']?.[grade]?.[room]?.[weekday];
        if (!Array.isArray(codes)) continue;
        const lessons = [];
        for (let period = 1; period <= Math.min(codes.length - 1, 12); period++) {
          const code = String(codes[period] ?? '');
          if (!/^>?\d+$/.test(code)) continue;
          const value = Number(code.replace(/^>/, ''));
          const teacherIndex = value % 1000;
          const subjectIndex = Math.floor(value / 1000) % 1000;
          const subject = raw['자료492'][subjectIndex];
          if (!teacherIndex || typeof subject !== 'string' || !subject.trim()) continue;
          const group = Math.floor(value / 1000000);
          const original = raw['자료481']?.[grade]?.[room]?.[weekday]?.[period];
          const changed = raw['변경알림'] === 1 ? code.startsWith('>') : String(original ?? '') !== code;
          const time = String(raw['일과시간']?.[period - 1] || '').match(/\d{2}:\d{2}/)?.[0] || '';
          lessons.push({ period, time, subject: `${group >= 1 && group <= 26 ? `${String.fromCharCode(64 + group)} · ` : ''}${subject.trim()}`, changed });
        }
        classes[`${grade}-${room}`] = lessons;
      }
    }
    days[key] = classes;
  }
  return { days, classCounts: counts, modifiedAt: String(raw['자료244'] || '') };
}

async function get(url, encoding = 'utf-8') {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'OndoStudy/1.0 (personal school dashboard)', 'Accept': '*/*' } });
  if (!response.ok) throw new Error(`자료 서버 응답 ${response.status}`);
  return new TextDecoder(encoding).decode(await response.arrayBuffer());
}
const parseComciJson = text => JSON.parse(text.slice(0, text.lastIndexOf('}') + 1));

async function collectMeals(now) {
  const current = koreaDate(now).slice(0,7);
  const next = new Date(`${current}-01T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const months = [current, next.toISOString().slice(0,7)];
  const results = await Promise.allSettled(months.map(async month => parseMeals(await get(`${SCHOOL.mealUrl}?ymd=${month.replace('-', '')}01`), month)));
  const days = {};
  const availableMonths = [];
  results.forEach((result,index) => { if (result.status === 'fulfilled') { Object.assign(days, result.value); availableMonths.push(months[index]); } });
  if (!availableMonths.length) throw new Error('학교 홈페이지 식단을 불러오지 못했습니다.');
  return { status: availableMonths.length === months.length ? 'ok' : 'partial', fetchedAt: now.toISOString(), months: availableMonths, days };
}

async function collectTimetable(now) {
  const page = await get(SCHOOL.timetableUrl, 'euc-kr');
  const endpoint = page.match(/url:\s*['"]\.\/(\d+)\?17384l/)?.[1];
  const token = page.match(/sc_data\(['"](\d+_)['"],sc,1/)?.[1];
  if (!endpoint || !token) throw new Error('컴시간 학생용 요청 형식이 변경되었습니다.');
  const requestWeek = async week => parseComciJson(await get(`${COMCI_ORIGIN}/${endpoint}?${Buffer.from(`${token}${SCHOOL.comciCode}_0_${week}`).toString('base64')}`));
  const first = await requestWeek(1);
  const remaining = (first['일자자료'] || []).map(row => Number(row[0])).filter(value => value > 1 && value <= 3);
  const results = await Promise.allSettled(remaining.map(requestWeek));
  const parsed = [parseTimetable(first)];
  results.forEach(result => { if (result.status === 'fulfilled') parsed.push(parseTimetable(result.value)); });
  return { status: results.some(result => result.status === 'rejected') ? 'partial' : 'ok', fetchedAt: now.toISOString(), modifiedAt: parsed[0].modifiedAt, classCounts: parsed[0].classCounts, days: Object.assign({}, ...parsed.map(item => item.days)) };
}

export async function buildSchoolData(outputPath = '_site/school-data.json', now = new Date()) {
  let previous = null;
  try { previous = JSON.parse(await get(PREVIOUS_URL)); } catch { /* The first deployment has no snapshot. */ }
  const results = await Promise.allSettled([collectMeals(now), collectTimetable(now)]);
  const output = { schemaVersion: 1, school: SCHOOL.name, mealUrl: SCHOOL.mealUrl, timetableUrl: SCHOOL.timetableUrl, attemptedAt: now.toISOString() };
  ['meals', 'timetable'].forEach((key,index) => {
    const result = results[index];
    if (result.status === 'fulfilled') output[key] = result.value;
    else {
      const cached = previous?.schemaVersion === 1 && previous.school === SCHOOL.name ? previous[key] : null;
      output[key] = cached?.days ? { ...cached, status: 'stale' } : { status: 'unavailable', fetchedAt: null, days: {} };
      console.warn(`${key}: ${result.reason?.message || 'source unavailable'}`);
    }
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output)}\n`);
  console.log(`School snapshot ready: meals=${output.meals.status}, timetable=${output.timetable.status}`);
  return output;
}
