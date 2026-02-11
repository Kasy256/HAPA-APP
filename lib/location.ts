import * as Location from 'expo-location';

export type UserLocation = {
  city: string;
  latitude: number;
  longitude: number;
};

export async function getUserCityAndCoords(): Promise<UserLocation | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return null;
  }

  const pos = await Location.getCurrentPositionAsync({});
  const { latitude, longitude } = pos.coords;

  const places = await Location.reverseGeocodeAsync({ latitude, longitude });
  const first = places[0];

  const city =
    first?.city ||
    first?.subregion ||
    first?.region ||
    first?.country ||
    'Your City';

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

// Estimate travel time
export function estimateTravelTime(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);

  // Assume:
  // Walking speed: 5 km/h for distances < 2km
  // Driving speed: 30 km/h (city traffic) for distances >= 2km

  let speed = 30; // km/h
  if (distance < 2) {
    speed = 5; // km/h
  }

  const timeHours = distance / speed;
  const timeMinutes = Math.round(timeHours * 60);

  if (timeMinutes < 1) {
    return 'Now';
  } else if (timeMinutes < 60) {
    return `${timeMinutes} mins`;
  } else {
    const hours = Math.floor(timeMinutes / 60);
    const mins = timeMinutes % 60;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }
}
