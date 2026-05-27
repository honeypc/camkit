// Binary EXIF, TIFF, and GPS metadata parser + stripping utilities
import { ExifData } from '@camkit/types';

export function parseExif(blob: Blob): Promise<ExifData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const view = new DataView(buffer);
        resolve(parseBinaryExif(view));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsArrayBuffer(blob.slice(0, 128 * 1024)); // Read first 128KB which contains EXIF
  });
}

function parseBinaryExif(view: DataView): ExifData {
  const data: ExifData = {};

  // Check JPEG SOI (0xFFD8)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
    return data; // Not a valid JPEG or too small
  }

  let offset = 2;
  const length = view.byteLength;

  while (offset < length - 2) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);

    if (marker === 0xffe1) {
      // APP1 Marker (EXIF)
      if (view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0x0000) {
        // "Exif\0\0" Header matched
        const tiffOffset = offset + 10;
        parseTiffHeader(view, tiffOffset, data);
        break;
      }
    }

    offset += 2 + size;
    // Skip if invalid markers
    if (marker < 0xff00) break;
  }

  return data;
}

function parseTiffHeader(view: DataView, tiffOffset: number, data: ExifData) {
  // TIFF Header: Endianness (0x4949 "II" = Little Endian, 0x4d4d "MM" = Big Endian)
  const isLittle = view.getUint16(tiffOffset) === 0x4949;
  const magic = view.getUint16(tiffOffset + 2, isLittle);
  if (magic !== 42 && magic !== 0x2a00) return; // TIFF Magic number 42

  const firstIFDOffset = view.getUint32(tiffOffset + 4, isLittle);
  let ifdOffset = tiffOffset + firstIFDOffset;

  // Process IFD0 (Image File Directory 0)
  parseIFD(view, tiffOffset, ifdOffset, isLittle, data);
}

function parseIFD(
  view: DataView,
  tiffOffset: number,
  ifdOffset: number,
  isLittle: boolean,
  data: ExifData
) {
  if (ifdOffset >= view.byteLength) return;

  const numEntries = view.getUint16(ifdOffset, isLittle);
  let entryOffset = ifdOffset + 2;

  let exifSubIFDOffset = 0;
  let gpsSubIFDOffset = 0;

  for (let i = 0; i < numEntries; i++) {
    const tag = view.getUint16(entryOffset, isLittle);
    const type = view.getUint16(entryOffset + 2, isLittle);
    const count = view.getUint32(entryOffset + 4, isLittle);
    const valOffset = view.getUint32(entryOffset + 8, isLittle);

    // Parse specific primary tags
    if (tag === 0x0112) {
      // Orientation tag
      data.orientation = getTagValue(view, tiffOffset, type, count, valOffset, isLittle);
    } else if (tag === 0x010f) {
      // Make
      data.make = getStringValue(view, tiffOffset, count, valOffset);
    } else if (tag === 0x0110) {
      // Model
      data.model = getStringValue(view, tiffOffset, count, valOffset);
    } else if (tag === 0x0132) {
      // DateTime
      data.dateTime = getStringValue(view, tiffOffset, count, valOffset);
    } else if (tag === 0x8769) {
      // Exif IFD Pointer
      exifSubIFDOffset = valOffset;
    } else if (tag === 0x8825) {
      // GPS IFD Pointer
      gpsSubIFDOffset = valOffset;
    }

    entryOffset += 12;
  }

  // Parse Exif Sub-IFD if present
  if (exifSubIFDOffset > 0) {
    parseExifSubIFD(view, tiffOffset, tiffOffset + exifSubIFDOffset, isLittle, data);
  }

  // Parse GPS IFD if present
  if (gpsSubIFDOffset > 0) {
    parseGPSIFD(view, tiffOffset, tiffOffset + gpsSubIFDOffset, isLittle, data);
  }
}

function parseExifSubIFD(
  view: DataView,
  tiffOffset: number,
  ifdOffset: number,
  isLittle: boolean,
  data: ExifData
) {
  if (ifdOffset >= view.byteLength) return;
  const numEntries = view.getUint16(ifdOffset, isLittle);
  let entryOffset = ifdOffset + 2;

  for (let i = 0; i < numEntries; i++) {
    const tag = view.getUint16(entryOffset, isLittle);
    const type = view.getUint16(entryOffset + 2, isLittle);
    const count = view.getUint32(entryOffset + 4, isLittle);
    const valOffset = view.getUint32(entryOffset + 8, isLittle);

    if (tag === 0x829d) {
      // FNumber (Aperture)
      data.fNumber = getRationalValue(view, tiffOffset, valOffset, isLittle);
    } else if (tag === 0x829a) {
      // ExposureTime (Shutter Speed)
      data.exposureTime = getRationalValue(view, tiffOffset, valOffset, isLittle);
    } else if (tag === 0x8827) {
      // ISO
      data.isoSpeedRatings = getTagValue(view, tiffOffset, type, count, valOffset, isLittle);
    } else if (tag === 0x920a) {
      // FocalLength
      data.focalLength = getRationalValue(view, tiffOffset, valOffset, isLittle);
    }

    entryOffset += 12;
  }
}

