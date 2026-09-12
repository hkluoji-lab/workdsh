import JSZip from "jszip";
import type { OfficeBlockInput, OfficeMark, OfficeTextStyle } from "workdsh-contracts/office";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const children = (el: Element, name: string) => Array.from(el.children).filter(x => x.namespaceURI === W && x.localName === name);
const child = (el: Element | undefined, name: string) => el ? children(el, name)[0] : undefined;
const val = (el: Element | undefined, attr = "val") => el?.getAttributeNS(W, attr) ?? undefined;
const enabled = (el: Element | undefined) => !!el && !["0", "false", "off"].includes(val(el) ?? "");
async function xmlPart(zip: JSZip, name: string): Promise<Document | undefined> {
  const file = zip.file(name);
  if (!file) return;
  const text = await new Promise<string>((resolve, reject) => {
    let result = "";
    // JSZip's documented StreamHelper API is omitted from its JSZipObject typings.
    interface Stream {on(event: string, callback: (chunk: string) => void): Stream; pause(): Stream; resume(): Stream}
    const stream = (file as unknown as {internalStream(type: "string"): Stream}).internalStream("string");
    stream.on("data", chunk => {
      result += chunk;
      if (result.length > 1024 * 1024) {stream.pause(); reject(new Error("DOCX XML超过1 MiB导入限额。"));}
    }).on("error", reject).on("end", () => resolve(result)).resume();
  });
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("不支持含DTD或实体声明的DOCX。");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("DOCX XML损坏，无法导入。");
  return doc;
}
function runProps(rPr: Element | undefined) {
  const marks: OfficeMark[] = [];
  for (const [tag, mark] of [["b","bold"],["i","italic"],["u","underline"],["strike","strike"]] as const)
    if (enabled(child(rPr, tag)) && val(child(rPr, tag)) !== "none") marks.push(mark);
  const style: OfficeTextStyle = {};
  const fonts = child(rPr, "rFonts"), family = val(fonts, "eastAsia") ?? val(fonts, "ascii");
  if (family && /^[a-zA-Z0-9\u3400-\u9fff -]{1,80}$/.test(family)) style.fontFamily = family;
  const size = Number(val(child(rPr, "sz"))) / 2;
  if (size >= 6 && size <= 96) style.fontSize = size;
  const color = val(child(rPr, "color"));
  if (color && /^[a-fA-F0-9]{6}$/.test(color)) style.color = "#" + color;
  const background = val(child(rPr, "shd"), "fill");
  if (background && /^[a-fA-F0-9]{6}$/.test(background)) style.backgroundColor = "#" + background;
  return {marks, style};
}
/** Import a bounded semantic text copy. Never executes OOXML, fetches relationships, or overwrites source bytes. */
export async function importDocx(bytes: Uint8Array, address: string) {
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("DOCX超过10 MiB导入限额。");
  const zip = await JSZip.loadAsync(bytes), doc = await xmlPart(zip, "word/document.xml");
  if (!doc) throw new Error("文件不是有效DOCX：缺少正文。");
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error("DOCX缺少正文节点。");
  const styles = await xmlPart(zip, "word/styles.xml");
  const styleMap = new Map<string, Element>();
  for (const el of Array.from(styles?.getElementsByTagNameNS(W, "style") ?? [])) {
    const id = val(el, "styleId"); if (id) styleMap.set(id, el);
  }
  const defaults = styles?.getElementsByTagNameNS(W, "docDefaults")[0];
  const baseProps = runProps(child(child(defaults, "rPrDefault"), "rPr"));
  const paragraphs = Array.from(body.getElementsByTagNameNS(W, "p"));
  if (paragraphs.length > 2000) throw new Error("DOCX超过2000段导入限额。");
  const blocks: OfficeBlockInput[] = paragraphs.map(p => {
    const pPr = child(p, "pPr"), styleId = val(child(pPr, "pStyle"));
    const s = styleId ? styleMap.get(styleId) : undefined;
    const styleProps = runProps(child(s, "rPr"));
    const heading = /heading\s*([1-6])/i.exec(styleId ?? val(child(s, "name")) ?? "");
    const outline = Number(val(child(pPr, "outlineLvl")) ?? val(child(child(s, "pPr"), "outlineLvl")) ?? -1);
    const level = heading ? Number(heading[1]) : outline >= 0 && outline < 6 ? outline + 1 : undefined;
    const runs = Array.from(p.getElementsByTagNameNS(W, "r")).map(r => {
      const local = runProps(child(r, "rPr"));
      const marks = new Set([...baseProps.marks, ...styleProps.marks, ...local.marks]);
      for (const [tag, mark] of [["b","bold"],["i","italic"],["u","underline"],["strike","strike"]] as const)
        if (child(child(r, "rPr"), tag) && (!enabled(child(child(r, "rPr"), tag)) || val(child(child(r,"rPr"),tag)) === "none")) marks.delete(mark);
      const text = Array.from(r.children).map(x => x.namespaceURI !== W ? "" : x.localName === "t" ? x.textContent ?? "" : x.localName === "tab" ? "\t" : ["br", "cr"].includes(x.localName) ? "\n" : "").join("");
      return {text, marks: [...marks], style: {...baseProps.style, ...styleProps.style, ...local.style}};
    });
    const alignmentValue = val(child(pPr, "jc")) ?? val(child(child(s, "pPr"), "jc"));
    const alignment = alignmentValue === "both" ? "justify" : alignmentValue;
    const style: NonNullable<OfficeBlockInput["style"]> = {};
    if (["left", "center", "right", "justify"].includes(alignment ?? "")) style.alignment = alignment as typeof style.alignment;
    const spacing = child(pPr, "spacing"), line = Number(val(spacing, "line")) / 240;
    if ((!val(spacing, "lineRule") || val(spacing, "lineRule") === "auto") && line >= 1 && line <= 3) style.lineHeight = line;
    return {type: level ? "heading" : "paragraph", ...(level ? {level} : {}), runs, style};
  });
  if (!blocks.length) blocks.push({type:"paragraph", runs:[]});
  if (new TextEncoder().encode(JSON.stringify(blocks)).byteLength > 120000) throw new Error("导入正文超过120 KiB，请拆分文档。");
  const warnings: string[] = [];
  for (const [tag, label] of [["tbl","表格布局"],["drawing","图片/图表"],["pict","绘图"],["numPr","列表编号"],["fldChar","目录/域"],["fldSimple","目录/域"],["hyperlink","超链接"],["sectPr","页面设置"]])
    if (body.getElementsByTagNameNS(W, tag).length) warnings.push(label);
  if (Object.keys(zip.files).some(name => /^word\/(header|footer|footnotes|endnotes)/.test(name))) warnings.push("页眉页脚/注释");
  const data = new Uint8Array(bytes.byteLength + new TextEncoder().encode(address).byteLength);
  data.set(bytes); data.set(new TextEncoder().encode(address), bytes.byteLength);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data))).map(b => b.toString(16).padStart(2,"0")).join("");
  return {blocks, warnings: [...new Set(warnings)], operationId: "docx-" + digest};
}
