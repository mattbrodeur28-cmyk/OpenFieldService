import * as Primitive from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-preact";
import { Button } from "./button";

export function ActionMenu({
  label,
  items,
  disabled,
}: {
  label: string;
  disabled?: boolean;
  items: {
    label: string;
    onSelect(): void;
    disabled?: boolean;
    danger?: boolean;
  }[];
}) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          disabled={disabled}
        >
          <MoreHorizontal size={19} />
        </Button>
      </Primitive.Trigger>
      <Primitive.Portal container={document.body}>
        <Primitive.Content
          className="ui-menu"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          aria-label={label}
        >
          {items.map((item) => (
            <Primitive.Item
              key={item.label}
              className={"ui-menu-item" + (item.danger ? " danger" : "")}
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {item.label}
            </Primitive.Item>
          ))}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
