import type { ButtonHTMLAttributes } from "react";
import { buttonClasses, type ButtonVariant } from "../lib/button-classes";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}
