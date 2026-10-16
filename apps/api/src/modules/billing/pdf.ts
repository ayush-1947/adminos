import PDFDocument from 'pdfkit';

export type PdfSection = { title: string; rows: [string, string][] };
export type PdfContent = {
  organization: string;
  title: string;
  number: string;
  logo?: Buffer;
  sections: PdfSection[];
  note: string;
};

export function renderPdf(content: PdfContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: 44,
      bufferPages: true,
      info: { Title: `${content.title} ${content.number}`, Author: content.organization },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      const width = 507;
      let y = 44;
      const nextPage = (height: number) => {
        if (y + height > 744) {
          pdf.addPage();
          pdf
            .font('Helvetica')
            .fontSize(8)
            .fillColor('#6b776f')
            .text(`${content.title} | ${content.number}`, 44, 30, { width });
          y = Math.max(60, pdf.y + 15);
        }
      };
      if (content.logo) pdf.image(content.logo, 493, 44, { fit: [58, 58], align: 'center' });
      pdf.font('Helvetica-Bold').fontSize(17).fillColor('#185a40');
      pdf.text(content.organization, 44, y, { width: 425 });
      y = Math.max(pdf.y + 16, content.logo ? 115 : 86);
      pdf.fontSize(23).text(content.title, 44, y, { width });
      y = pdf.y + 10;
      pdf
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#526158')
        .text(`Document no. ${content.number}`, 44, y, { width });
      y = pdf.y + 24;
      for (const section of content.sections) {
        const rows = section.rows.filter(([, value]) => value);
        if (!rows.length) continue;
        pdf.font('Helvetica').fontSize(10);
        const sectionHeight =
          47 +
          rows.reduce(
            (height, [label, value]) =>
              height +
              Math.max(
                pdf.heightOfString(value, { width: 345 }),
                pdf.heightOfString(label, { width: 137 }),
                14,
              ) +
              8,
            0,
          );
        nextPage(Math.min(sectionHeight, 620));
        pdf.rect(44, y, width, 25).fill('#edf4ee');
        pdf
          .fillColor('#185a40')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(section.title.toUpperCase(), 54, y + 8, { width: width - 20 });
        y += 35;
        for (const [label, value] of rows) {
          pdf.font('Helvetica').fontSize(10);
          const height = Math.max(
            pdf.heightOfString(value, { width: 345 }),
            pdf.heightOfString(label, { width: 137 }),
            14,
          );
          nextPage(height + 8);
          pdf.font('Helvetica').fontSize(10);
          pdf.fillColor('#6b776f').text(label, 44, y, { width: 137 });
          pdf.fillColor('#23352d').text(value, 196, y, { width: 355 });
          y += height + 8;
        }
        y += 12;
      }
      nextPage(100);
      pdf.font('Helvetica').fontSize(9).fillColor('#6b776f').text(content.note, 44, y, { width });
      y = pdf.y + 40;
      nextPage(60);
      pdf
        .moveTo(44, y)
        .lineTo(235, y)
        .moveTo(350, y)
        .lineTo(551, y)
        .strokeColor('#bac9be')
        .stroke();
      pdf.text('Authorized signatory', 44, y + 9, { width: 190 });
      pdf.text('Received / acknowledged by', 350, y + 9, { width: 201 });
      const pages = pdf.bufferedPageRange();
      for (let index = 0; index < pages.count; index++) {
        pdf.switchToPage(index);
        pdf
          .fontSize(8)
          .fillColor('#7b897f')
          .text(`Saved document | Page ${index + 1} of ${pages.count}`, 44, 780, {
            width,
            align: 'right',
            lineBreak: false,
          });
      }
      pdf.end();
    } catch (error) {
      reject(error);
      pdf.destroy();
    }
  });
}
