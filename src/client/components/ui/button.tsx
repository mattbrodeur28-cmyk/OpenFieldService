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
        class={`${size === "icon" ? "btn-icon slds-button slds-button_icon" : "btn slds-button"} ui-button ui-button-${variant} ${variant === "primary" ? "btn-primary slds-button_brand" : variant === "danger" ? "slds-button_destructive" : variant === "ghost" ? "slds-button_neutral" : "slds-button_neutral"} ${className}`}
      />
    );
  },
);
