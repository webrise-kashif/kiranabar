import type { ReactNode } from "react";
import { Link } from "react-router";
import { buttonClasses, type ButtonVariant } from "../lib/button-classes";

/** Same visual treatment as Button, but a real <a> (via Link) -- avoids nesting a <button> inside an <a>. */
export function LinkButton({
  to,
  variant = "primary",
  children,
}: {
  to: string;
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={buttonClasses(variant)}>
      {children}
    </Link>
  );
}
