import { calendarEventModel, type CalendarEvent } from '../models/calendarEvent.model.js';
import { mileageDistanceModel } from '../models/mileageDistance.model.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getReportsRoot } from '../lib/appPaths.js';
import { isMastercontrolRootConfigured } from './fileSpace.service.js';

export const MILEAGE_HOME_ADDRESS = '250 Pine St, Lino Lakes, MN 55014';
const EXCLUDED_LOCATION_NEEDLES = [
  '1601 utica',
  '1601 s utica',
  '1601 utica ave',
  '601 utica',
  '601 utica ave',
  'link included',
  'gooseberry falls',
];
const VIRTUAL_LOCATION_NEEDLES = [
  'microsoft teams',
  'teams meeting',
  'online meeting',
  'virtual meeting',
  'zoom',
  'webex',
  'google meet',
  'https://',
];
const STREET_ADDRESS_RE = /\b\d{1,6}\s+[a-z0-9 .'-]+?\b(?:avenue|ave|street|st|road|rd|boulevard|blvd|drive|dr|lane|ln|way|parkway|pkwy|court|ct|circle|cir|terrace|ter|highway|hwy|trail|trl|place|pl)\b/i;
const ROUND_TRIP = 'round trip';

interface Coordinate {
  lat: number;
  lon: number;
}

interface NominatimPlace {
  lat: string;
  lon: string;
}

interface OsrmRoute {
  distance: number;
}

interface OsrmResponse {
  code: string;
  routes?: OsrmRoute[];
  message?: string;
}

const geocodeMemoryCache = new Map<string, Coordinate>();
let lastNominatimRequestAt = 0;

export interface MileageReportRow {
  uid: string;
  date: string;
  subject: string;
  from_address: string;
  to_address: string;
  type: typeof ROUND_TRIP;
  miles: number | null;
  one_way_miles: number | null;
  distance_source: 'cache' | 'osrm' | 'unavailable' | 'not_calculated';
  distance_error: string | null;
  maps_url: string;
  start_at: string;
}

export interface MileageReport {
  start_date: string;
  end_date: string;
  from_address: string;
  rows: MileageReportRow[];
  total_miles: number;
  excluded_count: number;
  calculated: boolean;
}

export interface MileageCalculation {
  from_address: string;
  to_address: string;
  type: typeof ROUND_TRIP;
  miles: number | null;
  one_way_miles: number | null;
  distance_source: 'cache' | 'osrm' | 'unavailable';
  distance_error: string | null;
  maps_url: string;
}

export interface MileageExportRow {
  uid: string;
  date: string;
  subject: string;
  from_address: string;
  to_address: string;
  type: typeof ROUND_TRIP;
  miles: number | null;
}

export interface MileageExportPdfInput {
  start_date: string;
  end_date: string;
  rows: MileageExportRow[];
  total_miles: number;
}

export interface MileageExportPdfResult {
  file_name: string;
  file_path: string;
  row_count: number;
  total_miles: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseNominatimPlaces(value: unknown): NominatimPlace[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is NominatimPlace => {
    if (!isRecord(item)) return false;
    return typeof item['lat'] === 'string' && typeof item['lon'] === 'string';
  });
}

function parseOsrmResponse(value: unknown): OsrmResponse {
  if (!isRecord(value)) return { code: 'InvalidResponse', message: 'OSRM returned an invalid response' };
  const code = typeof value['code'] === 'string' ? value['code'] : 'InvalidResponse';
  const message = typeof value['message'] === 'string' ? value['message'] : undefined;
  const routesRaw = value['routes'];
  const routes = Array.isArray(routesRaw)
    ? routesRaw.filter((route): route is OsrmRoute => isRecord(route) && typeof route['distance'] === 'number')
    : undefined;
  return { code, routes, message };
}

function localDateFromIso(iso: string): string {
  const date = new Date(iso);
  return (
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getDate()).padStart(2, '0')}`
  );
}

function normalizeLocation(location: string): string {
  return location.trim().replace(/\s+/g, ' ');
}

function hasStreetAddress(value: string): boolean {
  return STREET_ADDRESS_RE.test(value);
}

function stripVirtualLocationText(value: string): string {
  return normalizeLocation(value
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:microsoft teams meeting|teams meeting|online meeting|virtual meeting|zoom|webex|google meet)\b/gi, ''));
}

function cleanMileageAddressText(value: string): string {
  return normalizeLocation(value)
    .replace(/\s+(?:and|or)\s*$/i, '')
    .replace(/\s*[,;|/-]\s*$/g, '')
    .replace(/\s*,\s*(?:and|or)\s*$/i, '')
    .trim();
}

function extractMileageLocation(location: string): string {
  const normalized = normalizeLocation(location);
  if (!normalized) return '';

  const parts = normalized
    .split(/(?:\r?\n|;|\||\u2022)/)
    .map((part) => normalizeLocation(part))
    .filter(Boolean);
  const addressPart = parts.find((part) => hasStreetAddress(part));
  return cleanMileageAddressText(stripVirtualLocationText(addressPart ?? normalized));
}

function isMileageLocation(event: CalendarEvent): boolean {
  const location = extractMileageLocation(event.location ?? '');
  if (!location) return false;
  const lower = location.toLowerCase();
  if (EXCLUDED_LOCATION_NEEDLES.some((needle) => lower.includes(needle))) return false;
  if (VIRTUAL_LOCATION_NEEDLES.some((needle) => lower === needle || lower.includes(needle)) && !hasStreetAddress(location)) return false;
  return true;
}

function roundMiles(value: number): number {
  return Math.round(value * 10) / 10;
}

function googleMapsUrl(fromAddress: string, toAddress: string): string {
  const params = new URLSearchParams({
    api: '1',
    origin: fromAddress,
    destination: toAddress,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function pdfSafeText(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function pdfEscape(value: string): string {
  return pdfSafeText(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function clipText(value: string, maxChars: number): string {
  const text = pdfSafeText(value);
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 3))}...` : text;
}

