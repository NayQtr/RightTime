// Where the API lives, for every page that calls it. The three pages wrap fetch differently on purpose — the member
// app rotates refresh tokens, the admin console handles maker-checker, the partner portal carries no member token —
// but they all address the API the same way, and that part was written out three times.
export const CFG = Object.assign({ apiBase: "", staging: true }, (typeof window !== "undefined" && window.QATAR_CONFIG) || {});

// Supabase runs the function next to the database when apiRegion is set (forceFunctionRegion: no extra CORS header needed).
export const apiUrl = (path) => CFG.apiBase + path + (CFG.apiRegion ? `${path.includes("?") ? "&" : "?"}forceFunctionRegion=${CFG.apiRegion}` : "");
