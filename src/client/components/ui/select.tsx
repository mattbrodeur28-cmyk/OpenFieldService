import * as Primitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-preact";
import { useId } from "preact/hooks";

export type SelectOption = { value: string; label: string; disabled?: boolean };
export function Select({
  label,
  value,
  options,
  onValueChange,
  disabled,
  placeholder = "Choose…",
  name,
  required,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onValueChange(value: string): void;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div class="ui-field ui-select-field">
      <label for={id}>{label}</label>
      <Primitive.Root
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        name={name}
        required={required}
      >
        <Primitive.Trigger id={id} className="ui-select-trigger">
          <Primitive.Value placeholder={placeholder} />
          <Primitive.Icon>
            <ChevronDown size={15} />
          </Primitive.Icon>
        </Primitive.Trigger>
        <Primitive.Portal container={document.body}>
          <Primitive.Content
            className="ui-select-content"
            position="popper"
            sideOffset={5}
            collisionPadding={8}
          >
            <Primitive.ScrollUpButton className="ui-select-scroll">
              <ChevronUp size={15} />
            </Primitive.ScrollUpButton>
            <Primitive.Viewport>
              {options
                .filter((option) => option.value !== "")
                .map((option) => (
                  <Primitive.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className="ui-select-item"
                  >
                    <Primitive.ItemText>{option.label}</Primitive.ItemText>
                    <Primitive.ItemIndicator>
                      <Check size={14} />
                    </Primitive.ItemIndicator>
                  </Primitive.Item>
                ))}
            </Primitive.Viewport>
            <Primitive.ScrollDownButton className="ui-select-scroll">
              <ChevronDown size={15} />
            </Primitive.ScrollDownButton>
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </div>
  );
}
