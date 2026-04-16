import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

const workflowStatVariants = cva("rounded-[14px] border p-3", {
  variants: {
    tone: {
      default: "border-bg-border bg-[#101112]",
      accent: "border-[rgba(163,230,53,0.2)] bg-[#10140f]",
      warning: "border-[rgba(250,204,21,0.18)] bg-[#14120f]",
      danger: "border-[rgba(251,113,133,0.2)] bg-[#151012]",
    },
  },
  defaultVariants: {
    tone: "default",
  },
});

const workflowStageVariants = cva("rounded-[14px] border p-3 transition", {
  variants: {
    active: {
      true: "border-[rgba(163,230,53,0.28)] bg-[#121511]",
      false: "border-bg-border bg-bg-hover/35 hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/50",
    },
    tone: {
      default: "",
      warning: "border-[rgba(250,204,21,0.18)] bg-[#15130f]",
    },
  },
  defaultVariants: {
    active: false,
    tone: "default",
  },
});

export function WorkflowSection(props: {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  density?: "default" | "dense";
}) {
  return (
    <Card className={cn("rounded-[14px] border-bg-border bg-bg-card/70", props.className)}>
      <CardHeader className={cn(props.density === "dense" ? "px-4 pb-2.5 pt-4" : "pb-3")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {props.eyebrow ? <div className="section-kicker">{props.eyebrow}</div> : null}
            <CardTitle className="mt-1">{props.title}</CardTitle>
            {props.description ? <CardDescription className="mt-1 max-w-3xl">{props.description}</CardDescription> : null}
          </div>
          {props.action}
        </div>
      </CardHeader>
      <CardContent className={cn("pt-0", props.density === "dense" && "px-4 pb-4")}>{props.children}</CardContent>
    </Card>
  );
}

export function WorkflowStat(
  props: {
    label: string;
    value: string;
    detail?: string;
    className?: string;
  } & VariantProps<typeof workflowStatVariants>,
) {
  return (
    <div className={cn(workflowStatVariants({ tone: props.tone }), props.className)}>
      <div className="scorecard-grid">
        <div className="scorecard-label wrap-anywhere">{props.label}</div>
        <div className="scorecard-value wrap-anywhere text-[1.05rem] font-semibold tracking-tight">{props.value}</div>
        {props.detail ? <div className="scorecard-detail text-xs leading-5">{props.detail}</div> : <div />}
      </div>
    </div>
  );
}

export function WorkflowStageCard(
  props: {
    label: string;
    value: string;
    detail?: string;
    active?: boolean;
    className?: string;
  } & VariantProps<typeof workflowStageVariants> & React.HTMLAttributes<HTMLDivElement>,
) {
  const { label, value, detail, active, tone, className, ...rest } = props;
  return (
    <div className={cn(workflowStageVariants({ active, tone }), className)} {...rest}>
      <div className="scorecard-grid">
        <div className="section-kicker wrap-anywhere">{label}</div>
        <div className="scorecard-value wrap-anywhere text-2xl font-semibold tracking-tight">{value}</div>
        {detail ? <div className="scorecard-detail text-xs">{detail}</div> : <div />}
      </div>
    </div>
  );
}

export function WorkflowBadge(props: React.ComponentProps<typeof Badge>) {
  return <Badge {...props} />;
}

export function WorkflowChipButton(props: React.ComponentProps<typeof Button>) {
  return <Button size="sm" variant="ghost" className="rounded-full px-3 text-xs" {...props} />;
}

export function ReviewSection(props: {
  step: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-[16px] border-bg-border bg-[#101112]", props.className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="default" className="bg-[#111214] text-[10px] text-text-secondary">
            {props.step}
          </Badge>
          <CardTitle className="text-[0.95rem]">{props.title}</CardTitle>
        </div>
        {props.description ? <CardDescription>{props.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="pt-0">{props.children}</CardContent>
    </Card>
  );
}
