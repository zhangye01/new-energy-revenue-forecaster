"use strict";

(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_RESULT_BRIEF_WORD = api;
  if (root.window && root.window !== root) root.window.NE_RESULT_BRIEF_WORD = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  const MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const DOC_RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PACKAGE_RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
  const PAGE_WIDTH = 12240;
  const PAGE_HEIGHT = 15840;
  const SIDE_MARGIN = 1080;
  const CONTENT_WIDTH = PAGE_WIDTH - 2 * SIDE_MARGIN;
  const FIGURE_WIDTH_EMU = CONTENT_WIDTH * 635;
  const REL = Object.freeze({ styles: "rId1", footer: "rId2" });
  const PNG_PREFIX = "data:image/png;base64,";
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

  function xml(value) {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
    return Array.from(String(value ?? ""), (character) => {
      const code = character.codePointAt(0);
      const valid = code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) || code >= 0x10000;
      return valid ? entities[character] || character : "";
    }).join("");
  }

  function textRun(text, bold = false) {
    const parts = String(text ?? "").split(/\r\n?|\n/);
    return `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}${parts.map((part) => `<w:t xml:space="preserve">${xml(part)}</w:t>`).join("<w:br/>")}</w:r>`;
  }

  function paragraph(text, style = "Normal", options = {}) {
    const { align, bold = false } = options;
    return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${align ? `<w:jc w:val="${align}"/>` : ""}</w:pPr>${textRun(text, bold)}</w:p>`;
  }

  function columnWidths(weights) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const widths = weights.map((weight) => Math.floor(weight * CONTENT_WIDTH / total));
    widths[widths.length - 1] += CONTENT_WIDTH - widths.reduce((sum, width) => sum + width, 0);
    return widths;
  }

  function table(rows, weights, options = {}) {
    const { header = false, labels = [] } = options;
    const widths = columnWidths(weights);
    const borders = ["top", "left", "bottom", "right", "insideH", "insideV"].map((edge) =>
      `<w:${edge} w:val="single" w:sz="4" w:color="D9D9D9"/>`).join("");
    const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
    const body = rows.map((row, rowIndex) => {
      const isHeader = header && rowIndex === 0;
      const cells = widths.map((width, index) => {
        const isLabel = labels.includes(index);
        const fill = isHeader ? "E3EDF7" : isLabel ? "F2F5F8" : "";
        const style = isHeader ? "TableHeader" : "TableText";
        const align = header && index > 0 ? (isHeader ? "center" : "right") : "left";
        return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:fill="${fill}"/>` : ""}<w:vAlign w:val="center"/></w:tcPr>${paragraph(row[index], style, { align, bold: isLabel })}</w:tc>`;
      }).join("");
      return `<w:tr><w:trPr><w:cantSplit/>${isHeader ? "<w:tblHeader/>" : ""}</w:trPr>${cells}</w:tr>`;
    }).join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_WIDTH}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
  }

  function informationTable(items, singleColumn = false) {
    if (!items.length) return "";
    if (singleColumn) return table(items.map(({ label, value }) => [label, value]), [24, 76], { labels: [0] });
    const rows = [];
    for (let offset = 0; offset < items.length; offset += 2) {
      rows.push(items.slice(offset, offset + 2).flatMap(({ label, value }) => [label, value]));
    }
    return table(rows, [19, 31, 19, 31], { labels: [0, 2] });
  }

  function encodeImage(figure, source, index) {
    const dataUrl = source?.dataUrl;
    const fail = () => new Error(`无法导出 Word，图表「${figure.title}」未生成有效图片。`);
    if (typeof dataUrl !== "string" || !dataUrl.startsWith(PNG_PREFIX)) throw fail();
    let bytes;
    try {
      bytes = Uint8Array.from(root.atob(dataUrl.slice(PNG_PREFIX.length)), (character) => character.charCodeAt(0));
    } catch {
      throw fail();
    }
    if (bytes.length < 24 || !PNG_SIGNATURE.every((value, i) => bytes[i] === value)) throw fail();
    const header = new DataView(bytes.buffer);
    const width = header.getUint32(16);
    const height = header.getUint32(20);
    if (!width || !height) throw fail();
    const pictureWidth = Math.min(FIGURE_WIDTH_EMU, Math.round(2.9 * 914400 * width / height));
    return { ...figure, bytes, pictureWidth, pictureHeight: Math.round(pictureWidth * height / width),
      id: index + 1, relId: `rId${index + 3}`, path: `media/figure-${index + 1}.png` };
  }

  function picture(image) {
    const { title, caption, id, relId, pictureWidth: cx, pictureHeight: cy } = image;
    const size = `cx="${cx}" cy="${cy}"`;
    const imageRun = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent ${size}/><wp:docPr id="${id}" name="图 ${id}" descr="${xml(title)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="图 ${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext ${size}/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    return `${paragraph(title, "Heading2")}<w:p><w:pPr><w:pStyle w:val="Figure"/>${caption ? "<w:keepNext/>" : ""}<w:jc w:val="center"/></w:pPr>${imageRun}</w:p>${caption ? paragraph(caption, "Caption") : ""}`;
  }

  function tableWeights(reportTable) {
    const { key, headers } = reportTable;
    if (key === "annual") return headers.map((header, index) => index === 0 ? 13 : Math.max(20, header.length + 11));
    if (key === "storage") return headers.map((header, index) => index === 0 ? 32 : Math.max(20, header.length + 12));
    return headers.map(() => 1);
  }

  function documentXml(brief, images) {
    const tables = brief.tables.map((reportTable) => paragraph(reportTable.title, "Heading1") +
      table([reportTable.headers, ...reportTable.rows], tableWeights(reportTable), { header: true })).join("");
    const body = [
      paragraph(brief.title, "Title"), paragraph(brief.projectName, "Subtitle"),
      paragraph("项目概况", "Heading1"), informationTable(brief.context),
      paragraph("核心结论", "Heading1"), paragraph(brief.summary), informationTable(brief.metrics),
      ...images.map(picture), tables,
      paragraph("测算口径与版本", "Heading1"), informationTable(brief.assumptions, true),
      paragraph("结果来源", "Heading2"), informationTable(brief.trace, true)
    ].join("");
    return `${XML_HEADER}<w:document xmlns:w="${WORD_NS}" xmlns:r="${DOC_RELS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="${REL.footer}"/><w:pgSz w:w="${PAGE_WIDTH}" w:h="${PAGE_HEIGHT}"/><w:pgMar w:top="960" w:right="${SIDE_MARGIN}" w:bottom="960" w:left="${SIDE_MARGIN}" w:header="440" w:footer="480" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }

  function stylesXml() {
    const font = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial Unicode MS" w:cs="Arial"/>';
    const styles = [
      ["Normal", "Normal", 22, 0, 132], ["Title", "Title", 52, 0, 120, true, true],
      ["Subtitle", "Subtitle", 29, 0, 156, false, true], ["Heading1", "heading 1", 32, 220, 100, true, true, 0],
      ["Heading2", "heading 2", 26, 186, 90, true, true, 1], ["Caption", "Caption", 18, 36, 110],
      ["Figure", "Figure", 20, 0, 0], ["TableText", "Table text", 19, 0, 0],
      ["TableHeader", "Table header", 19, 0, 0, true], ["ReportFooter", "Report footer", 17, 0, 0]
    ];
    const body = styles.map(([id, name, size, before, after, bold, keep, outline]) => {
      const normal = id === "Normal";
      const color = id === "Caption" || id === "ReportFooter" ? "555F6D" : "000000";
      const spacing = `<w:spacing w:before="${before}" w:after="${after}" w:line="${id.startsWith("Table") ? 252 : 300}" w:lineRule="auto"/>`;
      return `<w:style w:type="paragraph"${normal ? ' w:default="1"' : ""} w:styleId="${id}"><w:name w:val="${name}"/>${normal ? "" : '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>'}<w:qFormat/><w:pPr>${keep ? "<w:keepNext/>" : ""}<w:keepLines/>${spacing}${outline === undefined ? "" : `<w:outlineLvl w:val="${outline}"/>`}</w:pPr><w:rPr>${font}${bold ? "<w:b/>" : ""}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
    }).join("");
    return `${XML_HEADER}<w:styles xmlns:w="${WORD_NS}"><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault></w:docDefaults>${body}</w:styles>`;
  }

  function relationships(entries) {
    const body = entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join("");
    return `${XML_HEADER}<Relationships xmlns="${PACKAGE_RELS}">${body}</Relationships>`;
  }

  function contentTypes() {
    const overrides = [
      ["/word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"],
      ["/word/styles.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"],
      ["/word/footer1.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"],
      ["/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"]
    ].map(([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`).join("");
    return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${overrides}</Types>`;
  }

  function coreProperties(brief, timestamp) {
    return `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(brief.title)}</dc:title><dc:subject>${xml(brief.projectName)}</dc:subject><dc:description>${xml(brief.versionId)}</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created></cp:coreProperties>`;
  }

  function footerXml(version) {
    return `${XML_HEADER}<w:ftr xmlns:w="${WORD_NS}"><w:p><w:pPr><w:pStyle w:val="ReportFooter"/><w:jc w:val="right"/></w:pPr>${textRun(`测算版本 ${version || "未编号"}  |  `)}<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
  }

  function buildDocx(brief, figures, { xlsx = root.XLSX, nowIso = () => new Date().toISOString() } = {}) {
    if (!brief) throw new Error("请先完成基准测算，再导出 Word。");
    const zip = xlsx?.CFB;
    if (!zip?.utils?.cfb_new || !zip.utils.cfb_add || !zip.write) throw new Error("Word 导出组件暂不可用，请刷新页面后重试。");
    const imageSources = new Map((figures || []).map((figure) => [figure.key, figure]));
    const images = brief.figures.map((figure, index) => encodeImage(figure, imageSources.get(figure.key), index));
    const timestamp = new Date(nowIso()).toISOString();
    const files = [
      ["[Content_Types].xml", contentTypes()],
      ["_rels/.rels", relationships([["rId1", `${DOC_RELS}/officeDocument`, "word/document.xml"],
        ["rId2", `${PACKAGE_RELS}/metadata/core-properties`, "docProps/core.xml"]])],
      ["docProps/core.xml", coreProperties(brief, timestamp)],
      ["word/document.xml", documentXml(brief, images)],
      ["word/styles.xml", stylesXml()],
      ["word/footer1.xml", footerXml(brief.versionId)],
      ["word/_rels/document.xml.rels", relationships([[REL.styles, `${DOC_RELS}/styles`, "styles.xml"],
        [REL.footer, `${DOC_RELS}/footer`, "footer1.xml"],
        ...images.map(({ relId, path }) => [relId, `${DOC_RELS}/image`, path])])],
      ...images.map((image) => [`word/${image.path}`, image.bytes])
    ];
    const encoder = new root.TextEncoder();
    const archive = zip.utils.cfb_new();
    for (const [path, content] of files) zip.utils.cfb_add(archive, path, typeof content === "string" ? encoder.encode(content) : content);
    const result = zip.write(archive, { fileType: "zip", type: "array", compression: true });
    return result instanceof Uint8Array ? result : new Uint8Array(result);
  }

  function filename(brief) {
    const safe = (value) => String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/u, "").trim();
    const project = Array.from(safe(brief?.projectName) || "项目").slice(0, 80).join("");
    const version = safe(brief?.versionId) || "未编号";
    return `${project}-基准结果简报-${version}.docx`;
  }

  return Object.freeze({ MIME_TYPE, buildDocx, filename });
});
