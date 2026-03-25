import * as Location from 'expo-location';

export type UserLocation = {
  city: string;
  latitude: number;
  longitude: number;
};

export async function getLocationPermission(): Promise<Location.PermissionStatus> {
  const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
  if (existingStatus !== 'undetermined') {
    return existingStatus;
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status;
}

export async function getUserCityAndCoords(skipGeocode = false): Promise<UserLocation | null> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') {
    return null;
  }

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const { latitude, longitude } = pos.coords;

  let city = 'Your City';
  if (!skipGeocode) {
    try {
      const places = await Location.reverseGeocodeAsync({ latitude, longitude });
      const first = places[0];
      city =
        first?.city ||
        first?.subregion ||
        first?.region ||
        first?.country ||
        'Your City';
    } catch (e) {
      console.warn('Reverse geocode failed', e);
    }
  }

  return {
    city,
    latitude,
    longitude,
  };
}


// Haversine formula to calculate distance in km
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLineDistance = R * c; // Distance in km
  
  // Apply a "routing penalty" - roads are rarely straight lines.
  // A common multiplier for city environments is ~1.35 to 1.4
  return straightLineDistance * 1.35;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Estimate travel time (driving in city traffic)
export function estimateTravelTime(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);

  // City driving speed tiers (accounts for traffic, stops, routing inefficiency)
  // Adjusted downward to be more realistic and match GPS mapping
  let speed: number;
  if (distance < 1) {
    speed = 10; // ~10 km/h: very close, walking/parking speed, many stops
  } else if (distance < 5) {
    speed = 15; // ~15 km/h: city center, heavy traffic, traffic lights
  } else if (distance < 15) {
    speed = 22; // ~22 km/h: suburban, moderate traffic
  } else {
    speed = 35; // ~35 km/h: highway mix, longer uninterrupted stretches
  }

  const timeHours = distance / speed;
  const timeMinutes = Math.round(timeHours * 60);

  if (timeMinutes < 1) {
    return 'Nearby';
  } else if (timeMinutes < 60) {
    return `${timeMinutes} min away`;
  } else {
    const hours = Math.floor(timeMinutes / 60);
    const mins = timeMinutes % 60;
    if (mins === 0) return `${hours}h away`;
    return `${hours}h ${mins}m away`;
  }
}

/**
 * Returns true when the user is within `radiusMetres` of the venue.
 * Uses the same Haversine implementation as calculateDistance so there
 * is a single source of truth for distance maths.
 *
 * @param userLat      - User's current latitude
 * @param userLng      - User's current longitude
 * @param venueLat     - Venue latitude from the database
 * @param venueLng     - Venue longitude from the database
 * @param radiusMetres - Detection radius in metres (default: 175)
 */
export function isNearVenue(
  userLat: number,
  userLng: number,
  venueLat: number,
  venueLng: number,
  radiusMetres = 175
): boolean {
  // calculateDistance returns km with a 1.35× road-routing penalty.
  // For proximity detection we want straight-line metres, so we
  // divide by the penalty factor and convert km → m.
  const straightLineKm = calculateDistance(userLat, userLng, venueLat, venueLng) / 1.35;
  const straightLineMetres = straightLineKm * 1000;
  return straightLineMetres <= radiusMetres;
}

