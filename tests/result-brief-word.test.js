"use strict";

const assert = require("node:assert/strict");
const xlsx = require("../vendor/xlsx.full.min.js");
const { buildDocx, filename, MIME_TYPE } = require("../src/ui/result-brief-word");

const pngs = {
  price: "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFElEQVR4nGMUjZ/CAAZMEIqBgQEAEk0BDNY5qfgAAAAASUVORK5CYII=",
  income: "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFElEQVR4nGOUqMhmAAMmCMXAwAAAEY8A/y1ckygAAAAASUVORK5CYII="
};
const images = ["income", "price"].map((key) => ({ key, dataUrl: `data:image/png;base64,${pngs[key]}` }));
const brief = {
  title: "基准结果简报",
  projectName: "江苏/沿海 & 风电 <储能>",
  versionId: "result-fixture-123",
  context: [{ label: "测算方案", value: "A 基准/配储" }, { label: "测算周期", value: "2028–2047 年" }],
  summary: "全周期收入 34.29 亿元。",
  metrics: [{ label: "周期平均度电净价", value: "459.72 元/MWh" }],
  findings: [{ label: "配储增量", value: "独立配储收益和逐时套利构成配储增收。" }],
  figures: [
    { key: "price", number: 2, title: "年度度电净价趋势", caption: "度电净价计入各项收益和费用。" },
    { key: "income", number: 1, title: "全周期收入构成", caption: "各项按全周期金额汇总。" }
  ],
  tables: [
    { key: "annual", number: 2, title: "年度测算结果", headers: ["年份", "收入（万元）"], rows: [["2028", "16,575.31"], ["2047", "17,221.77"]] },
    { key: "storage", number: 1, title: "配储收益对比", note: "两种配置使用同一现货价。", headers: ["项目", "金额"], rows: [["配储全口径增量", "12,200.73"]] }
  ],
  sections: [
    { key: "income", title: "收入构成与配储", intro: ["配储单独列示。", "第二段解释主要贡献。"],
      blocks: [{ kind: "figure", key: "unavailable" }, { kind: "figure", key: "income" }, { kind: "table", key: "storage" }] },
    { key: "appendix-price", title: "分年经营表现", appendix: true, intro: [], blocks: [{ kind: "figure", key: "price" }] },
    { key: "annual", title: "逐年测算明细", appendix: true, intro: ["这里保留两年明细。"], blocks: [{ kind: "table", key: "annual" }] }
  ],
  assumptions: [{ label: "度电净价", value: "按结算电量折算。" }],
  trace: [{ label: "测算版本", value: "result-fixture-123" }, { label: "电价曲线版本", value: "run-fixture-1" }]
};
const options = { xlsx, nowIso: () => "2026-11-19T08:00:00.000Z" };