function pdfText(x: number, y: number, text: string, font = 'F1', size = 9): string {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET\n`;
}

function buildMileagePdf(input: MileageExportPdfInput): Buffer {
  const pageWidth = 792;
  const pageHeight = 612;
  const rowsPerPage = 23;
  const pages: string[] = [];
  const rowPages = input.rows.length === 0
    ? [[]]
    : Array.from({ length: Math.ceil(input.rows.length / rowsPerPage) }, (_, index) =>
        input.rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage),
      );

  rowPages.forEach((pageRows, pageIndex) => {
    let stream = '';
    stream += pdfText(30, 568, 'Mileage Report', 'F2', 19);
    stream += pdfText(30, 548, `${input.start_date} to ${input.end_date}`, 'F1', 10);
    stream += pdfText(pageWidth - 170, 548, `Total miles: ${input.total_miles.toFixed(1)}`, 'F2', 11);
    stream += pdfText(30, 520, 'Date', 'F2', 8);
    stream += pdfText(100, 520, 'Subject', 'F2', 8);
    stream += pdfText(305, 520, 'From Address', 'F2', 8);
    stream += pdfText(475, 520, 'To Address', 'F2', 8);
    stream += pdfText(670, 520, 'Type', 'F2', 8);
    stream += pdfText(745, 520, 'Miles', 'F2', 8);

    pageRows.forEach((row, rowIndex) => {
      const y = 500 - rowIndex * 20;
      stream += pdfText(30, y, row.date, 'F1', 8);
      stream += pdfText(100, y, clipText(row.subject, 42), 'F1', 8);
      stream += pdfText(305, y, clipText(row.from_address, 34), 'F1', 8);
      stream += pdfText(475, y, clipText(row.to_address, 39), 'F1', 8);
      stream += pdfText(670, y, row.type, 'F1', 8);
      stream += pdfText(755, y, row.miles == null ? '' : row.miles.toFixed(1), 'F1', 8);
    });

    stream += pdfText(30, 34, `Page ${pageIndex + 1} of ${rowPages.length}`, 'F1', 8);
    pages.push(stream);
  });

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  const pageObjectIds: number[] = [];

  pages.forEach((stream) => {
    const pageId = objects.length + 1;
    const contentId = objects.length + 2;
    pageObjectIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}endstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

async function waitForNominatimSlot(): Promise<void> {
  const elapsed = Date.now() - lastNominatimRequestAt;
  const waitMs = 1100 - elapsed;
  if (waitMs > 0) {
    await new Promise((resolve) => {
      setTimeout(resolve, waitMs);
    });
  }
  lastNominatimRequestAt = Date.now();
}

async function geocodeAddress(address: string): Promise<Coordinate> {
  const cached = geocodeMemoryCache.get(address);
  if (cached) return cached;

  const params = new URLSearchParams({
    format: 'json',
    limit: '1',
    q: address,
  });
  await waitForNominatimSlot();
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      'User-Agent': 'MasterControl/1.0 mileage-tool',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Geocoding failed: ${response.status} ${response.statusText}`);
  const places = parseNominatimPlaces(await response.json());
  const place = places[0];
  if (!place) throw new Error(`No geocoding result for ${address}`);
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`Invalid geocoding result for ${address}`);
  const coordinate = { lat, lon };
  geocodeMemoryCache.set(address, coordinate);
  return coordinate;
}

