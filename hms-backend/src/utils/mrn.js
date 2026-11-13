/**
 * Human-readable MRN prefix from the hospital name, e.g. "City Hospital" -> "CTH".
 * Shared by staff registration, public signup and the walk-in quick-register path so
 * every route that creates a patient produces the same MRN shape.
 */
function buildMrnPrefix(hospitalName) {
  const letters = String(hospitalName || "")
    .replace(/[^a-zA-Z ]/g, "")
    .split(" ")
    .filter(Boolean);
  const initials = letters.map((word) => word[0]).join("").toUpperCase();
  return (initials || "HSP").slice(0, 4);
}

module.exports = { buildMrnPrefix };
