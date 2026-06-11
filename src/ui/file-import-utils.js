"use strict";

(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_FILE_IMPORT_UTILS = api;
  if (root.window && root.window !== root) {
    root.window.NE_FILE_IMPORT_UTILS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  function readTextFile(file, deps = {}) {
    const FileReaderImpl = deps.FileReader || root.FileReader;
    if (!FileReaderImpl) {
      return Promise.reject(new Error("当前环境不支持文件读取。"));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReaderImpl();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsText(file, "utf-8");
    });
  }

  async function readSpreadsheetToCsv(file, deps = {}) {
    const filename = String(file?.name || "").toLowerCase();
    if (filename.endsWith(".csv") || filename.endsWith(".txt")) {
      const readText = deps.readTextFile || ((targetFile) => readTextFile(targetFile, deps));
      const text = await readText(file);
      return { text, source: "text" };
    }
    if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      const xlsx = deps.xlsx || root.XLSX;
      if (!xlsx) {
        throw new Error("当前环境未加载XLSX解析器。请检查网络后重试，或先导出CSV。");
      }
      const workbook = xlsx.read(await file.arrayBuffer(), { type: "array" });
      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        throw new Error("Excel文件不包含可读取工作表。");
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const csv = xlsx.utils.sheet_to_csv(worksheet, { FS: ",", RS: "\n", blankrows: false });
      return { text: csv, source: `excel:${firstSheetName}` };
    }
    throw new Error("当前仅支持CSV/TXT/XLSX/XLS文件。");
  }

  return Object.freeze({
    readSpreadsheetToCsv,
    readTextFile
  });
});
