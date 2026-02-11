export function getTimeAgo(dateString: string): string {
    if (!dateString) return '';

    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) {
        return 'Just now';
    } else if (diffMin < 60) {
        return `${diffMin}m ago`;
    } else if (diffHr < 24) {
        return `${diffHr}h ago`;
    } else if (diffDay < 7) {
        return `${diffDay}d ago`;
    } else {
        return date.toLocaleDateString();
    }
}
