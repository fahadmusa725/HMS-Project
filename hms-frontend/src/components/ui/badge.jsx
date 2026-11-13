import * as React from "react"
import { cn } from "@/lib/utils"

const badgeVariants = ({ variant = "default", className = "" } = {}) => {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

  // Status families: tinted surface + the matching status ink. Filled variants use the
  // `*-foreground` ink, which is what those tokens are tuned for.
  const primarySoft = "bg-primary/10 text-primary border border-primary/25";
  const infoSoft = "bg-info/10 text-info border border-info/30";
  const successSoft = "bg-success/10 text-success border border-success/30";
  const warningSoft = "bg-warning/10 text-warning border border-warning/30";
  const dangerSoft = "bg-destructive/10 text-destructive border border-destructive/25";
  const neutral = "bg-muted text-muted-foreground border border-border";

  const variants = {
    default: "border-transparent bg-primary text-primary-foreground",
    secondary: "border-transparent bg-secondary text-secondary-foreground",
    outline: "text-foreground border border-border-strong",
    active: primarySoft,
    trial: warningSoft,
    suspended: neutral,
    neutral,

    scheduled: primarySoft,
    checked_in: infoSoft,
    in_consultation: warningSoft,
    completed: successSoft,
    cancelled: dangerSoft,
    no_show: neutral,

    ordered: infoSoft,
    sample_collected: warningSoft,
    in_progress: primarySoft,

    paid: successSoft,
    partial: warningSoft,
    unpaid: dangerSoft,

    // Digital pre-check: submitted by the patient, still waiting, or closed for editing.
    precheck: successSoft,
    precheck_pending: neutral,
    precheck_locked: neutral,

    in_stock: successSoft,
    low_stock: warningSoft,
    out_of_stock: dangerSoft,

    hospital_admin: "bg-accent text-accent-foreground border border-primary/25",
    doctor: primarySoft,
    receptionist: neutral,
    nurse: infoSoft,
    lab_technician: warningSoft,
    pharmacist: successSoft,
    accountant: neutral,
  };

  return cn(base, variants[variant] || variants.default, className);
};

function Badge({ className, variant = "default", ...props }) {
  return (
    <div className={badgeVariants({ variant, className })} {...props} />
  )
}

export { Badge, badgeVariants }
