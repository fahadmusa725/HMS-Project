/** "Kamran Ahmed" -> "Dr. Kamran Ahmed", but leaves "Dr. Kamran Ahmed" alone (staff often enter the title themselves). */
function doctorName(name) {
  const n = (name || "").trim();
  if (!n) return "-";
  return /^dr\.?\s/i.test(n) ? n : `Dr. ${n}`;
}

module.exports = doctorName;
