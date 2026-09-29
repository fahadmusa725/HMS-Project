// Payment methods that settle through the patient's own JazzCash/Easypaisa app or a bank
// transfer - these are manual reference-number records, not a live gateway integration, so a
// transaction reference is required to keep them auditable.
const REFERENCE_REQUIRED_METHODS = ["jazzcash", "easypaisa", "bank_transfer"];

/** Recompute amountPaid + paymentStatus from the payments ledger so they never drift apart. */
function recalcBillTotals(bill) {
  bill.amountPaid = bill.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  if (bill.amountPaid >= bill.totalAmount && bill.totalAmount > 0) {
    bill.paymentStatus = "paid";
  } else if (bill.amountPaid > 0) {
    bill.paymentStatus = "partial";
  } else {
    bill.paymentStatus = "unpaid";
  }
}

module.exports = { REFERENCE_REQUIRED_METHODS, recalcBillTotals };
