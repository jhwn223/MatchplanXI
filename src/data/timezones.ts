/** Standard UTC offset (hours) for each 2026 World Cup host city during the
 *  tournament window (June-July, when US/Canada observe DST and Mexico does not). */
const CITY_UTC_OFFSET: Record<string, number> = {
  "Mexico City": -6,
  "East Rutherford": -4,
  Inglewood: -7,
  Arlington: -5,
  Vancouver: -7,
  Toronto: -4,
  Zapopan: -6,
  Guadalupe: -6,
  Atlanta: -4,
  Foxborough: -4,
  Houston: -5,
  "Kansas City": -5,
  "Miami Gardens": -4,
  Philadelphia: -4,
  "Santa Clara": -7,
  Seattle: -7,
};

export function utcOffsetForCity(city: string): number {
  return CITY_UTC_OFFSET[city] ?? -6;
}
