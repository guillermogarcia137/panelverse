import { deflateSync } from "node:zlib";
export function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const u32 = (value) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value);
  return b;
};
export function png(red = 55, green = 105, blue = 170) {
  const chunk = (type, data) => {
    const tag = Buffer.from(type);
    return Buffer.concat([
      u32(data.length),
      tag,
      data,
      u32(crc32(Buffer.concat([tag, data]))),
    ]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(400);
  header.writeUInt32BE(600, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = [];
  for (let y = 0; y < 600; y++) {
    const row = Buffer.alloc(1201);
    for (let x = 0; x < 400; x++) {
      row[1 + x * 3] = red;
      row[2 + x * 3] = green;
      row[3 + x * 3] = blue;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
export const pageFiles = () => [
  ["page10.png", png(70, 160, 100)],
  ["page2.png", png(160, 80, 80)],
  ["page1.png", png()],
  ["ComicInfo.xml", Buffer.from("<ComicInfo/>")],
  ["__MACOSX/._page.png", png()],
];
// Minimal RAR4 "store" fixture. Includes real PNGs and valid CRCs; no external archive tool required.
export function makeRar(files = pageFiles()) {
  function header(type, flags, body) {
    const h = Buffer.alloc(7);
    h[2] = type;
    h.writeUInt16LE(flags, 3);
    h.writeUInt16LE(7 + body.length, 5);
    const result = Buffer.concat([h, body]);
    result.writeUInt16LE(crc32(result.subarray(2)) & 0xffff, 0);
    return result;
  }
  const result = [
    Buffer.from("526172211a0700", "hex"),
    header(0x73, 0, Buffer.alloc(6)),
  ];
  for (const [name, data] of files) {
    const filename = Buffer.from(name),
      info = Buffer.alloc(25);
    info.writeUInt32LE(data.length);
    info.writeUInt32LE(data.length, 4);
    info[8] = 3;
    info.writeUInt32LE(crc32(data), 9);
    info[17] = 20;
    info[18] = 0x30;
    info.writeUInt16LE(filename.length, 19);
    info.writeUInt32LE(0x20, 21);
    result.push(header(0x74, 0x8000, Buffer.concat([info, filename])), data);
  }
  result.push(header(0x7b, 0, Buffer.alloc(0)));
  return Buffer.concat(result);
}
