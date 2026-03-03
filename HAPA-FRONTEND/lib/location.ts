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
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Estimate travel time (driving in city traffic)
export function estimateTravelTime(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);

  // City driving speed tiers (accounts for traffic, stops, etc.)
  // < 1 km  → very close, ~15 km/h (short hops, parking, etc.)
  // 1-5 km  → city center, ~20 km/h (traffic + signals)
  // 5-15 km → suburban, ~30 km/h
  // > 15 km → highway mix, ~40 km/h

  let speed: number;
  if (distance < 1) {
    speed = 15;
  } else if (distance < 5) {
    speed = 20;
  } else if (distance < 15) {
    speed = 30;
  } else {
    speed = 40;
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
