import * as React from "react"
import { cn } from "@/lib/utils"

const badgeVariants = ({ variant = "default", className = "" } = {}) => {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground",
    secondary: "border-transparent bg-secondary text-secondary-foreground",
    outline: "text-foreground border border-border",
    active: "bg-primary/10 text-primary border border-primary/25",
    trial: "bg-warning/15 text-[#B45309] border border-warning/30",
    suspended: "bg-muted text-muted-foreground border border-border",
    
    // Appointment Queue status variants
    scheduled: "bg-primary/10 text-primary border border-primary/25",
    checked_in: "bg-secondary/15 text-[#0F766E] border border-secondary/30",
    in_consultation: "bg-warning/15 text-[#B45309] border border-warning/30",
    completed: "bg-muted text-muted-foreground border border-border",
    cancelled: "bg-destructive/10 text-destructive border border-destructive/20",
    no_show: "bg-muted text-muted-foreground border border-border",

    // Role variants
    hospital_admin: "bg-primary/10 text-primary border border-primary/20",
    doctor: "bg-primary/10 text-primary border border-primary/20",
    receptionist: "bg-secondary/15 text-primary border border-secondary/30",
    nurse: "bg-primary/10 text-primary border border-primary/20",
    lab_technician: "bg-primary/10 text-primary border border-primary/20",
    pharmacist: "bg-primary/10 text-primary border border-primary/20",
    accountant: "bg-secondary/15 text-primary border border-secondary/30",
  };

  return cn(base, variants[variant] || variants.default, className);
};

function Badge({ className, variant = "default", ...props }) {
  return (
    <div className={badgeVariants({ variant, className })} {...props} />
  )
}

export { Badge, badgeVariants }
