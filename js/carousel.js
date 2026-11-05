(() => {
  const groups = ['.statements-section', '.operations-grid', '.insights-grid'].map(s => document.querySelector(s));
  if (groups.some(group => !group)) return;
  const labels = ['三大报表', '报销与付款', '整车成本与概览'];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const carousel = document.createElement('section');
  carousel.className = 'dashboard-carousel';
  carousel.setAttribute('aria-label', '财务概览');
  carousel.setAttribute('aria-roledescription', '轮播');
  carousel.innerHTML = `<div class="carousel-toolbar"><div class="carousel-tabs" aria-label="选择概览板块">${labels.map((label, i) => `<button type="button" data-slide="${i}" aria-controls="dashboard-slide-${i}" aria-pressed="${i === 0}"><span>0${i + 1}</span>${label}</button>`).join('')}</div><div class="carousel-controls"><span class="carousel-status"></span><button type="button" data-carousel="previous" aria-label="上一组">‹</button><button type="button" data-carousel="play" aria-label="暂停自动轮播"></button><button type="button" data-carousel="next" aria-label="下一组">›</button></div></div><div class="carousel-viewport"></div>`;
  groups[0].before(carousel);
  const viewport = carousel.querySelector('.carousel-viewport');
  const slides = groups.map((group, i) => {
    const slide = document.createElement('div');
    slide.className = 'dashboard-slide';
    slide.id = `dashboard-slide-${i}`;
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', '幻灯片');
    slide.setAttribute('aria-label', `${i + 1} / 3 · ${labels[i]}`);
    slide.append(group);
    viewport.append(slide);
    return slide;
  });
  let active = 2, playing = !reducedMotion.matches, timer, busy = false, queued = null;
  let hovering = false;
  const interval = 5000;
  const playButton = carousel.querySelector('[data-carousel="play"]');
  const status = carousel.querySelector('.carousel-status');
  function suspended() {
    return document.hidden || document.querySelector('#home').hidden || hovering || !!document.querySelector('dialog[open]') || slides[active].contains(document.activeElement);
  }
  function updateHeight() {
    if(document.body.classList.contains('home-v2')&&innerWidth>1100){viewport.style.removeProperty('height');return;}
    const height = innerWidth > 900 ? Math.max(...slides.map(s => s.scrollHeight)) : slides[active].scrollHeight;
    viewport.style.height = `${Math.ceil(height) + 4}px`;
  }
  function updateControls() {
    carousel.querySelectorAll('[data-slide]').forEach((button, i) => button.setAttribute('aria-pressed', String(i === active)));
    slides.forEach((slide, i) => {
      slide.inert = i !== active;
      slide.setAttribute('aria-hidden', String(i !== active));
      slide.classList.toggle('is-active', i === active);
    });
    playButton.textContent = playing ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label', playing ? '暂停自动轮播' : '开始自动轮播');
    status.textContent = `${active + 1} / 3 · ${!playing ? '已暂停' : suspended() ? '阅读中' : '每5秒切换'}`;
  }
  function schedule() {
    clearTimeout(timer);
    updateControls();
    if (playing && !suspended() && !busy) timer = setTimeout(() => show(active + 1), interval);
  }
  async function show(index, direction = 1) {
    index = (index + slides.length) % slides.length;
    if (busy) { queued = [index, direction]; return; }
    if (index === active) { schedule(); return; }
    clearTimeout(timer);
    busy = true;
    const outgoing = slides[active], incoming = slides[index];
    active = index;
    updateControls();
    updateHeight();
    outgoing.classList.add('is-moving');
    incoming.classList.add('is-moving');
    const options = { duration: reducedMotion.matches ? 0 : 620, easing: 'cubic-bezier(.22,.68,.2,1)' };
    await Promise.all([
      outgoing.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-direction * 103}%)`, opacity: .35 }], options).finished,
      incoming.animate([{ transform: `translateX(${direction * 103}%)`, opacity: .35 }, { transform: 'translateX(0)', opacity: 1 }], options).finished
    ]);
    outgoing.classList.remove('is-moving');
    incoming.classList.remove('is-moving');
    busy = false;
    if (queued) { const target = queued; queued = null; show(...target); }
    else schedule();
  }
  carousel.querySelector('.carousel-toolbar').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.slide !== undefined) {
      const index = Number(button.dataset.slide);
      show(index, index < active ? -1 : 1);
    } else if (button.dataset.carousel === 'play') { playing = !playing; schedule(); }
    else if (button.dataset.carousel === 'previous') show(active - 1, -1);
    else if (button.dataset.carousel === 'next') show(active + 1);
  });
  viewport.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovering = true; schedule(); } });
  viewport.addEventListener('pointerleave', () => { hovering = false; schedule(); });
  viewport.addEventListener('focusin', schedule);
  viewport.addEventListener('focusout', () => setTimeout(schedule, 0));
  let touchStart;
  viewport.addEventListener('touchstart', event => {
    if (event.target.closest('button, input, select, .table-scroll, [tabindex]')) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  viewport.addEventListener('touchend', event => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) show(active + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  }, { passive: true });
  viewport.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('aurora:route', schedule);
  const dialog = document.querySelector('#dialog');
  if (dialog) new MutationObserver(schedule).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  document.querySelector('#globalSearch')?.addEventListener('input', event => { if (event.target.value.trim()) show(1); });
  const observer = new ResizeObserver(updateHeight);
  groups.forEach(group => observer.observe(group));
  window.addEventListener('resize', updateHeight);
  window.addEventListener('pagehide', () => clearTimeout(timer));
  window.addEventListener('pageshow', schedule);
  reducedMotion.addEventListener('change', () => { playing = !reducedMotion.matches; schedule(); });
  updateHeight();
  schedule();
})();