function parseGPSIFD(
  view: DataView,
  tiffOffset: number,
  ifdOffset: number,
  isLittle: boolean,
  data: ExifData
) {
  if (ifdOffset >= view.byteLength) return;
  const numEntries = view.getUint16(ifdOffset, isLittle);
  let entryOffset = ifdOffset + 2;

  let latRef = 'N';
  let lonRef = 'E';
  let latDegrees = 0;
  let lonDegrees = 0;
  let altRef = 0;
  let altVal = 0;

  for (let i = 0; i < numEntries; i++) {
    const tag = view.getUint16(entryOffset, isLittle);
    const valOffset = view.getUint32(entryOffset + 8, isLittle);

    if (tag === 1) {
      // Latitude Ref (N/S)
      latRef = getStringValue(view, tiffOffset, 2, entryOffset + 8).trim();
    } else if (tag === 2) {
      // Latitude (3 rationals: deg, min, sec)
      latDegrees = parseGPSCoordinates(view, tiffOffset, valOffset, isLittle);
    } else if (tag === 3) {
      // Longitude Ref (E/W)
      lonRef = getStringValue(view, tiffOffset, 2, entryOffset + 8).trim();
    } else if (tag === 4) {
      // Longitude (3 rationals: deg, min, sec)
      lonDegrees = parseGPSCoordinates(view, tiffOffset, valOffset, isLittle);
    } else if (tag === 5) {
      // Altitude Ref (0 = Above Sea, 1 = Below Sea)
      altRef = view.getUint8(entryOffset + 8);
    } else if (tag === 6) {
      // Altitude
      altVal = getRationalValue(view, tiffOffset, valOffset, isLittle) || 0;
    }

    entryOffset += 12;
  }

  if (latDegrees > 0 && lonDegrees > 0) {
    const latSign = latRef === 'S' ? -1 : 1;
    const lonSign = lonRef === 'W' ? -1 : 1;
    data.gps = {
      latitude: latDegrees * latSign,
      longitude: lonDegrees * lonSign,
      altitude: altVal * (altRef === 1 ? -1 : 1),
    };
  }
}

function parseGPSCoordinates(view: DataView, tiffOffset: number, valOffset: number, isLittle: boolean): number {
  const fileOffset = tiffOffset + valOffset;
  if (fileOffset + 24 > view.byteLength) return 0;

  const degNum = view.getUint32(fileOffset, isLittle);
  const degDen = view.getUint32(fileOffset + 4, isLittle);
  const minNum = view.getUint32(fileOffset + 8, isLittle);
  const minDen = view.getUint32(fileOffset + 12, isLittle);
  const secNum = view.getUint32(fileOffset + 16, isLittle);
  const secDen = view.getUint32(fileOffset + 20, isLittle);

  const deg = degDen === 0 ? 0 : degNum / degDen;
  const min = minDen === 0 ? 0 : minNum / minDen;
  const sec = secDen === 0 ? 0 : secNum / secDen;

  return deg + min / 60 + sec / 3600;
}

function getTagValue(
  view: DataView,
  tiffOffset: number,
  type: number,
  count: number,
  valOffset: number,
  isLittle: boolean
): any {
  if (type === 3) {
    // Short (16-bit)
    return view.getUint16(tiffOffset + valOffset, isLittle);
  } else if (type === 4) {
    // Long (32-bit)
    return view.getUint32(tiffOffset + valOffset, isLittle);
  }
  return valOffset;
}

function getStringValue(view: DataView, tiffOffset: number, count: number, valOffset: number): string {
  const fileOffset = tiffOffset + valOffset;
  if (fileOffset + count > view.byteLength) return '';
  let str = '';
  for (let i = 0; i < count - 1; i++) {
    const char = view.getUint8(fileOffset + i);
    if (char === 0) break; // Null terminator
    str += String.fromCharCode(char);
  }
  return str;
}

function getRationalValue(view: DataView, tiffOffset: number, valOffset: number, isLittle: boolean): number | undefined {
  const fileOffset = tiffOffset + valOffset;
  if (fileOffset + 8 > view.byteLength) return undefined;
  const num = view.getUint32(fileOffset, isLittle);
  const den = view.getUint32(fileOffset + 4, isLittle);
  return den === 0 ? undefined : num / den;
}

/**
 * Strips all metadata (EXIF/APP1 blocks) from a JPEG Blob.
 * This is crucial for privacy and minimizing upload size.
 */
export async function stripMetadata(blob: Blob): Promise<Blob> {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);

  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
    return blob; // Not a valid JPEG, return original
  }

  const parts: ArrayBuffer[] = [];
  parts.push(buffer.slice(0, 2)); // Add SOI marker (0xFFD8)

  let offset = 2;
  const length = view.byteLength;

  while (offset < length - 2) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);

    if (marker === 0xffe1) {
      // APP1 Marker (EXIF). Skip it completely!
    } else {
      // Keep any other APP segments (like color profiles APP2) and image scans
      if (marker === 0xffda) {
        // Start of Scan (image data begins). Add everything else till end.
        parts.push(buffer.slice(offset));
        break;
      } else {
        parts.push(buffer.slice(offset, offset + 2 + size));
      }
    }

    offset += 2 + size;
    if (marker < 0xff00) break;
  }

  return new Blob(parts, { type: blob.type });
}

/**
 * Returns rotation angle (degrees) and flip (horizontal) options based on EXIF tag value.
 * Standardizes layout orientation mapping.
 */
export function getOrientationCorrection(orientation: number): {
  rotation: number;
  flipH: boolean;
} {
  switch (orientation) {
    case 2: return { rotation: 0, flipH: true };
    case 3: return { rotation: 180, flipH: false };
    case 4: return { rotation: 180, flipH: true };
    case 5: return { rotation: 90, flipH: true };
    case 6: return { rotation: 90, flipH: false };
    case 7: return { rotation: 270, flipH: true };
    case 8: return { rotation: 270, flipH: false };
    default: return { rotation: 0, flipH: false };
  }
}
