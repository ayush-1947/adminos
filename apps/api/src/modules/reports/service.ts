import { excelWorkbook } from './excel';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { db, repository } from '../../lib/db';
import { requirePermission, type Principal } from '../auth/policy';
import { listWhere, getResource } from '../resources/service';
export function safeCell(value: unknown) {
  const s =
    value == null
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
  return /^[=+\-@\t\r\n]/.test(s) ? `'${s}` : s;
}
export async function exportReport(
  key: string,
  format: string,
  p: Principal,
  query: unknown,
  res: Response,
) {
  requirePermission(p, 'reports:read');
  requirePermission(p, `${key}:read`);
  const r = getResource(key);
  const { where, orderBy } = listWhere(key, p, query);
  const count = await repository(r.model).count({ where });
  if (count > 10000) {
    res.status(422).json({ error: 'Narrow this report to 10,000 records or fewer' });
    return;
  }
  const rows = await repository(r.model).findMany({ where, orderBy, take: 10000 });
  const columns = r.columns;
  res.attachment(`${key}-${new Date().toISOString().slice(0, 10)}.${format}`);
  if (format === 'csv') {
    res.type('text/csv');
    res.send(
      '\ufeff' +
        [columns, ...rows.map((row) => columns.map((k) => safeCell(row[k])))]
          .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
          .join('\r\n'),
    );
    return;
  }
  if (format === 'xlsx') {
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(
      excelWorkbook(r.label, [columns, ...rows.map((row) => columns.map((k) => safeCell(row[k])))]),
    );
    return;
  }
  res.type('application/pdf');
  const pdf = new PDFDocument({ margin: 36, size: 'A4' });
  pdf.pipe(res);
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: p.organizationId },
    select: { name: true },
  });
  pdf.fontSize(19).text(`${organization.name} | ${r.label}`);
  pdf.fontSize(9).text(`Generated ${new Date().toISOString()} | ${rows.length} records`).moveDown();
  for (const row of rows) {
    if (pdf.y > 690) pdf.addPage();
    pdf
      .fontSize(9)
      .text(columns.map((k) => `${k}: ${safeCell(row[k])}`).join('  |  '), { width: 520 })
      .moveDown();
  }
  pdf.end();
}
