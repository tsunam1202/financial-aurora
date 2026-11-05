/* Presentation only: no business data, storage, field values or actions are changed. */
(() => {
  'use strict';
  const page = document.getElementById('suitePage');
  const dialog = document.getElementById('dialog');
  if (!page || page.dataset.visualV3) return;
  page.dataset.visualV3 = 'ready';
  const routeNames = {
    '待办中心':'tasks','业务联动':'workflow','收支流水':'cash',
    '报销与付款':'expenses','采购与供应商':'purchases','库存台账':'inventory',
    '赞助与应收':'sponsors','SKU 与销售':'sales','整车成本 / BOM':'bom',
    '项目预算':'budgets','工资与薪酬':'payroll','研发成本':'research',
    '报表中心':'reports','飞书 OA':'feishu','管理设置':'settings'
  };
  let scheduled = false;
  // Explicit column names keep part names, source identifiers and numeric SKUs untouched.
  const amountHeader = /^(?:金额|合同总额|已确认应付|累计已付 \/ 剩余|合同金额 \/ 参考值|已回款|剩余应收|基本工资|奖金|扣减|应实发|已付 \/ 待发|预算|已发生|未履约采购|可用额度|单位成本|目录参考预算 \/ 报价|已交付收入|累计收款 \/ 应收|已结转成本|单位账面成本|库存账面价值|价值变化|单价|总价|总成本|源表总成本|方案总成本|成本差额|计价金额|合计成本|材料成本|加工成本|装配成本)$/;
  function decorateTable(wrapper) {
    const table = wrapper.querySelector('table');
    if (!table) return;
    const headers = [...table.querySelectorAll('thead tr:first-child > th')];
    const rows = [...table.querySelectorAll('tbody > tr')];
    headers.forEach((header, index) => {
      if (!amountHeader.test(header.textContent.trim()) && !header.classList.contains('trade-number') && !header.classList.contains('bom-numeric')) return;
      header.classList.add('v3-amount');
      rows.forEach(row => {
        if (row.cells.length === headers.length && row.cells[index]) row.cells[index].classList.add('v3-amount');
      });
    });
    wrapper.classList.toggle('v3-long-table', rows.length > 12);
    wrapper.classList.toggle('v3-wide-table', headers.length > 5);
    wrapper.classList.toggle('v3-scrollable', wrapper.scrollWidth > wrapper.clientWidth + 2);
    if (!wrapper.dataset.v3Scroll) {
      wrapper.dataset.v3Scroll = 'ready';
      wrapper.tabIndex = 0;
      if (!wrapper.getAttribute('aria-label')) wrapper.setAttribute('aria-label', '数据表格，可横向滚动查看全部字段');
      const hint = document.createElement('div');
      hint.className = 'v3-table-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = '左右滑动，查看全部字段与操作';
      wrapper.insertAdjacentElement('afterend', hint);
    }
  }
  function decorate() {
    scheduled = false;
    const heading = page.querySelector('.suite-head h1');
    if (heading) page.dataset.view = routeNames[heading.textContent.trim()] || 'workspace';
    page.querySelectorAll('.suite-table-scroll').forEach(decorateTable);
    page.querySelectorAll('.suite-metric > strong').forEach(value => {
      value.classList.toggle('v3-text-value', !/[¥￥\d]/.test(value.textContent));
    });
    const tabs = page.querySelector('.trade-tabs .active');
    page.querySelectorAll('.trade-flow > button').forEach(button => {
      button.classList.toggle('v3-current-step', !!tabs && button.dataset.value === tabs.dataset.value);
    });
    if (dialog && dialog.open && !page.hidden) dialog.querySelectorAll('.suite-table-scroll,.statement-table-wrap').forEach(decorateTable);
  }
  function queue() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }
  // Observe structural replacements only. Added hint nodes settle on the next frame;
  // class/data/ARIA decoration is deliberately outside the observer's filter.
  const observer = new MutationObserver(queue);
  observer.observe(page, {childList:true,subtree:true});
  if (dialog) observer.observe(dialog, {childList:true,subtree:true});
  document.addEventListener('aurora:route', queue);
  window.addEventListener('resize', queue, {passive:true});
  document.fonts?.ready.then(queue);
  queue();
})();