async function calculateOneWayMiles(fromAddress: string, toAddress: string): Promise<number> {
  const from = await geocodeAddress(fromAddress);
  const to = await geocodeAddress(toAddress);
  const coordinates = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const params = new URLSearchParams({
    overview: 'false',
    alternatives: 'false',
    steps: 'false',
  });
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?${params.toString()}`, {
    headers: {
      'User-Agent': 'MasterControl/1.0 mileage-tool',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Routing failed: ${response.status} ${response.statusText}`);
  const routed = parseOsrmResponse(await response.json());
  if (routed.code !== 'Ok') throw new Error(routed.message ?? `Routing failed: ${routed.code}`);
  const route = routed.routes?.[0];
  if (!route || !Number.isFinite(route.distance)) throw new Error('Routing response did not include distance');
  return roundMiles(route.distance / 1609.344);
}

async function getDistance(fromAddress: string, toAddress: string, calculate: boolean) {
  const cached = mileageDistanceModel.get(fromAddress, toAddress);
  if (cached?.status === 'ok' && cached.one_way_miles != null) {
    return {
      oneWayMiles: cached.one_way_miles,
      source: 'cache' as const,
      error: null,
    };
  }

  if (!calculate) {
    return {
      oneWayMiles: null,
      source: cached?.status === 'error' ? ('unavailable' as const) : ('not_calculated' as const),
      error: cached?.error ?? null,
    };
  }

  try {
    const oneWayMiles = await calculateOneWayMiles(fromAddress, toAddress);
    mileageDistanceModel.upsert({
      from_address: fromAddress,
      to_address: toAddress,
      one_way_miles: oneWayMiles,
      provider: 'nominatim+osrm',
      status: 'ok',
      error: null,
    });
    return {
      oneWayMiles,
      source: 'osrm' as const,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    mileageDistanceModel.upsert({
      from_address: fromAddress,
      to_address: toAddress,
      one_way_miles: null,
      provider: 'nominatim+osrm',
      status: 'error',
      error: message,
    });
    return {
      oneWayMiles: null,
      source: 'unavailable' as const,
      error: message,
    };
  }
}

export async function buildMileageReport(
  startDate: string,
  endDate: string,
  calculate: boolean,
): Promise<MileageReport> {
  const events = calendarEventModel.listForRange(startDate, endDate);
  const eligible = events.filter(isMileageLocation);
  const rows: MileageReportRow[] = [];

  for (const event of eligible) {
    const toAddress = extractMileageLocation(event.location ?? '');
    const distance = await getDistance(MILEAGE_HOME_ADDRESS, toAddress, calculate);
    const miles = distance.oneWayMiles == null ? null : roundMiles(distance.oneWayMiles * 2);
    rows.push({
      uid: event.uid,
      date: localDateFromIso(event.start_at),
      subject: event.title,
      from_address: MILEAGE_HOME_ADDRESS,
      to_address: toAddress,
      type: ROUND_TRIP,
      miles,
      one_way_miles: distance.oneWayMiles,
      distance_source: distance.source,
      distance_error: distance.error,
      maps_url: googleMapsUrl(MILEAGE_HOME_ADDRESS, toAddress),
      start_at: event.start_at,
    });
  }

  const totalMiles = rows.reduce((sum, row) => sum + (row.miles ?? 0), 0);

  return {
    start_date: startDate,
    end_date: endDate,
    from_address: MILEAGE_HOME_ADDRESS,
    rows,
    total_miles: roundMiles(totalMiles),
    excluded_count: events.length - eligible.length,
    calculated: calculate,
  };
}

export async function calculateMileageRoute(
  fromAddress: string,
  toAddress: string,
): Promise<MileageCalculation> {
  const from = normalizeLocation(fromAddress);
  const to = normalizeLocation(toAddress);
  const distance = await getDistance(from, to, true);
  const miles = distance.oneWayMiles == null ? null : roundMiles(distance.oneWayMiles * 2);

  return {
    from_address: from,
    to_address: to,
    type: ROUND_TRIP,
    miles,
    one_way_miles: distance.oneWayMiles,
    distance_source: distance.source === 'not_calculated' ? 'unavailable' : distance.source,
    distance_error: distance.error,
    maps_url: googleMapsUrl(from, to),
  };
}

export function exportMileagePdf(input: MileageExportPdfInput): MileageExportPdfResult {
  if (!isMastercontrolRootConfigured()) {
    throw new Error('mastercontrol_root is not configured in settings');
  }

  const reportsRoot = path.resolve(getReportsRoot());
  const outputDir = path.join(reportsRoot, 'mileage');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `mileage-report-${input.start_date}-to-${input.end_date}-${timestamp}.pdf`;
  const outputPath = path.resolve(outputDir, fileName);
  const safeRoot = `${path.normalize(reportsRoot)}${path.sep}`;
  if (!path.normalize(outputPath).startsWith(safeRoot)) {
    throw new Error('safe-path-rejected: mileage PDF destination escapes reports root');
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, buildMileagePdf(input));

  return {
    file_name: fileName,
    file_path: outputPath,
    row_count: input.rows.length,
    total_miles: roundMiles(input.total_miles),
  };
}
