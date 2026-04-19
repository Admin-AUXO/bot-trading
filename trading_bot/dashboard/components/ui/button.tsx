import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/components/ui/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_65%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-[rgba(163,230,53,0.3)] bg-[#10120f] text-text-primary hover:border-[rgba(163,230,53,0.5)] hover:text-accent",
        secondary: "border-bg-border bg-[#121214] text-text-primary hover:border-[rgba(255,255,255,0.12)] hover:bg-[#151517]",
        ghost: "border-bg-border text-text-secondary hover:border-[rgba(255,255,255,0.12)] hover:bg-[#151517] hover:text-text-primary",
        warning: "border-[rgba(250,204,21,0.22)] bg-[#14130f] text-text-primary hover:border-[rgba(250,204,21,0.4)]",
      },
      size: {
        sm: "h-7.5 px-2.5 text-[11px]",
        default: "h-8.5 px-3",
        lg: "h-9.5 px-3.5",
        icon: "h-8.5 w-8.5 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