const original = JSON.stringify(brief);
const bytes = buildDocx(brief, images, options);
assert.ok(bytes instanceof Uint8Array);
assert.equal(JSON.stringify(brief), original);
assert.equal(MIME_TYPE, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
assert.equal(filename(brief), "江苏-沿海 & 风电 -储能--A 基准-配储-基准结果简报.docx");
const document = xlsx.CFB.read(bytes, { type: "array" });
const part = (path) => Buffer.from(xlsx.CFB.find(document, `/${path}`).content);
const documentXml = part("word/document.xml").toString("utf8");
assert.match(documentXml, /w:pStyle w:val="Title"/);
assert.match(documentXml, /<w:pgSz w:w="11906" w:h="16838"\/>/);
assert.match(documentXml, /江苏\/沿海 &amp; 风电 &lt;储能&gt;/);
assert.match(documentXml, /459\.72 元\/MWh/);
assert.match(documentXml, /12,200\.73/);
assert.match(documentXml, /17,221\.77/);
assert.match(documentXml, /独立配储收益和逐时套利构成配储增收/);
assert.match(documentXml, /收入构成与配储.*配储单独列示.*图 1　全周期收入构成.*表 1　配储收益对比.*两种配置使用同一现货价.*附录.*分年经营表现.*图 2　年度度电净价趋势.*逐年测算明细.*表 2　年度测算结果/);
const paragraphs = Array.from(documentXml.matchAll(/<w:p>(.*?)<\/w:p>/g), ([, body]) => body);
const textParagraph = (text) => paragraphs.find((body) => body.includes(`>${text}</w:t>`));
assert.match(textParagraph("配储单独列示。"), /<w:keepNext\/>/);
assert.match(textParagraph("第二段解释主要贡献。"), /<w:keepNext\/>/);
assert.match(textParagraph("这里保留两年明细。"), /<w:keepNext\/>/);
assert.equal((documentXml.match(/>附录<\/w:t>/g) || []).length, 1);
assert.match(textParagraph("附录"), /w:pStyle w:val="Heading1"/);
assert.match(textParagraph("分年经营表现"), /w:pStyle w:val="Heading2"/);
assert.match(textParagraph("图 2　年度度电净价趋势"), /w:pStyle w:val="ExhibitTitle"/);
assert.doesNotMatch(documentXml, /result-fixture-123|run-fixture-1|按结算电量折算|测算口径与版本/);
assert.equal((documentXml.match(/<w:tbl>/g) || []).length, 2);
assert.equal((documentXml.match(/<w:tblHeader\/>/g) || []).length, 2);
assert.deepEqual(part("word/media/figure-1.png"), Buffer.from(pngs.price, "base64"));
assert.deepEqual(part("word/media/figure-2.png"), Buffer.from(pngs.income, "base64"));
assert.match(part("word/_rels/document.xml.rels").toString("utf8"), /Id="rId4"[^>]+Target="media\/figure-2\.png"/);
assert.match(part("word/footer1.xml").toString("utf8"), /w:fldSimple w:instr=" PAGE "/);
assert.doesNotMatch(part("word/footer1.xml").toString("utf8"), /result-fixture-123|测算版本/);
assert.match(part("docProps/core.xml").toString("utf8"), /2026-11-19T08:00:00\.000Z/);
assert.doesNotMatch(part("docProps/core.xml").toString("utf8"), /result-fixture-123/);
assert.throws(() => buildDocx(brief, images.slice(1), options), /图表「全周期收入构成」未生成有效图片/);
assert.throws(() => buildDocx(brief, [{ key: "price", dataUrl: "data:image/png;base64,aGVsbG8=" }], options), /图表「年度度电净价趋势」未生成有效图片/);

const monthly = {
  key: "monthly", number: 9, title: "首年配储分月表现",
  headers: ["月份", "充电量（MWh）", "放电量（MWh）", "储能净收益（万元）", "有效循环次数"],
  rows: Array.from({ length: 12 }, (_, index) => [`${index + 1}月`, "1,480.25", "1,302.62", "-12.53", "23.7"])
};
const annual = {
  ...brief.tables[0], number: 10,
  rows: Array.from({ length: 20 }, (_, index) => [String(2028 + index), "17,221.77"])
};
const extendedDoc = xlsx.CFB.read(buildDocx({ ...brief, summary: undefined, figures: [], tables: [monthly, annual], sections: [] }, [], options), { type: "array" });
const extendedXml = Buffer.from(xlsx.CFB.find(extendedDoc, "/word/document.xml").content).toString("utf8");
assert.match(extendedXml, /表 9　首年配储分月表现.*表 10　年度测算结果/);
assert.match(extendedXml, /核心结论<\/w:t><\/w:r><\/w:p><w:p><w:pPr><w:pStyle w:val="Fact"\/>/);
assert.doesNotMatch(extendedXml, /<w:pageBreakBefore\/>/);
const [monthlyXml, annualXml] = Array.from(extendedXml.matchAll(/<w:tbl>(.*?)<\/w:tbl>/g), ([, table]) => table);
const widths = Array.from(monthlyXml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g), ([, width]) => Number(width));
assert.equal(widths.length, 5);
assert.equal(widths.reduce((sum, width) => sum + width, 0), 10080);
assert.ok(widths[3] > widths[0]);
const monthlyRows = Array.from(monthlyXml.matchAll(/<w:tr>(.*?)<\/w:tr>/g), ([, row]) => row);
assert.equal(monthlyRows.length, 13);
assert.match(monthlyRows[0], /<w:tblHeader\/>/);
assert.ok(monthlyRows.every((row) => row.includes("<w:cantSplit/>")));
assert.deepEqual(monthlyRows.flatMap((row, index) => row.includes("<w:keepNext/>") ? [index] : []), [0, 1, 2, 10, 11]);
assert.match(monthlyRows[12], /12月.*1,480\.25.*1,302\.62.*-12\.53.*23\.7/);
const annualRows = Array.from(annualXml.matchAll(/<w:tr>(.*?)<\/w:tr>/g), ([, row]) => row);
assert.equal(annualRows.length, 21);
assert.ok(annualRows.slice(0, -1).every((row) => row.includes("<w:keepNext/>")));
assert.doesNotMatch(annualRows.at(-1), /<w:keepNext\/>/);
console.log("result brief Word tests passed");
