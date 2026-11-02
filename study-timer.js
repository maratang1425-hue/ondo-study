// Timer math is independent of setInterval: suspended tabs catch up from timestamps.
(function (root) {
  'use strict';
  const TARGET_MS = 70 * 60 * 1000;
  const dayKey = time => { const d = new Date(time); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  function restore(value) {
    if (!value || value.version !== 1 || !['1','2','3'].includes(value.grade) || typeof value.id !== 'string' || !Array.isArray(value.segments) || !value.segments.length || value.segments.length > 10000) return null;
    let lastEnd = -Infinity;
    for (const [index, part] of value.segments.entries()) {
      if (!Number.isFinite(part.start) || part.start < lastEnd || (part.end === null && index !== value.segments.length - 1) || (part.end !== null && (!Number.isFinite(part.end) || part.end < part.start))) return null;
      lastEnd = part.end ?? part.start;
    }
    if (value.finished && value.segments.at(-1).end === null) return null;
    return { version:1, id:value.id, grade:value.grade, subject:typeof value.subject === 'string' ? value.subject : '', segments:value.segments.map(part => ({start:part.start,end:part.end})), finished:Boolean(value.finished) };
  }
  function create(id, grade, subject, now) { return { version:1, id, grade:String(grade), subject:subject || '', segments:[{start:now,end:null}], finished:false }; }
  function measure(state, now) {
    let elapsedMs = 0;
    const days = {};
    if (state) for (const part of state.segments) {
      const end = part.start + Math.min(Math.max(0, (part.end ?? now) - part.start), TARGET_MS - elapsedMs);
      elapsedMs += end - part.start;
      let cursor = part.start;
      while (cursor < end) {
        const d = new Date(cursor), midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        const until = Math.min(end, midnight), day = dayKey(cursor);
        days[day] = (days[day] || 0) + until - cursor;
        cursor = until;
      }
      if (elapsedMs >= TARGET_MS) break;
    }
    return { elapsedMs, remainingSeconds:Math.ceil((TARGET_MS - elapsedMs) / 1000), complete:elapsedMs >= TARGET_MS, running:Boolean(state && !state.finished && state.segments.at(-1)?.end === null && elapsedMs < TARGET_MS), days };
  }
  function pause(state, now) {
    if (!state) return null;
    const next = restore(state), last = next.segments.at(-1);
    if (last.end === null) {
      const previous = measure({...next,segments:next.segments.slice(0,-1)}, now).elapsedMs;
      last.end = last.start + Math.min(Math.max(0, now - last.start), TARGET_MS - previous);
    }
    return next;
  }
  function resume(state, now) {
    if (!state || state.finished || measure(state, now).complete) return state;
    const next = restore(state);
    if (next.segments.at(-1).end !== null) next.segments.push({start:Math.max(now,next.segments.at(-1).end),end:null});
    return next;
  }
  function finish(state, now) { const next = pause(state, now); if (next) next.finished = true; return next; }
  function records(state, now) {
    if (!state) return [];
    let elapsedMs = 0;
    return Object.entries(measure(state, now).days).flatMap(([date,ms]) => {
      const seconds = Math.floor((elapsedMs + ms) / 1000) - Math.floor(elapsedMs / 1000);
      elapsedMs += ms;
      return seconds ? [{ id:`focus-${state.id}-${date}`, grade:state.grade, date, subject:state.subject, seconds, minutes:seconds / 60, source:'pomodoro', timerId:state.id }] : [];
    });
  }
  function mergeSessions(remoteRows, localRows) {
    const rows = new Map((remoteRows || []).map(item => [item.id,item]));
    for (const item of localRows || []) {
      const previous = rows.get(item.id);
      if (!previous || item.source === 'pomodoro' && previous.timerId === item.timerId && Number(item.minutes) > Number(previous.minutes)) rows.set(item.id,item);
    }
    return [...rows.values()];
  }
  root.OndoStudyTimer = Object.freeze({ TARGET_MS, restore, create, measure, pause, resume, finish, records, mergeSessions });
})(globalThis);
