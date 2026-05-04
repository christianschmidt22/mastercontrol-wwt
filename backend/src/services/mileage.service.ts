import { calendarEventModel, type CalendarEvent } from '../models/calendarEvent.model.js';
import { mileageDistanceModel } from '../models/mileageDistance.model.js';

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

function isMileageLocation(event: CalendarEvent): boolean {
  const location = normalizeLocation(event.location ?? '');
  if (!location) return false;
  const lower = location.toLowerCase();
  if (EXCLUDED_LOCATION_NEEDLES.some((needle) => lower.includes(needle))) return false;
  if (VIRTUAL_LOCATION_NEEDLES.some((needle) => lower === needle || lower.includes(needle))) return false;
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
    const toAddress = normalizeLocation(event.location ?? '');
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
