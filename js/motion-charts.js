/* User-authorized display timeline: generated daily distribution, current ledger
 * monthly totals. This is not a reconstruction of the actual transaction dates.
 * No cash entry, original record or persisted workspace is changed here. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const provenance = Object.freeze({ kind: 'user-authorized-display-series', version: 1,
    period: '2026-10', method: 'positive-weight-largest-remainder-cents',
    monthlyTotals: 'current-workspace-cash-ledger', actualTransactionDates: false });
  const displayTitle = '展示序列：经用户授权，按当前月收付款总额分摊为每日数据；不代表原始交易日期。';
  // Fixed positive weights provide varied dates and weeks without random drift
  // on reload. Amounts are apportioned in integer cents, including the remainder.
  const incomeWeights = Object.freeze([22,34,16,28,49,62,24,18,41,33,55,72,46,31,24,37,61,44,28,52,36,26,48,35,66,83,54,42,32,58,47]);
  const outWeights = Object.freeze([35,21,44,28,18,32,52,40,27,19,38,56,23,46,29,49,33,61,24,41,57,43,31,54,26,39,68,34,52,28,47]);
  const currency = value => '¥' + Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const dateLabel = day => '10/' + String(day).padStart(2, '0');
  const svgNode = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };
  const textNode = (text, attrs) => { const node = svgNode('text', attrs); node.textContent = text; return node; };
  let instance = null;

  function source() {
    const records = typeof transactions !== 'undefined' ? transactions : [];
    const initial = typeof openingCash === 'function' ? openingCash() : Number(window.AuroraOpeningCash) || 0;
    return { records, opening: initial };
  }

  function apportion(total, weights) {
    const weightSum = weights.reduce((sum, value) => sum + value, 0);
    const shares = weights.map((weight, index) => {
      const exact = total * weight / weightSum, cents = Math.floor(exact);
      return { index, cents, remainder: exact - cents };
    });
    const result = shares.map(share => share.cents);
    let remainder = total - result.reduce((sum, cents) => sum + cents, 0);
    shares.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (let i = 0; i < remainder; i++) result[shares[i % shares.length].index]++;
    return result;
  }

  function sumPeriod(days) {
    return { income: days.reduce((sum, row) => sum + Math.round(row.income * 100), 0) / 100,
      out: days.reduce((sum, row) => sum + Math.round(row.out * 100), 0) / 100 };
  }

  function buildDays(input) {
    const list = Array.isArray(input.records) ? input.records : [];
    const total = type => Math.max(0, Math.round(list.reduce((sum, row) => sum +
      (row.type === type ? Number(row.amount) || 0 : 0), 0) * 100));
    const receipts = apportion(total('in'), incomeWeights), payments = apportion(total('out'), outWeights);
    let balance = Math.round((Number(input.opening) || 0) * 100);
    return receipts.map((income, index) => {
      balance += income - payments[index];
      return { day: index + 1, income: income / 100, out: payments[index] / 100,
        balance: balance / 100, source: provenance.kind };
    });
  }

  function mount(barTarget, trendTarget, options = {}) {
    instance?.destroy();
    const bars = typeof barTarget === 'string' ? document.querySelector(barTarget) : barTarget;
    const trend = typeof trendTarget === 'string' ? document.querySelector(trendTarget) : trendTarget;
    if (!bars || !trend) return null;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const getData = options.getData || source;
    const abort = new AbortController();
    const on = (target, name, handler, extra = {}) => target.addEventListener(name, handler, { signal: abort.signal, ...extra });
    let geometryAbort = new AbortController();
    const onGeometry = (target, name, handler) => target.addEventListener(name, handler, { signal: geometryAbort.signal });
    let days = buildDays(getData());
    let focus = 0;
    let playing = !media.matches;
    let pointerInside = false;
    let keyboardInside = false;
    let visible = true;
    let mode = 'day';
    let elapsed = 0;
    let scheduled = 0;
    const interval = 2200;
    bars.classList.add('motion-card', 'motion-bars-card');
    trend.classList.add('motion-card', 'motion-trend-card');
    bars.innerHTML = `<div class="motion-head"><h2 title="${displayTitle}">收付款时间回放</h2><div class="motion-segment" aria-label="收付款统计周期"><button type="button" data-motion-mode="day" class="active" aria-pressed="true" title="逐日查看收付款展示序列">按日</button><button type="button" data-motion-mode="week" aria-pressed="false" title="按七日区间汇总展示序列">按周</button></div></div><div class="motion-summary"><span class="motion-focus-date"></span><span class="motion-legend"><i></i>收款 <i class="out"></i>付款</span></div><div class="motion-chart"></div><div class="motion-values"><span>收款 <strong data-motion-income></strong></span><span>付款 <strong data-motion-out></strong></span></div>`;
    trend.innerHTML = `<div class="motion-head"><h2 title="${displayTitle}">资金余额趋势</h2><button type="button" class="motion-play" data-motion-play aria-label="暂停图表时间回放" title="暂停或继续两个图表的时间回放"></button></div><div class="motion-balance"><strong data-motion-balance></strong><span class="motion-focus-date"></span></div><div class="motion-trend-sub"><span>当日净流入 <b data-motion-net></b></span><span>单位：元</span></div><div class="motion-chart"></div><div class="motion-timeline"><button type="button" data-motion-prev aria-label="查看前一天" title="前一天">‹</button><input type="range" min="1" max="31" value="1" step="1" aria-label="选择十月日期" title="拖动查看展示序列的当日收付款与余额"><button type="button" data-motion-next aria-label="查看后一天" title="后一天">›</button><span data-motion-status></span></div>`;
    const barHost = bars.querySelector('.motion-chart'), trendHost = trend.querySelector('.motion-chart');
    let barHeight = 0, geometrySize = '', resizeFrame = 0;
    let barSvg, trendSvg, trendCircle, trendFocus, trendHalo, trendX, trendY, barY, barScale;
    let barGroups = [];

    // Match viewBox units to rendered CSS pixels. A fixed 520x190 viewBox would
    // shrink both the plot and its labels inside the compact 128/115px cards.
    function chartSurface(host, label, prior) {
      const svg = svgNode('svg', { width: '100%', height: 190, role: 'group', 'aria-label': label });
      host.replaceChildren(svg);
      const box = svg.getBoundingClientRect();
      const W = Math.round(box.width * 2) / 2 || prior?.viewBox.baseVal.width || 520;
      const H = Math.round(box.height * 2) / 2 || prior?.viewBox.baseVal.height || 190;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      return { svg, W, H };
    }
    function geometrySignature() {
      return [barHost, trendHost].map(host => `${Math.round(host.clientWidth * 2) / 2}x${Math.round(host.clientHeight * 2) / 2}`).join('|');
    }

    function renderGeometry() {
      geometryAbort.abort();
      geometryAbort = new AbortController();
      const grouped = Array.from({ length: 5 }, (_, index) => {
        const start = index * 7, end = Math.min(31, start + 7);
        return sumPeriod(days.slice(start, end));
      });
      const values = mode === 'week' ? grouped : days;
      barScale = Math.max(1000, Math.ceil(Math.max(...values.flatMap(day => [day.income, day.out]), 1) / 1000) * 1000);
      const surface = chartSurface(barHost, '十月收付款展示序列，单位元', barSvg);
      const { W, H } = surface, L = 42, R = 8, T = 10, B = 24;
      const width = W - L - R, height = H - T - B;
      barHeight = height;
      barY = value => T + height - value / barScale * height;
      barSvg = surface.svg;
      for (let i = 0; i <= 4; i++) {
        const y = T + height * i / 4, value = barScale * (1 - i / 4);
        barSvg.append(svgNode('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'motion-grid' }));
        barSvg.append(textNode(value >= 10000 ? (value / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + '万' : value.toLocaleString('zh-CN'), { x: L - 8, y: y + 4, 'text-anchor': 'end', class: 'motion-axis' }));
      }
      barGroups = Array.from({ length: 7 }, (_, index) => {
        const count = mode === 'week' ? 5 : 7, slotWidth = width / count;
        const x = L + slotWidth * (index + .5);
        const bw = Math.min(18, Math.max(7, slotWidth * .27)), gap = Math.min(5, slotWidth * .08);
        const group = svgNode('g', { tabindex: '0', role: 'button', class: 'motion-bar-group', 'data-slot': index });
        const back = svgNode('rect', { x: x - slotWidth / 2 + 1, y: T - 5, width: slotWidth - 2, height: height + 10, rx: 7, class: 'motion-focus-background' });
        const income = svgNode('rect', { x: x - bw - gap / 2, y: T + height, width: bw, height: 0, rx: 3, class: 'motion-bar income' });
        const out = svgNode('rect', { x: x + gap / 2, y: T + height, width: bw, height: 0, rx: 3, class: 'motion-bar out' });
        const label = textNode('', { x, y: H - 8, 'text-anchor': 'middle', class: 'motion-axis' });
        const hit = svgNode('rect', { x: x - slotWidth / 2, y: T - 5, width: slotWidth, height: height + 15, fill: 'transparent' });
        group.append(back, income, out, label, hit);
        barSvg.append(group);
        onGeometry(group, 'pointerenter', () => { if (group.dataset.day) focusDay(Number(group.dataset.day) - 1, false); });
        onGeometry(group, 'focus', () => { if (group.dataset.day) focusDay(Number(group.dataset.day) - 1, false); });
        onGeometry(group, 'click', () => { if (group.dataset.day) focusDay(Number(group.dataset.day) - 1, true); });
        onGeometry(group, 'keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusDay(Number(group.dataset.day) - 1, true); }
        });
        return { group, income, out, label };
      });
      const trendSurface = chartSurface(trendHost, '十月逐日余额展示序列，焦点日期与左侧收付款同步', trendSvg);
      trendSvg = trendSurface.svg;
      const tw = trendSurface.W, th = trendSurface.H, tl = 14, tr = 14, tt = 12, tb = 24;
      const trendWidth = tw - tl - tr, trendHeight = th - tt - tb;
      const lo = Math.min(...days.map(row => row.balance)), hi = Math.max(...days.map(row => row.balance));
      const pad = Math.max(1000, (hi - lo) * .18);
      trendX = index => tl + trendWidth * index / 30;
      trendY = value => tt + trendHeight - (value - lo + pad) / (hi - lo + 2 * pad) * trendHeight;
      const gradientId = 'motion-trend-area';
      const defs = svgNode('defs');
      const gradient = svgNode('linearGradient', { id: gradientId, x1: 0, x2: 0, y1: 0, y2: 1 });
      gradient.append(svgNode('stop', { offset: 0, 'stop-color': '#ffffff', 'stop-opacity': '.28' }), svgNode('stop', { offset: 1, 'stop-color': '#ffffff', 'stop-opacity': '.015' }));
      defs.append(gradient); trendSvg.append(defs);
      for (let i = 0; i <= 3; i++) {
        const y = tt + trendHeight * i / 3;
        trendSvg.append(svgNode('line', { x1: tl, x2: tw - tr, y1: y, y2: y, class: 'motion-grid' }));
      }
      const line = days.map((day, index) => `${index ? 'L' : 'M'}${trendX(index)},${trendY(day.balance)}`).join(' ');
      trendSvg.append(svgNode('path', { d: `${line} L${tw - tr},${tt + trendHeight} L${tl},${tt + trendHeight} Z`, fill: `url(#${gradientId})` }));
      trendSvg.append(svgNode('path', { d: line, class: 'motion-trend-line' }));
      [0, 6, 12, 18, 24, 30].forEach(index => trendSvg.append(textNode(dateLabel(index + 1), { x: trendX(index), y: th - 7, 'text-anchor': index === 0 ? 'start' : index === 30 ? 'end' : 'middle', class: 'motion-axis' })));
      trendFocus = svgNode('line', { y1: tt - 4, y2: tt + trendHeight, class: 'motion-focus-line' });
      trendHalo = svgNode('circle', { r: 10, class: 'motion-point-halo' });
      trendCircle = svgNode('circle', { r: 4.5, class: 'motion-point' });
      trendSvg.append(trendFocus, trendHalo, trendCircle);
      days.forEach((day, index) => {
        const hit = svgNode('rect', { x: trendX(index) - trendWidth / 60, y: tt - 8, width: trendWidth / 30, height: trendHeight + 14, fill: 'transparent', 'data-day': day.day, tabindex: '-1' });
        onGeometry(hit, 'pointerenter', () => focusDay(index, false));
        onGeometry(hit, 'click', () => focusDay(index, true));
        trendSvg.append(hit);
      });
      geometrySize = geometrySignature();
    }

    function stateLabel() {
      const live = playing && !pointerInside && !keyboardInside;
      trend.querySelector('[data-motion-play]').textContent = playing ? 'Ⅱ' : '▶';
      trend.querySelector('[data-motion-play]').setAttribute('aria-label', playing ? '暂停图表时间回放' : '继续图表时间回放');
      trend.querySelector('[data-motion-play]').setAttribute('aria-pressed', String(!playing));
      trend.querySelector('[data-motion-status]').textContent = live ? '自动回放' : playing ? '聚焦查看' : '已暂停';
    }

    function update() {
      const row = days[focus];
      const lastWeek = Math.min(4, Math.floor(focus / 7));
      const sliceStart = Math.max(0, Math.min(24, focus - 3));
      const range = mode === 'week' ? `10月${lastWeek * 7 + 1}—${Math.min(31, lastWeek * 7 + 7)}日` : `2026年10月${row.day}日`;
      const summary = mode === 'week' ? sumPeriod(days.slice(lastWeek * 7, Math.min(31, lastWeek * 7 + 7))) : row;
      bars.querySelector('.motion-focus-date').textContent = range;
      trend.querySelector('.motion-focus-date').textContent = '2026年10月' + row.day + '日';
      bars.querySelector('[data-motion-income]').textContent = currency(summary.income);
      bars.querySelector('[data-motion-out]').textContent = currency(summary.out);
      trend.querySelector('[data-motion-balance]').textContent = currency(row.balance);
      const net = (Math.round(row.income * 100) - Math.round(row.out * 100)) / 100;
      trend.querySelector('[data-motion-net]').textContent = (net > 0 ? '+' : net < 0 ? '−' : '') + currency(Math.abs(net));
      trend.querySelector('input').value = String(row.day);
      trend.querySelector('input').setAttribute('aria-valuetext', `10月${row.day}日，余额${currency(row.balance)}，收款${currency(row.income)}，付款${currency(row.out)}`);
      barGroups.forEach((slot, index) => {
        let item = days[sliceStart + index];
        if (mode === 'week') {
          slot.group.style.display = index > 4 ? 'none' : '';
          if (index > 4) return;
          const start = index * 7;
          item = { day: start + 1, ...sumPeriod(days.slice(start, Math.min(31, start + 7))) };
          slot.label.textContent = `${start + 1}—${Math.min(31, start + 7)}日`;
        } else { slot.group.style.display = ''; slot.label.textContent = dateLabel(item.day); }
        slot.group.dataset.day = String(item.day);
        slot.group.setAttribute('aria-label', `${mode === 'week' ? '七日区间起始' : ''}10月${item.day}日：收款${currency(item.income)}，付款${currency(item.out)}`);
        slot.group.classList.toggle('is-focused', mode === 'week' ? index === lastWeek : item.day === row.day);
        for (const key of ['income', 'out']) {
          slot[key].setAttribute('y', barY(item[key]));
          slot[key].setAttribute('height', Math.max(0, barHeight * item[key] / barScale));
          slot[key].style.transitionDuration = (media.matches ? 0 : 720) + 'ms';
        }
      });
      const x = trendX(focus), y = trendY(row.balance);
      trendFocus.setAttribute('x1', x); trendFocus.setAttribute('x2', x);
      for (const circle of [trendCircle, trendHalo]) { circle.setAttribute('cx', x); circle.setAttribute('cy', y); }
      stateLabel();
      document.dispatchEvent(new CustomEvent('aurora:timefocus', { detail: { ...row, date: '2026-10-' + String(row.day).padStart(2, '0') } }));
    }

    function focusDay(index, manual) { focus = Math.max(0, Math.min(30, index)); elapsed = 0; if (manual) playing = false; update(); }
    function refresh() { days = buildDays(getData()); renderGeometry(); update(); }
    function requestRefresh() { clearTimeout(scheduled); scheduled = setTimeout(refresh, 50); }
    renderGeometry(); update();
    for (const element of [bars, trend]) {
      on(element, 'pointerenter', () => { pointerInside = true; stateLabel(); });
      on(element, 'pointerleave', () => { pointerInside = false; elapsed = 0; stateLabel(); });
      on(element, 'focusin', event => { keyboardInside = event.target.matches('input,.motion-bar-group'); stateLabel(); });
      on(element, 'focusout', () => { keyboardInside = false; stateLabel(); });
    }
    on(trend.querySelector('[data-motion-play]'), 'click', () => { playing = !playing; elapsed = 0; stateLabel(); });
    on(trend.querySelector('[data-motion-prev]'), 'click', () => focusDay((focus + 30) % 31, true));
    on(trend.querySelector('[data-motion-next]'), 'click', () => focusDay((focus + 1) % 31, true));
    on(trend.querySelector('input'), 'input', event => focusDay(Number(event.target.value) - 1, true));
    bars.querySelectorAll('[data-motion-mode]').forEach(button => on(button, 'click', () => {
      mode = button.dataset.motionMode;
      bars.querySelectorAll('[data-motion-mode]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
      renderGeometry(); update();
    }));
    on(document, 'aurora:finance-updated', requestRefresh);
    on(document, 'aurora:route', () => { elapsed = 0; requestRefresh(); });
    on(window, 'storage', requestRefresh);
    on(media, 'change', () => { if (media.matches) playing = false; stateLabel(); });
    const visibility = 'IntersectionObserver' in window ? new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); }, { threshold: .05 }) : null;
    visibility?.observe(bars);
    const stats = document.querySelector('#stats');
    const observer = stats ? new MutationObserver(requestRefresh) : null;
    observer?.observe(stats, { childList: true, subtree: true, characterData: true });
    const resize = new ResizeObserver(() => {
      if (!barHost.clientWidth || !trendHost.clientWidth || geometrySignature() === geometrySize) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (!barHost.clientWidth || !trendHost.clientWidth || geometrySignature() === geometrySize) return;
        renderGeometry(); update();
      });
    });
    resize.observe(barHost); resize.observe(trendHost);
    const ticker = setInterval(() => {
      const home = document.querySelector('#home');
      if (!playing || pointerInside || keyboardInside || !visible || document.hidden || home?.hidden || document.querySelector('dialog[open]')) { elapsed = 0; return; }
      elapsed += 200;
      if (elapsed >= interval) { focus = (focus + 1) % days.length; elapsed = 0; update(); }
    }, 200);
    instance = {
      refresh, focusDay: day => focusDay(Number(day) - 1, true),
      play() { playing = true; elapsed = 0; stateLabel(); },
      pause() { playing = false; stateLabel(); },
      getState() { return { playing, day: focus + 1, mode, current: { ...days[focus] }, provenance }; },
      destroy() { abort.abort(); geometryAbort.abort(); clearInterval(ticker); clearTimeout(scheduled); cancelAnimationFrame(resizeFrame); resize.disconnect(); visibility?.disconnect(); observer?.disconnect(); }
    };
    return instance;
  }
  window.AuroraMotionCharts = { mount, refresh: () => instance?.refresh(), destroy: () => instance?.destroy(), getState: () => instance?.getState(), buildDays, provenance };
})();
