import { normalizeLocation, validLocation } from './transit.js';

// Preserve API ranking and routing IDs. Separate stops can share a name and
// coordinates, for example opposite boarding points at the same station.
export const uniqueLocations = (locations, { limit = 8 } = {}) => {
    const results = [];
    const seenIds = new Set();
    for (const item of locations) {
        if (!validLocation(item) || item.type !== 'stop') continue;
        const location = normalizeLocation(item);
        location.name = location.name.trim().replace(/\s+/gu, ' ');
        const id = String(location.id).trim();
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        results.push(location);
    }
    return results.slice(0, limit);
};
