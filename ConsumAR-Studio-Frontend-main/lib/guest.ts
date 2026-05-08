/**
 * Utility to generate and retrieve a persistent guest identifier (Fingerprint).
 * This persists in localStorage and is sent to the backend as a 'macAddress' equivalent.
 */
export const getGuestMac = () => {
  if (typeof window === "undefined") return "server";
  let mac = localStorage.getItem("consumar_guest_mac");
  if (!mac) {
    mac = `guest_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
    localStorage.setItem("consumar_guest_mac", mac);
  }
  return mac;
};
