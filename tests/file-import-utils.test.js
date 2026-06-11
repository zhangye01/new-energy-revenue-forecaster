"use strict";

const assert = require("node:assert/strict");
const {
  readSpreadsheetToCsv,
  readTextFile
} = require("../src/ui/file-import-utils");

class FakeFileReader {
  readAsText(file, encoding) {
    assert.equal(encoding, "utf-8");
    this.result = file.textValue;
    this.onload();
  }
}

(async () => {
  assert.equal(await readTextFile({ textValue: "year,value\n2026,8" }, {
    FileReader: FakeFileReader
  }), "year,value\n2026,8");

  assert.deepEqual(await readSpreadsheetToCsv({ name: "annual.csv" }, {
    readTextFile: async () => "a,b\n1,2"
  }), {
    text: "a,b\n1,2",
    source: "text"
  });

  assert.deepEqual(await readSpreadsheetToCsv({ name: "annual.TXT" }, {
    readTextFile: async () => "x,y"
  }), {
    text: "x,y",
    source: "text"
  });

  const xlsxCalls = [];
  const excelFile = {
    name: "annual.xlsx",
    arrayBuffer: async () => "buffer"
  };
  const xlsx = {
    read(buffer, options) {
      xlsxCalls.push({ buffer, options });
      return {
        SheetNames: ["Sheet1"],
        Sheets: { Sheet1: { A1: { v: "demo" } } }
      };
    },
    utils: {
      sheet_to_csv(sheet, options) {
        xlsxCalls.push({ sheet, options });
        return "year,value\n2026,8";
      }
    }
  };
  assert.deepEqual(await readSpreadsheetToCsv(excelFile, { xlsx }), {
    text: "year,value\n2026,8",
    source: "excel:Sheet1"
  });
  assert.deepEqual(xlsxCalls[0], { buffer: "buffer", options: { type: "array" } });
  assert.deepEqual(xlsxCalls[1].options, { FS: ",", RS: "\n", blankrows: false });

  await assert.rejects(
    () => readSpreadsheetToCsv({ name: "annual.xlsx", arrayBuffer: async () => "buffer" }, {}),
    /当前环境未加载XLSX解析器/
  );

  await assert.rejects(
    () => readSpreadsheetToCsv({
      name: "empty.xlsx",
      arrayBuffer: async () => "buffer"
    }, {
      xlsx: {
        read: () => ({ SheetNames: [], Sheets: {} }),
        utils: { sheet_to_csv: () => "" }
      }
    }),
    /Excel文件不包含可读取工作表/
  );

  await assert.rejects(
    () => readSpreadsheetToCsv({ name: "annual.json" }, {}),
    /当前仅支持CSV\/TXT\/XLSX\/XLS文件/
  );

  console.log("file import utils tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
