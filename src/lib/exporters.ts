// Excel (.xlsx) and PDF output for every list and report.
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { fmtDate, fmtNum, humanize, todayISO } from './format';
import type { Company } from './auth';

export type ColType = 'text' | 'date' | 'money' | 'number' | 'qty' | 'int' | 'pct' | 'status' | 'bool';
export interface ExportColumn { key: string; label: string; type?: ColType; get?: (r: Record<string, any>) => unknown }
export interface Sheet { name: string; title?: string; subtitle?: string; columns: ExportColumn[]; rows: Record<string, any>[]; totals?: string[] }

const decimals = (t?: ColType) => (t === 'qty' ? 3 : t === 'int' ? 0 : t === 'pct' ? 1 : 2);
const valueOf = (c: ExportColumn, r: Record<string, any>) => (c.get ? c.get(r) : r[c.key]);

export function cellText(c: ExportColumn, r: Record<string, any>): string {
  const v = valueOf(c, r);
  if (v === null || v === undefined) return '';
  switch (c.type) {
    case 'date': return fmtDate(v);
    case 'money': case 'number': case 'qty': case 'int': case 'pct': return fmtNum(v, decimals(c.type));
    case 'status': return humanize(String(v));
    case 'bool': return v ? 'Yes' : 'No';
    default: return String(v);
  }
}

function totalsRow(sheet: Sheet): Record<string, number> | null {
  if (!sheet.totals?.length) return null;
  const out: Record<string, number> = {};
  for (const k of sheet.totals) {
    const col = sheet.columns.find((c) => c.key === k);
    out[k] = sheet.rows.reduce((s, r) => s + (Number(col ? valueOf(col, r) : r[k]) || 0), 0);
  }
  return out;
}

function safeName(s: string) { return s.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80); }

export function exportXlsx(filename: string, sheets: Sheet[]) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sh of sheets) {
    const aoa: unknown[][] = [];
    if (sh.title) aoa.push([sh.title]);
    if (sh.subtitle) aoa.push([sh.subtitle]);
    if (sh.title || sh.subtitle) aoa.push([]);
    const headerRow = aoa.length;
    aoa.push(sh.columns.map((c) => c.label));
    for (const r of sh.rows) {
      aoa.push(sh.columns.map((c) => {
        const v = valueOf(c, r);
        if (v === null || v === undefined || v === '') return null;
        if (c.type === 'date') { const s = String(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00Z') : v; }
        if (c.type && ['money', 'number', 'qty', 'int', 'pct'].includes(c.type)) return Number(v);
        if (c.type === 'status') return humanize(String(v));
        if (c.type === 'bool') return v ? 'Yes' : 'No';
        return v;
      }));
    }
    const tot = totalsRow(sh);
    if (tot) aoa.push(sh.columns.map((c, i) => (i === 0 ? 'TOTAL' : c.key in tot ? tot[c.key] : null)));
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    // number & date formats
    sh.columns.forEach((c, ci) => {
      const fmt = c.type === 'date' ? 'dd-mmm-yyyy' : c.type === 'qty' ? '#,##0.000' : c.type === 'int' ? '#,##0'
        : c.type === 'pct' ? '0.0' : c.type && ['money', 'number'].includes(c.type) ? '#,##0.00' : null;
      if (!fmt) return;
      for (let ri = headerRow + 1; ri < aoa.length; ri++) {
        const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
        if (cell && (cell.t === 'n' || cell.t === 'd')) cell.z = fmt;
      }
    });
    ws['!cols'] = sh.columns.map((c) => ({ wch: Math.min(45, Math.max(c.label.length + 2, c.type === 'date' ? 12 : 14)) }));
    let name = safeName(sh.name).slice(0, 31) || 'Sheet';
    while (used.has(name)) name = name.slice(0, 28) + '_' + used.size;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, `${safeName(filename)}.xlsx`);
}

export function letterhead(doc: jsPDF, company: Company | null, title: string, subtitle?: string): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 58, 95);
  doc.text(company?.name ?? 'IBRAHIM KNIT GARMENTS (PVT.) LTD.', w / 2, 14, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80);
  if (company?.tagline) doc.text(company.tagline, w / 2, 18.5, { align: 'center' });
  if (company?.address) doc.text(`${company.address}${company.phone ? '  |  ' + company.phone : ''}${company.email ? '  |  ' + company.email : ''}`, w / 2, 22.5, { align: 'center' });
  doc.setDrawColor(43, 181, 164); doc.setLineWidth(0.6); doc.line(10, 25, w - 10, 25);
  doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(title, w / 2, 31, { align: 'center' });
  let y = 31;
  if (subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); y += 5; doc.text(subtitle, w / 2, y, { align: 'center' }); }
  return y + 4;
}

export function pageFooter(doc: jsPDF) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(120);
    doc.text(`Printed ${fmtDate(new Date().toISOString())} (Asia/Dhaka)`, 10, h - 6);
    doc.text(`Page ${i} of ${n}`, w - 10, h - 6, { align: 'right' });
  }
}

export function tableBody(sh: Sheet): RowInput[] {
  const body: RowInput[] = sh.rows.map((r) => sh.columns.map((c) => cellText(c, r)));
  const tot = totalsRow(sh);
  if (tot) body.push(sh.columns.map((c, i) => (i === 0 ? 'TOTAL' : c.key in tot ? fmtNum(tot[c.key], decimals(c.type)) : '')) as RowInput);
  return body;
}

export function addTable(doc: jsPDF, sh: Sheet, startY: number, opts: { fontSize?: number } = {}): number {
  const numeric = (t?: ColType) => !!t && ['money', 'number', 'qty', 'int', 'pct'].includes(t);
  autoTable(doc, {
    startY,
    head: [sh.columns.map((c) => c.label)],
    body: tableBody(sh),
    styles: { fontSize: opts.fontSize ?? 7, cellPadding: 1.2, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    columnStyles: Object.fromEntries(sh.columns.map((c, i) => [i, { halign: numeric(c.type) ? 'right' : 'left' }])),
    margin: { left: 10, right: 10, bottom: 12 },
    didParseCell: (d) => {
      if (sh.totals?.length && d.section === 'body' && d.row.index === sh.rows.length) d.cell.styles.fontStyle = 'bold';
    },
  });
  return (doc as any).lastAutoTable.finalY as number;
}

export function exportPdf(filename: string, sheets: Sheet[], company: Company | null,
                          opts: { orientation?: 'portrait' | 'landscape' } = {}) {
  const doc = new jsPDF({ orientation: opts.orientation ?? 'landscape', unit: 'mm', format: 'a4' });
  sheets.forEach((sh, i) => {
    if (i > 0) doc.addPage();
    const y = letterhead(doc, company, sh.title ?? sh.name, sh.subtitle ?? `As on ${fmtDate(todayISO())}`);
    addTable(doc, sh, y);
  });
  pageFooter(doc);
  doc.save(`${safeName(filename)}.pdf`);
}
