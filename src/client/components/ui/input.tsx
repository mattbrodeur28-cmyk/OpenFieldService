import { forwardRef } from "preact/compat";
import { useId } from "preact/hooks";
import type { JSX } from "preact";

type InputProps = JSX.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { class: className = "", ...props },
  ref,
) {
  return <input {...props} ref={ref} class={"ui-input " + className} />;
});

/** A label, optional help/error and input with stable accessible relationships. */
export function TextField({
  label,
  hint,
  error,
  id: providedId,
  ...props
}: InputProps & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const helpId = id + "-help";
  return (
    <div class="form-group ui-field">
      <label for={id}>{label}</label>
      <Input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? helpId : props["aria-describedby"]}
      />
      {(error || hint) && (
        <small
          id={helpId}
          class={error ? "ui-field-error" : "ui-field-hint"}
          role={error ? "alert" : undefined}
        >
          {error || hint}
        </small>
      )}
    </div>
  );
}
