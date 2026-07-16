// Shared API base. In dev the Vite server proxies /api → localhost:3001,
// so an empty base works. In production the backend lives on Render.
export const API_BASE =
  window.location.origin.includes("localhost") ||
  window.location.origin.includes("127.0.0.1")
    ? ""
    : "https://ritabrata-portfolio-backend.onrender.com";

export async function apiGet(path: string) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}
