const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { PDFDocument, PDFName, PDFString, rgb } = require('pdf-lib');

async function createFixtures(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const source = path.join(__dirname, '../src/assets/icons/win/pexels-gn0me-32296411.jpg');
  const image = await sharp(source).resize(1600, 2100, { fit: 'inside' }).png().toBuffer();
  const document = await PDFDocument.create();
  const embedded = await document.embedPng(image);
  const page = document.addPage([595, 842]);
  page.drawText('Searchable PDF compression test', { x: 35, y: 800, size: 20 });
  page.drawImage(embedded, { x: 35, y: 180, width: 330, height: 440 });
  page.drawRectangle({ x: 400, y: 500, width: 90, height: 90, color: rgb(0, 0.5, 1) });
  const link = document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [35, 750, 300, 780], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com') } });
  page.node.addAnnot(document.context.register(link));
  const alpha = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 100, alpha: 0.4 } } }).png().toBuffer();
  const transparent = await document.embedPng(alpha);
  page.drawImage(transparent, { x: 420, y: 520, width: 50, height: 50 });
  const form = document.getForm();
  const field = form.createTextField('test.name');
  field.setText('LocalSqueeze');
  field.addToPage(page, { x: 35, y: 100, width: 200, height: 25 });
  const second = document.addPage([420, 595]);
  second.drawText('Second page - text remains selectable', { x: 25, y: 550, size: 15 });
  second.drawImage(embedded, { x: 35, y: 30, width: 280, height: 380 });
  const input = path.join(directory, 'photo-and-text.pdf');
  fs.writeFileSync(input, await document.save({ useObjectStreams: false }));
  const signed = await PDFDocument.create();
  signed.addPage().drawText('Signature field test');
  const signature = signed.context.obj({ FT: 'Sig', T: PDFString.of('signature') });
  signed.catalog.set(PDFName.of('AcroForm'), signed.context.obj({ Fields: [signed.context.register(signature)] }));
  const signedPath = path.join(directory, 'signature.pdf');
  fs.writeFileSync(signedPath, await signed.save());
  return { input, signedPath };
}
module.exports = { createFixtures };
