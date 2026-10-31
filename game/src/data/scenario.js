// 附录 D.4：情境系数（天气段与校历段各取一行，客流与品类系数按正文 3.10 两段相乘）
export const WEATHER = {
  sunny: { id: 'sunny', name: '晴', traffic: 1.0, cat: { MB: 1.0, MT: 1.0, VG: 1.0, BF: 1.0, NS: 1.0 }, T: 1.0, takeaway: 'base' },
  cloudy: { id: 'cloudy', name: '阴', traffic: 1.0, cat: { MB: 1.0, MT: 1.0, VG: 1.0, BF: 1.0, NS: 1.0 }, T: 1.0, takeaway: 'base' },
  rain: { id: 'rain', name: '雨天', traffic: 0.9, cat: { MB: 1.0, MT: 1.0, VG: 0.8, BF: 1.0, NS: 1.4 }, T: 1.4, takeaway: 'rain' },
  heat: { id: 'heat', name: '高温', traffic: 1.0, cat: { MB: 1.0, MT: 1.0, VG: 1.2, BF: 1.2, NS: 1.0 }, T: 0.8, takeaway: 'base' },
};

export const CALENDAR = {
  school: { id: 'school', name: '开学·社团活动周', traffic: 1.3, cat: { MB: 1.3, MT: 1.2, VG: 1.0, BF: 1.0, NS: 1.0 }, T: 1.0, avgJin: 1.0 },
  normal: { id: 'normal', name: '平稳期', traffic: 1.0, cat: { MB: 1.0, MT: 1.0, VG: 1.0, BF: 1.0, NS: 1.0 }, T: 1.0, avgJin: 1.0 },
  exam: { id: 'exam', name: '考试周', traffic: 1.15, cat: { MB: 1.0, MT: 1.0, VG: 1.0, BF: 1.0, NS: 1.3 }, T: 1.0, avgJin: 0.85 },
  holiday: { id: 'holiday', name: '假期', traffic: 0.6, cat: { MB: 0.8, MT: 0.8, VG: 0.8, BF: 0.8, NS: 0.8 }, T: 0.8, avgJin: 1.0 },
};

// 正文 3.10：28 天学期循环（开学周 5 → 平稳期 13 → 考试周 5 → 假期 5）
export function calendarPhaseOf(semesterDay) {
  if (semesterDay <= 5) return CALENDAR.school;
  if (semesterDay <= 18) return CALENDAR.normal;
  if (semesterDay <= 23) return CALENDAR.exam;
  return CALENDAR.holiday;
}

// 供应端联动（正文 3.10 表 + 附录 D.1 第 7 条）：只在标价上后乘，不改单价与品质
export function supplyPriceMods(weather, calendar) {
  const mods = [];
  if (weather.id === 'rain') mods.push({ cat: 'VG', tier: 1, mult: 1.3, note: '雨天晨采青菜涨价' });
  if (calendar.id === 'school') mods.push({ cat: null, tier: null, mult: 1.1, note: '开学周全线小涨' });
  return mods;
}

// M1 情境简版：晴/雨两态 + 明日预报。正文 3.10 要求首个循环"以晴/阴为主 + 1 个雨天（教学）"，
// 样段内这个雨天落进第 1–10 天，保证 过称迟疑 的观察窗口与 T=1.4 的汤底封顶都被跑到。
export function buildWeatherCycle(randFloat, sampleDays) {
  const cycle = [];
  const rainDay = 1 + Math.floor(randFloat('weather', 0) * sampleDays);
  for (let d = 1; d <= 28; d++) {
    if (d === rainDay) cycle.push('rain');
    else cycle.push(randFloat('weather', d) < 0.5 ? 'sunny' : 'cloudy');
  }
  return cycle;
}

export function scenarioOf(weatherId, semesterDay) {
  const weather = WEATHER[weatherId];
  const calendar = calendarPhaseOf(semesterDay);
  const cat = {};
  for (const k of ['MB', 'MT', 'VG', 'BF', 'NS']) cat[k] = weather.cat[k] * calendar.cat[k];
  return {
    weather, calendar,
    trafficTotal: weather.traffic * calendar.traffic,
    catCoef: cat,
    T: weather.T,
    avgJin: calendar.avgJin,
    takeawayShare: weather.takeaway === 'rain' ? 0.7 : 0.4,
    priceMods: supplyPriceMods(weather, calendar),
    examWeek: calendar.id === 'exam',
    label: `${weather.name}｜${calendar.name}`,
  };
}

export function forecastLabel(scenario) {
  return `${scenario.weather.name} · ${scenario.calendar.name}`;
}
