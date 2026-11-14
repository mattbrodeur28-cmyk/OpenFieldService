import type { ComponentChildren, JSX } from "preact";
import { X, LoaderCircle } from "lucide-preact";
import { Button } from "./button";
import { Dialog } from "./dialog";

export function Card({
  children,
  class: className = "",
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return <section class={"ui-card " + className}>{children}</section>;
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ComponentChildren;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  return <span class={"ui-badge ui-badge-" + tone}>{children}</span>;
}
export function Avatar({ name }: { name: string }) {
  return (
    <span class="ui-avatar" aria-hidden="true">
      {name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function Notice({
  children,
  tone = "info",
  close,
}: {
  children: ComponentChildren;
  tone?: "info" | "success" | "danger" | "warning";
  close?(): void;
}) {
  return (
    <div
      class={"ui-notice ui-notice-" + tone}
      role={tone === "danger" ? "alert" : "status"}
    >
      <div>{children}</div>
      {close && (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Dismiss notification"
          onClick={close}
        >
          <X size={16} />
        </Button>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ComponentChildren;
  action?: ComponentChildren;
}) {
  return (
    <div class="ui-empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div class="ui-loading" role="status">
      <LoaderCircle size={18} aria-hidden="true" />
      {label}
    </div>
  );
}
export function Skeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div class="ui-skeleton" role="status" aria-label={label}>
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </div>
  );
}
export function Table({
  label,
  children,
}: {
  label: string;
  children: ComponentChildren;
}) {
  return (
    <div class="ui-table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table class="table ui-table">
        <caption class="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}
export function Sheet({
  children,
  close,
}: {
  children: ComponentChildren;
  close(): void;
}) {
  return (
    <Dialog class="ui-sheet" close={close}>
      {children}
    </Dialog>
  );
}
export function Textarea({
  class: className = "",
  ...props
}: JSX.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} class={"ui-input ui-textarea " + className} />;
}
export function Checkbox({
  label,
  ...props
}: JSX.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label class="ui-check">
      <input {...props} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}
