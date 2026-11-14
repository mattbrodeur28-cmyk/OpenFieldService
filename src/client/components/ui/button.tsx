import { forwardRef } from "preact/compat";
import type { JSX } from "preact";

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "default" | "icon";
};

/** Source-owned, token-styled control. Defaults to button; forms opt into submit. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "default",
      size = "default",
      class: className = "",
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        class={`${size === "icon" ? "btn-icon" : "btn"} ui-button ui-button-${variant} ${variant === "primary" ? "btn-primary" : ""} ${className}`}
      />
    );
  },
);
