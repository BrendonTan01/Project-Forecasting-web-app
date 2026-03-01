"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "sm" | "md";

const buttonSizeClass: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: "app-btn-primary",
  secondary: "app-btn-secondary",
  danger: "app-btn-danger",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cx("app-btn focus-ring", buttonVariantClass[variant], buttonSizeClass[size], className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentPropsWithoutRef<"input">) {
  return <input className={cx("app-input", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentPropsWithoutRef<"select">) {
  return <select className={cx("app-select", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cx("app-textarea", className)} {...props} />;
}

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cx("app-card", className)} {...props} />;
}

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger";

const badgeVariantClass: Record<BadgeVariant, string> = {
  neutral: "app-badge-neutral",
  info: "app-badge-info",
  success: "app-badge-success",
  warning: "app-badge-warning",
  danger: "app-badge-danger",
};

export function Badge({
  variant = "neutral",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cx("app-badge", badgeVariantClass[variant], className)}>{children}</span>;
}
