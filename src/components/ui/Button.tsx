"use client";

import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  className = "",
  ...props
}: ButtonProps) {
  const sizeClass = {
    sm: "h-8 px-3 text-subhead gap-1.5 rounded-full",
    md: "h-10 px-4 text-headline gap-2 rounded-xl",
    lg: "h-12 px-6 text-headline gap-2 rounded-2xl",
  }[size];

  // Filled for the one primary action; tinted fills for everything secondary.
  const variantClass = {
    primary: "bg-accent text-white",
    secondary: "bg-gray/15 text-label",
    outline: "bg-gray/15 text-accent-text",
    ghost: "text-accent-text hover:bg-gray/10",
    danger: "bg-negative/12 text-negative",
    success: "bg-positive text-white",
  }[variant];

  return (
    <button
      className={`press inline-flex select-none items-center justify-center font-semibold disabled:opacity-40 ${sizeClass} ${variantClass} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
