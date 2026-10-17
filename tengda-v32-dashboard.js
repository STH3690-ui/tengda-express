
/* 腾达快递站 V3.2 财务总览 */
(function () {
  async function loadFinance() {
    const box = document.getElementById("td-v32-finance");
    if (!box || typeof db === "undefined") return;

    const result = await db
      .from("td_pickup_balances_v32")
      .select("*")
      .limit(1000);

    if (!box.isConnected) return;

    if (result.error) {
      box.innerHTML =
        '<p class="muted">财务读取失败：' +
        escapeText(result.error.message) + "</p>";
      return;
    }

    const rows = result.data || [];
    const sum = key => rows.reduce(
      (n, x) => n + Number(x[key] || 0), 0
    );
    const moneyText = n =>
      Number(n).toLocaleString("en-US", {
        maximumFractionDigits: 2
      }) + " MMK";

    const card = (label, value) =>
      '<div class="metric">' + label +
      "<b>" + value + "</b></div>";

    box.innerHTML =
      "<h2>快递取件财务统计</h2>" +
      '<div class="metrics">' +
      card("运费应收", moneyText(sum("receivable_mmk"))) +
      card("累计已收", moneyText(sum("paid_mmk"))) +
      card("剩余欠款", moneyText(sum("due_mmk"))) +
      card("快递净利润", "待录入成本") +
      "</div>" +
      '<p class="muted">仅统计最多1000笔。' +
      "代买、代付不计入快递净利润。</p>";
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }

  function install() {
    if (typeof dashboard !== "function" ||
        typeof render !== "function") return;

    const oldDashboard = dashboard;
    dashboard = function () {
      return oldDashboard() +
        '<div id="td-v32-finance">财务数据加载中…</div>';
    };

    const oldRender = render;
    render = function () {
      oldRender();
      if (page === "dashboard") loadFinance();
    };

    if (page === "dashboard") render();
  }

  install();
})();
