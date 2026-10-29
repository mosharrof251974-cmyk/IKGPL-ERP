// Printable documents generated from stored data: commercial invoice, packing list,
// incentive claim (template), customs bond statement (template).
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Company } from './auth';
import type { Row } from './data';
import { addTable, exportXlsx, letterhead, pageFooter, type ColType, type ExportColumn, type Sheet } from './exporters';
import { fmtDate, fmtNum, toNum } from './format';

// ------------------------------------------------------------ amount in words
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? '-' + ONES[r % 10] : ''}`;
  return [h ? `${ONES[h]} Hundred` : '', rest].filter(Boolean).join(' ');
}
export function amountInWords(amount: number, currency = 'USD'): string {
  const names: Record<string, [string, string]> = { USD: ['US Dollars', 'Cents'], EUR: ['Euro', 'Cents'], GBP: ['Pounds Sterling', 'Pence'], BDT: ['Taka', 'Paisa'] };
  const [major, minor] = names[currency] ?? [currency, 'Cents'];
  let n = Math.floor(amount);
  const cents = Math.round((amount - n) * 100);
  const parts: string[] = [];
  for (const [div, label] of [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand'], [1, '']] as [number, string][]) {
    const q = Math.floor(n / div);
    if (q) { parts.push(`${below1000(q)}${label ? ' ' + label : ''}`); n -= q * div; }
  }
  return `${major} ${parts.join(' ') || 'Zero'}${cents ? ` and ${below1000(cents)} ${minor}` : ''} Only`;
}

// ------------------------------------------------------------ helpers
function box(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, text: string) {
  doc.setDrawColor(180); doc.setLineWidth(0.2); doc.rect(x, y, w, h);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(90);
  doc.text(label.toUpperCase(), x + 1.5, y + 3.2);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(20);
  doc.text(doc.splitTextToSize(text || '', w - 3), x + 1.5, y + 7);
}

export interface InvoiceDocData { invoice: Row; items: Row[]; contract: Row; buyer: Row }

const rexText = (c: Company | null) =>
  `The exporter ${c?.name ?? 'IBRAHIM KNIT GARMENTS (PVT.) LTD.'} (${c?.rex_no || 'BDREX00757'}) of the products covered by this document declares that, ` +
  'except where otherwise clearly indicated, these products are of Bangladesh preferential origin according to rules of origin of the ' +
  'Generalized System of Preferences of the European Union.';

function invoiceHeader(doc: jsPDF, d: InvoiceDocData, company: Company | null, title: string): number {
  const { invoice: i, contract: c, buyer: b } = d;
  const w = doc.internal.pageSize.getWidth();
  let y = letterhead(doc, company, title);
  const half = (w - 20) / 2;
  box(doc, 10, y, half, 22, 'Shipper / Exporter', `${company?.name ?? ''}\n${company?.address ?? ''}`);
  box(doc, 10 + half, y, half, 22, 'Invoice No. & Date',
    `${i.invoice_no}   Date: ${fmtDate(i.invoice_date)}\nEXP: ${i.exp_no ?? '-'}  ${fmtDate(i.exp_date)}\n${c.contract_type === 'LC' ? 'Export LC' : 'Sales Contract'}: ${c.contract_no}  Date: ${fmtDate(c.issue_date)}`);
  y += 22;
  box(doc, 10, y, half, 22, 'Consignee', c.consignee_text ?? '');
  box(doc, 10 + half, y, half, 22, 'Notify Party / Buyer', c.notify_text ?? `${b.name}\n${b.address ?? ''}`);
  y += 22;
  const q = (w - 20) / 4;
  box(doc, 10, y, q, 13, 'Port of Loading', i.port_of_loading ?? '');
  box(doc, 10 + q, y, q, 13, 'Port of Discharge', i.port_of_discharge ?? '');
  box(doc, 10 + 2 * q, y, q, 13, 'Final Destination', i.final_destination ?? '');
  box(doc, 10 + 3 * q, y, q, 13, 'Vessel / Mode', `${i.vessel_voyage ?? ''} (${(i.mode ?? '').toUpperCase()})`);
  y += 13;
  box(doc, 10, y, q, 13, 'Incoterm', c.incoterm ?? '');
  box(doc, 10 + q, y, q * 2, 13, 'Payment Terms', c.payment_terms ?? '');
  box(doc, 10 + 3 * q, y, q, 13, 'Buyer Order / PO', i.buyer_order_no ?? '');
  return y + 15;
}

export function commercialInvoicePdf(d: InvoiceDocData, company: Company | null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = invoiceHeader(doc, d, company, 'COMMERCIAL INVOICE');
  const ccy = d.invoice.currency;
  const total = d.items.reduce((s, r) => s + toNum(r.amount), 0);
  const qty = d.items.reduce((s, r) => s + toNum(r.quantity_pcs), 0);
  autoTable(doc, {
    startY: y,
    head: [['Marks & Nos.', 'Description of Goods', 'HS Code', 'Quantity (Pcs)', `Unit Price (${ccy})`, `Amount (${ccy})`]],
    body: [
      ...d.items.map((r, k) => [k === 0 ? (d.invoice.shipping_marks ?? '') : '',
        `${r.description}${r.style_no ? `\nStyle: ${r.style_no}` : ''}${r.color ? `  Colour: ${r.color}` : ''}`,
        r.hs_code ?? '', fmtNum(r.quantity_pcs, 0), fmtNum(r.unit_price, 4), fmtNum(r.amount)]),
      [{ content: 'TOTAL', colSpan: 3, styles: { fontStyle: 'bold' } }, { content: fmtNum(qty, 0), styles: { fontStyle: 'bold' } }, '',
       { content: fmtNum(total), styles: { fontStyle: 'bold' } }],
    ],
    styles: { fontSize: 7.5, cellPadding: 1.3 },
    headStyles: { fillColor: [30, 58, 95] },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 0: { cellWidth: 32 } },
    margin: { left: 10, right: 10 },
  });
  y = (doc as any).lastAutoTable.finalY + 5;
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text(`In words: ${amountInWords(total, ccy)}`, 10, y, { maxWidth: 190 }); y += 6;
  doc.setFont('helvetica', 'normal');
  const nw = d.items.reduce((s, r) => s + toNum(r.net_weight_kg), 0);
  const gw = d.items.reduce((s, r) => s + toNum(r.gross_weight_kg), 0);
  const ctn = d.items.reduce((s, r) => s + toNum(r.cartons), 0);
  const cbm = d.items.reduce((s, r) => s + toNum(r.cbm), 0);
  doc.text(`Total cartons: ${fmtNum(ctn, 0)}    Net weight: ${fmtNum(nw, 3)} kg    Gross weight: ${fmtNum(gw, 3)} kg    Measurement: ${fmtNum(cbm, 3)} CBM`, 10, y); y += 5;
  doc.text(`Container: ${d.invoice.container_no ?? '-'}    BL: ${d.invoice.bl_no ?? '-'} ${d.invoice.bl_date ? 'dated ' + fmtDate(d.invoice.bl_date) : ''}`, 10, y); y += 6;
  if ((d.buyer.market ?? '') === 'EU' || /italy|spain|ireland|germany|france|netherlands/i.test(d.contract.destination_country ?? '')) {
    doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize(`REX declaration: ${rexText(company)}`, 190), 10, y); y += 12;
  }
  doc.setFontSize(8);
  doc.text(`For ${company?.name ?? ''}`, 140, y + 8);
  doc.line(140, y + 22, 200, y + 22);
  doc.text(`${company?.signatory ?? ''}, ${company?.signatory_title ?? ''}`, 140, y + 26);
  pageFooter(doc);
  doc.save(`Commercial Invoice ${d.invoice.invoice_no.replace(/[\\/]/g, '-')}.pdf`);
}

export function packingListPdf(d: InvoiceDocData, company: Company | null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const y = invoiceHeader(doc, d, company, 'PACKING LIST');
  const sh: Sheet = { name: 'Packing List', columns: PL_COLUMNS, rows: d.items, totals: ['cartons', 'quantity_pcs', 'net_weight_kg', 'gross_weight_kg', 'cbm'] };
  const end = addTable(doc, sh, y, { fontSize: 7.5 });
  doc.setFontSize(8);
  doc.text(`Shipping marks: ${d.invoice.shipping_marks ?? '-'}`, 10, end + 6, { maxWidth: 190 });
  doc.text(`For ${company?.name ?? ''}`, 140, end + 18);
  doc.line(140, end + 32, 200, end + 32);
  pageFooter(doc);
  doc.save(`Packing List ${d.invoice.invoice_no.replace(/[\\/]/g, '-')}.pdf`);
}

const PL_COLUMNS: ExportColumn[] = [
  { key: 'carton_range', label: 'Carton No.', get: (r) => (r.carton_from ? `${r.carton_from} - ${r.carton_to ?? ''}` : '') },
  { key: 'style_no', label: 'Style' }, { key: 'description', label: 'Description' }, { key: 'color', label: 'Colour' },
  { key: 'cartons', label: 'Cartons', type: 'int' }, { key: 'quantity_pcs', label: 'Qty (Pcs)', type: 'int' },
  { key: 'net_weight_kg', label: 'N.W. (kg)', type: 'qty' }, { key: 'gross_weight_kg', label: 'G.W. (kg)', type: 'qty' }, { key: 'cbm', label: 'CBM', type: 'qty' },
];
const CI_COLUMNS: ExportColumn[] = [
  { key: 'style_no', label: 'Style' }, { key: 'description', label: 'Description of Goods' }, { key: 'color', label: 'Colour' },
  { key: 'hs_code', label: 'HS Code' }, { key: 'quantity_pcs', label: 'Qty (Pcs)', type: 'int' },
  { key: 'unit_price', label: 'Unit Price', type: 'number' }, { key: 'amount', label: 'Amount', type: 'money' },
];

export function invoiceDocsXlsx(d: InvoiceDocData, company: Company | null) {
  const head = `${company?.name ?? ''} | Invoice ${d.invoice.invoice_no} dated ${fmtDate(d.invoice.invoice_date)} | ${d.contract.contract_type} ${d.contract.contract_no} | EXP ${d.invoice.exp_no ?? '-'}`;
  exportXlsx(`Invoice & Packing List ${d.invoice.invoice_no}`, [
    { name: 'Commercial Invoice', title: 'COMMERCIAL INVOICE', subtitle: head, columns: CI_COLUMNS, rows: d.items, totals: ['quantity_pcs', 'amount'] },
    { name: 'Packing List', title: 'PACKING LIST', subtitle: head, columns: PL_COLUMNS, rows: d.items, totals: ['cartons', 'quantity_pcs', 'net_weight_kg', 'gross_weight_kg', 'cbm'] },
  ]);
}

// ------------------------------------------------------------ template engine
export function resolve(data: Row, path: string): string {
  const v = path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), data);
  return v == null ? '' : String(v);
}
const fill = (s: string, data: Row) => s.replace(/\{([\w.]+)\}/g, (_, p) => resolve(data, p));

export interface ClaimTemplate {
  title_lines: string[]; addressee: string[]; rows: { label: string; key: string }[];
  declaration: string; enclosures_title: string; signatures: string[];
}

export function incentiveClaimPdf(tpl: ClaimTemplate, data: Row, enclosures: string[], company: Company | null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  let y = 14;
  doc.setFont('helvetica', 'bold');
  tpl.title_lines.forEach((l, i) => { doc.setFontSize(i === 0 ? 12 : 10); doc.text(l, w / 2, y, { align: 'center' }); y += 6; });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); y += 2;
  tpl.addressee.forEach((l) => { doc.text(fill(l, data), 12, y); y += 4.5; });
  y += 2;
  doc.text(`Date: ${fmtDate(data.today)}`, w - 12, y - 6, { align: 'right' });
  autoTable(doc, {
    startY: y, body: tpl.rows.map((r) => [r.label, resolve(data, r.key)]),
    styles: { fontSize: 8.5, cellPadding: 1.6 }, columnStyles: { 0: { cellWidth: 75, fontStyle: 'bold' } },
    theme: 'grid', margin: { left: 12, right: 12 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;
  doc.text(doc.splitTextToSize(tpl.declaration, w - 24), 12, y); y += 14;
  doc.setFont('helvetica', 'bold'); doc.text(tpl.enclosures_title, 12, y); doc.setFont('helvetica', 'normal'); y += 5;
  enclosures.forEach((e, i) => { doc.text(`${i + 1}. ${e}`, 16, y); y += 4.5; });
  y += 14;
  tpl.signatures.forEach((s, i) => {
    const x = 12 + i * ((w - 24) / tpl.signatures.length);
    doc.line(x, y, x + 60, y); doc.text(s, x, y + 4);
    if (i === 0 && company) doc.text(`${company.signatory}, ${company.signatory_title}`, x, y + 8);
  });
  pageFooter(doc);
  doc.save(`Incentive Claim ${data.claim?.claim_no ?? data.claim?.bill_ref_no ?? ''}.pdf`);
}

export function incentiveClaimXlsx(tpl: ClaimTemplate, data: Row, enclosures: string[]) {
  const aoa: unknown[][] = [...tpl.title_lines.map((l) => [l]), [], ...tpl.addressee.map((l) => [fill(l, data)]), [`Date: ${fmtDate(data.today)}`], [],
    ...tpl.rows.map((r) => [r.label, resolve(data, r.key)]), [], [tpl.declaration], [], [tpl.enclosures_title], ...enclosures.map((e, i) => [`${i + 1}. ${e}`]),
    [], [], tpl.signatures];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 55 }, { wch: 70 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Claim');
  XLSX.writeFile(wb, `Incentive Claim ${data.claim?.claim_no ?? ''}.xlsx`);
}

export interface BondTemplate {
  title_lines: string[]; header_fields: { label: string; key: string }[];
  summary_title: string; summary_columns: TplCol[]; import_title: string; import_columns: TplCol[];
  export_title: string; export_columns: TplCol[]; footer_lines: string[]; signatures: string[];
}
interface TplCol { key: string; label: string; number?: number; date?: boolean }

const tplToCols = (cols: TplCol[]): ExportColumn[] => cols.map((c) => ({
  key: c.key, label: c.label,
  type: (c.date ? 'date' : c.number === undefined ? 'text' : c.number === 0 ? 'int' : c.number === 3 ? 'qty' : 'number') as ColType,
}));
const withSl = (rows: Row[]) => rows.map((r, i) => ({ sl: i + 1, ...r }));

export function bondStatementSheets(tpl: BondTemplate, header: Row, summary: Row[], imports: Row[], exports: Row[]): Sheet[] {
  const sub = tpl.header_fields.map((f) => `${f.label}: ${resolve(header, f.key)}`).join('   |   ');
  return [
    { name: 'Balance', title: [...tpl.title_lines, tpl.summary_title].join(' — '), subtitle: sub,
      columns: tplToCols(tpl.summary_columns), rows: withSl(summary.map((r) => ({ ...r, total: toNum(r.opening) + toNum(r.imports) }))) },
    { name: 'Import Entries', title: tpl.import_title, subtitle: sub, columns: tplToCols(tpl.import_columns), rows: withSl(imports) },
    { name: 'Export Entries', title: tpl.export_title, subtitle: sub, columns: tplToCols(tpl.export_columns), rows: withSl(exports) },
  ];
}

export function bondStatementPdf(tpl: BondTemplate, header: Row, sheets: Sheet[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  let y = 12;
  doc.setFont('helvetica', 'bold');
  tpl.title_lines.forEach((l, i) => { doc.setFontSize(i === tpl.title_lines.length - 1 ? 11 : 9.5); doc.text(l, w / 2, y, { align: 'center' }); y += 5; });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); y += 1;
  tpl.header_fields.forEach((f) => { doc.text(`${f.label}: ${resolve(header, f.key)}`, 12, y); y += 4.5; });
  sheets.forEach((sh, i) => {
    if (i > 0) { doc.addPage(); y = 14; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text(i === 0 ? tpl.summary_title : sh.title ?? sh.name, 12, y + 3);
    doc.setFont('helvetica', 'normal');
    y = addTable(doc, { ...sh, title: undefined }, y + 6) + 6;
  });
  doc.setFontSize(8.5);
  tpl.footer_lines.forEach((l) => { doc.text(doc.splitTextToSize(l, w - 24), 12, y); y += 8; });
  y += 14;
  tpl.signatures.forEach((s, i) => { const x = 12 + i * ((w - 24) / tpl.signatures.length); doc.line(x, y, x + 55, y); doc.text(s, x, y + 4); });
  pageFooter(doc);
  doc.save(`Bond Statement ${header.period ?? ''}.pdf`);
}
