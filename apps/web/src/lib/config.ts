// Environment configuration utility
export const getServerUrl = (): string => {
  if (import.meta.env.DEV) {
    // Local development environment
    return import.meta.env.VITE_LOCAL_SERVER_URL || import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
  } else {
    // Production/staging environment (Cloudflare Workers)
    return import.meta.env.VITE_SERVER_URL || "https://api.avantej.com";
  }
};





