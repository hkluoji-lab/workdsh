import JSZip from "jszip";
import type { OfficeSnapshot } from "workdsh-contracts/office";
const xml = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
/** Export one immutable committed native snapshot; portable browser/Host OOXML generator. */
export async function documentDocx(snapshot: OfficeSnapshot): Promise<Blob> {
  const zip = new JSZip();
  const numbers: { abstract: string; num: string }[] = [];
  const listStack: { type: string; start: number; numId: number }[] = [];
  const body = snapshot.state.blockIds
    .map((id) => {
      const block = snapshot.state.blocks[id];
      if (!block) throw new Error("文档结构不完整，无法下载。");
      const paragraph: string[] = [];
      if (block.type === "heading")
        paragraph.push(`<w:pStyle w:val="Heading${block.level}"/>`);
      const style = block.style;
      if (style?.alignment)
        paragraph.push(
          `<w:jc w:val="${style.alignment === "justify" ? "both" : style.alignment}"/>`,
        );
      if (style?.lineHeight)
        paragraph.push(
          `<w:spacing w:line="${Math.round(style.lineHeight * 240)}" w:lineRule="auto"/>`,
        );
      const list = block.list;
      if (!list) listStack.length = 0;
      else {
        listStack.length = Math.min(listStack.length, list.depth + 1);
        const previous = listStack[list.depth],
          start = list.start ?? 1;
        if (
          !previous ||
          previous.type !== list.type ||
          previous.start !== start
        ) {
          listStack.length = list.depth;
          const numId = numbers.length + 1;
          const levels = Array.from(
            { length: 6 },
            (_, level) =>
              `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${list.type === "bullet" ? "bullet" : "decimal"}"/><w:lvlText w:val="${list.type === "bullet" ? ["•", "◦", "▪"][level % 3] : `%${level + 1}.`}"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${720 * (level + 1)}"/></w:tabs><w:ind w:left="${720 * (level + 1)}" w:hanging="360"/></w:pPr></w:lvl>`,
          ).join("");
          numbers.push({
            abstract: `<w:abstractNum w:abstractNumId="${numId}"><w:multiLevelType w:val="multilevel"/>${levels}</w:abstractNum>`,
            num: `<w:num w:numId="${numId}"><w:abstractNumId w:val="${numId}"/><w:lvlOverride w:ilvl="${list.depth}"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`,
          });
          listStack.push({ type: list.type, start, numId });
        }
        if (!list.continuation)
          paragraph.push(
            `<w:numPr><w:ilvl w:val="${list.depth}"/><w:numId w:val="${listStack[list.depth].numId}"/></w:numPr>`,
          );
      }
      const left =
        (list ? 720 * (list.depth + 1) : 0) + (style?.indent ?? 0) * 360;
      if (left)
        paragraph.push(
          `<w:ind w:left="${left}"${list && !list.continuation ? ' w:hanging="360"' : ""}/>`,
        );
      const runs = block.runs
        .map((run) => {
          const marks = run.marks
            .map(
              (mark) =>
                ({
                  bold: "<w:b/>",
                  italic: "<w:i/>",
                  underline: '<w:u w:val="single"/>',
                  strike: "<w:strike/>",
                })[mark],
            )
            .join("");
          const style = run.style;
          const props =
            marks +
            (style?.fontFamily
              ? `<w:rFonts w:ascii="${xml(style.fontFamily)}" w:hAnsi="${xml(style.fontFamily)}" w:eastAsia="${xml(style.fontFamily)}"/>`
              : "") +
            (style?.fontSize
              ? `<w:sz w:val="${Math.round(style.fontSize * 2)}"/><w:szCs w:val="${Math.round(style.fontSize * 2)}"/>`
              : "") +
            (style?.color ? `<w:color w:val="${style.color.slice(1)}"/>` : "") +
            (style?.backgroundColor
              ? `<w:shd w:val="clear" w:fill="${style.backgroundColor.slice(1)}"/>`
              : "");
          const text = run.text
            .split(/\r\n|\r|\n/)
            .map((t) => `<w:t xml:space="preserve">${xml(t)}</w:t>`)
            .join("<w:br/>");
          return `<w:r><w:rPr>${props}</w:rPr>${text}</w:r>`;
        })
        .join("");
      return `<w:p>${paragraph.length ? `<w:pPr>${paragraph.join("")}</w:pPr>` : ""}${runs}</w:p>`;
    })
    .join("");
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${numbers.length ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : ""}</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${numbers.length ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' : ""}</Relationships>`,
  );
  if (numbers.length)
    zip.file(
      "word/numbering.xml",
      `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${numbers.map((n) => n.abstract).join("")}${numbers.map((n) => n.num).join("")}</w:numbering>`,
    );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`,
  );
  zip.file(
    "word/styles.xml",
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="等线"/><w:sz w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${[1, 2, 3, 4, 5, 6].map((level) => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="160"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[40, 32, 28, 26, 24, 24][level - 1]}"/></w:rPr></w:style>`).join("")}</w:styles>`,
  );
  // Fixed metadata makes a frozen semantic revision produce the same bytes on retries.
  zip.forEach((_path, entry) => {entry.date = new Date(1980, 0, 1, 0, 0, 0);});
  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}
export async function downloadDocument(snapshot: OfficeSnapshot) {
  const blob = await documentDocx(snapshot),
    url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${
    snapshot.title
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 120) || "文档"
  }.docx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
