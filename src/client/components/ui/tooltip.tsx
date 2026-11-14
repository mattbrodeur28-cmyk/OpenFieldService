import * as Primitive from "@radix-ui/react-tooltip";
import type { ComponentChildren } from "preact";

/** Tooltips supplement a control's own accessible label; never hide essential text here. */
export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ComponentChildren;
}) {
  return (
    <Primitive.Provider delayDuration={400}>
      <Primitive.Root>
        <Primitive.Trigger asChild>{children}</Primitive.Trigger>
        <Primitive.Portal container={document.body}>
          <Primitive.Content
            className="ui-tooltip"
            sideOffset={6}
            collisionPadding={8}
          >
            {label}
            <Primitive.Arrow className="ui-tooltip-arrow" />
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  );
}
