export const readStorage = (key, fallback = null) => {
    try {
        return window.localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
};

export const writeStorage = (key, value) => {
    try {
        if (value === null || value === undefined) {
            window.localStorage.removeItem(key);
        } else {
            window.localStorage.setItem(key, String(value));
        }
    } catch {
        // Browsing with storage disabled must not interrupt a journey search.
    }
};

export const readStoredJSON = (key, fallback = null) => {
    try {
        const value = readStorage(key);
        return value === null ? fallback : JSON.parse(value);
    } catch {
        return fallback;
    }
};

export const writeStoredJSON = (key, value) => {
    writeStorage(key, value === null ? null : JSON.stringify(value));
};
