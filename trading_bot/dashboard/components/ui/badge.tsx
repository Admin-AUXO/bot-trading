import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/components/ui/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
  {
    variants: {
      variant: {
        default: "border-bg-border bg-[#131614] text-text-secondary",
        accent: "border-[rgba(163,230,53,0.26)] bg-[rgba(163,230,53,0.12)] text-[var(--success)]",
        warning: "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.12)] text-[var(--warning)]",
        danger: "border-[rgba(251,113,133,0.26)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
