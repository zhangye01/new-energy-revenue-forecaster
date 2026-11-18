"use strict";

(function (root, factory) {
  const api = factory(typeof module !== "undefined" && module.exports ? require("../domain/result-versions") : root.NE_RESULT_VERSIONS);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_RESULT_PRINT = api;
  if (root.window && root.window !== root) {
    root.window.NE_RESULT_PRINT = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (versions) {
  function renderVersionTrace(node, project, result) {
    if (!node) return;
    node.hidden = !result;
    if (!result) { node.textContent = ""; return; }
    const run = project?.priceRuns?.find((item) => item.id === result.sourceContext?.runId);
    const trace = versions.describeResult(result, run);
    const time = Number.isFinite(Date.parse(trace.generatedAt))
      ? new Date(trace.generatedAt).toLocaleString("zh-CN", { hour12: false }) : "未记录";
    node.textContent = [`测算版本 ${trace.versionId || "旧版未编号"}`, `测算时间 ${time}`,
      trace.priceSourceLabel, trace.runId ? `价格版本 ${trace.runId}` : "价格版本未记录"].join(" · ");
  }

  function printScenarioReport(input = {}) {
    const {
      project,
      scenario,
      result,
      appState = {},
      refs = {},
      documentRef = null,
      windowRef = null,
      resultChartInstances = {},
      setTopMeta = () => {},
      updatePrintReportHeader = () => {},
      setActivePage = () => {},
      renderAll = () => {}
    } = input;
    if (!project) {
      setTopMeta("请先选择项目，再打印报告。");
      return false;
    }
    if (!result) {
      setTopMeta("请先在基准结果总览页发起测算，再打印报告。");
      return false;
    }
    if (!documentRef?.body) return false;

    updatePrintReportHeader(project, scenario, result);

    const previousPage = appState.activePage;
    if (previousPage !== "results-page") {
      setActivePage("results-page");
    }
    const paneStates = refs.resultReportPanes?.map((pane) => ({
      pane,
      hidden: pane.hidden,
      active: pane.classList.contains("active")
    })) || [];
    const disclosureStates = Array.from(documentRef.querySelectorAll("#results-page .result-disclosure")).map((node) => ({
      node,
      open: node.open
    }));
    refs.resultReportPanes?.forEach((pane) => {
      pane.hidden = false;
      pane.classList.add("active");
    });
    disclosureStates.forEach(({ node }) => {
      if (!node.classList.contains("result-hourly-detail") && !node.classList.contains("result-history")) {
        node.open = true;
      }
    });
    Object.values(resultChartInstances).forEach((chart) => {
      if (chart && !chart.isDisposed()) chart.resize();
    });
    documentRef.body.classList.add("print-report-mode");

    const cleanup = () => {
      documentRef.body.classList.remove("print-report-mode");
      paneStates.forEach(({ pane, hidden, active }) => {
        pane.hidden = hidden;
        pane.classList.toggle("active", active);
      });
      disclosureStates.forEach(({ node, open }) => {
        node.open = open;
      });
      if (previousPage !== "results-page") {
        setActivePage(previousPage);
      } else {
        renderAll();
      }
    };

    if (windowRef) {
      windowRef.addEventListener("afterprint", cleanup, { once: true });
      windowRef.print();
      windowRef.setTimeout(() => {
        if (documentRef.body.classList.contains("print-report-mode")) {
          cleanup();
        }
      }, 1800);
    }
    return true;
  }

  return Object.freeze({
    printScenarioReport, renderVersionTrace
  });
});
