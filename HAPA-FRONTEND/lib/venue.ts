/**
 * Venue utility functions
 */

export interface WorkingHours {
    [day: string]: {
        open: string;
        close: string;
    } | null;
}

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Determines if a venue is currently open based on working hours
 * @param workingHours - The venue's working hours object
 * @param currentTime - Current date/time (defaults to now)
 * @returns true if venue is open, false if closed, null if unknown
 */
export function isVenueOpen(
    workingHours: WorkingHours | undefined | null,
    currentTime: Date = new Date()
): boolean | null {
    if (!workingHours) {
        return null; // Unknown status
    }

    const dayOfWeek = DAYS_OF_WEEK[currentTime.getDay()];
    const todayHours = workingHours[dayOfWeek];

    if (!todayHours || !todayHours.open || !todayHours.close) {
        return false; // Closed if no hours defined for today
    }

    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const openMinutes = parseTime(todayHours.open);
    const closeMinutes = parseTime(todayHours.close);

    if (openMinutes === null || closeMinutes === null) {
        return null; // Invalid time format
    }

    // Handle venues that close after midnight
    if (closeMinutes < openMinutes) {
        // e.g., open 10:00 PM, close 2:00 AM
        return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
    }

    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

/**
 * Gets formatted status text for a venue (e.g., "Open • Closes 2 AM" or "Closed • Opens 10 AM")
 * @param workingHours - The venue's working hours object
 * @param currentTime - Current date/time (defaults to now)
 * @returns Formatted status string
 */
export function getVenueStatusText(
    workingHours: WorkingHours | undefined | null,
    currentTime: Date = new Date()
): string {
    const open = isVenueOpen(workingHours, currentTime);

    if (open === null || !workingHours) {
        return 'Hours not available';
    }

    const dayOfWeek = DAYS_OF_WEEK[currentTime.getDay()];
    const todayHours = workingHours[dayOfWeek];

    if (!todayHours || !todayHours.open || !todayHours.close) {
        return 'Closed today';
    }

    if (open) {
        const closeTime = formatTime(todayHours.close);
        return `Open • Closes ${closeTime}`;
    } else {
        // Check if opens later today or tomorrow
        const openMinutes = parseTime(todayHours.open);
        const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

        if (openMinutes !== null && currentMinutes < openMinutes) {
            // Opens later today
            const openTime = formatTime(todayHours.open);
            return `Closed • Opens ${openTime}`;
        } else {
            // Closed for today, check tomorrow
            const tomorrowIndex = (currentTime.getDay() + 1) % 7;
            const tomorrowDay = DAYS_OF_WEEK[tomorrowIndex];
            const tomorrowHours = workingHours[tomorrowDay];

            if (tomorrowHours && tomorrowHours.open) {
                const openTime = formatTime(tomorrowHours.open);
                return `Closed • Opens tomorrow ${openTime}`;
            }

            return 'Closed';
        }
    }
}

/**
 * Parse time string (HH:MM) to minutes since midnight
 */
function parseTime(timeStr: string): number | null {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return null;
    }

    return hours * 60 + minutes;
}

/**
 * Format time from 24h format to 12h format with AM/PM
 * @param timeStr - Time string in HH:MM format
 */
function formatTime(timeStr: string): string {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return timeStr;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);

    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12; // Convert 0 to 12 for midnight, 13-23 to 1-11

    const minutesStr = minutes === 0 ? '' : `:${minutes.toString().padStart(2, '0')}`;
    return `${hours}${minutesStr} ${period}`;
}
