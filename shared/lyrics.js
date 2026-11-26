export function parseLrc(source) {
  const input = String(source).replace(/^\uFEFF/, '').replace(/\r/g, '');
  const offset = Number(input.match(/\[offset:\s*([+-]?\d+)\s*\]/i)?.[1] || 0);
  const result = [];
  for (const raw of input.split('\n')) {
    const tags = [...raw.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const tag of tags) {
      const fraction = Number((tag[3] || '').padEnd(3, '0'));
      const time = Math.max(0, Number(tag[1]) * 60000 + Number(tag[2]) * 1000 + fraction - offset) / 1000;
      result.push({ time, text });
    }
  }
  result.sort((a, b) => a.time - b.time);
  const merged = [];
  for (const line of result) {
    const last = merged.at(-1);
    if (last?.time === line.time) {
      if (line.text && last.text !== line.text) last.text = [last.text, line.text].filter(Boolean).join(' / ');
    } else merged.push({ ...line });
  }
  return merged.map((line, i) => ({ ...line, id: `line-${i}` }));
}

export function activeLineAt(lines, time) {
  let low = 0;
  let high = lines.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= time) { result = mid; low = mid + 1; }
    else high = mid - 1;
  }
  return result;
}

export function lineEnd(lines, index, duration) {
  return lines[index + 1]?.time ?? (Number.isFinite(duration) && duration > 0 ? duration : Infinity);
}

export function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function chineseCharacters(text) {
  return [...text].filter(char => /\p{Script=Han}/u.test(char));
}

export function annotatedCharacters(text, reading = '') {
  const syllables = reading.trim().split(/\s+/).filter(Boolean);
  let index = 0;
  return [...text].map(char => ({ char, pinyin: /\p{Script=Han}/u.test(char) ? syllables[index++] || '' : '' }));
}
