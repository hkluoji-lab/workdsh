# Office 原生预览夹具（六种格式）

`scripts/probe-office-native.mjs` 用它验证官方 `sidebar-right` 文档预览在让位后接管
六种格式，并保留切回 WorkDSH 编辑器的入口。夹具内容固定、不含真实业务数据。

| 文件 | 生成方式 | 关键内容 |
| --- | --- | --- |
| `input.docx` | `docx@9.6.1` 的 `Packer.toBuffer`，代码与 `scripts/probe-office.mjs` 一致 | 加粗段落 `Office Word test` |
| `input.pptx` | `pptx-react-viewer` SDK 导出（WorkDSH PPT 编辑器导出路径），1 张幻灯片 | 原生图表 `ppt/charts/chart1.xml`，无文本 run |
| `input.xlsx` | `exceljs@4.4.0`，工作表 `Sheet1` | A1 = `Office Excel test` |
| `input.xls` | Python `xlwt` 生成的一次性 BIFF8 工作簿（OLE2 头 `d0cf11e0a1b11ae1`，5632 字节） | 单表，A1 = `XLS_ACCEPT_017`，A2 = 42 |

重新生成 `input.docx` 与 `input.xlsx`：

```bash
node --input-type=module -e "
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const office=createRequire(new URL('./packages/plugins/office/package.json', import.meta.url));
const ExcelJS=office('exceljs');
const bundled=createRequire(new URL('./package.json', import.meta.url));
const {Document,Packer,Paragraph,TextRun}=bundled('docx');
const docx=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph({children:[new TextRun({text:'Office Word test',bold:true})]})]}]}));
await writeFile('tests/fixtures/office-native/input.docx',docx);
const wb=new ExcelJS.Workbook();wb.addWorksheet('Sheet1').getCell('A1').value='Office Excel test';
await writeFile('tests/fixtures/office-native/input.xlsx',await wb.xlsx.writeBuffer());
"
```

`input.pptx` 由浏览器内的 PPT 导出路径产生，仓库内暂无 Node 端可复现的 PPTX 生成器，
因此按二进制夹具保留；`input.xls` 为 BIFF8，Node 侧同样没有可用的写库，故一并保留二进制。
探针运行时不需要 Python 或 LibreOffice 之外的额外工具。
