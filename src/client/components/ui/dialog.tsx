import * as Primitive from "@radix-ui/react-dialog";
import { createContext, type ComponentChildren, type JSX } from "preact";
import {
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
} from "preact/hooks";

const Layer = createContext(0);
const TitleId = createContext<string | undefined>(undefined);

/** Shared modal boundary. All nested workspace dialogs must use this primitive. */
export function Dialog({
  children,
  class: className = "",
  close,
}: {
  children: ComponentChildren;
  class?: string;
  close(): void;
}) {
  const depth = useContext(Layer);
  const dialogId = "ofs-dialog-" + useId();
  const focusContent = useCallback((node: HTMLDivElement | null) => {
    if (node && !node.contains(document.activeElement)) node.focus();
  }, []);
  // These dialogs are opened by existing navigation buttons rather than Radix triggers.
  const returnFocus = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const layer = 200 + depth * 2;
  useLayoutEffect(() => {
    if (depth !== 0) return;
    const app = document.getElementById("app");
    if (!app) return;
    const previous = app.inert;
    app.inert = true;
    return () => {
      app.inert = previous;
    };
  }, [depth]);
  return (
    <Primitive.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Layer.Provider value={depth + 1}>
        <TitleId.Provider value={dialogId + "-title"}>
          <Primitive.Portal container={document.body}>
            <Primitive.Overlay
              className="ui-dialog-overlay"
              style={{ zIndex: layer }}
            />
            <Primitive.Content
              ref={focusContent}
              id={dialogId + "-content"}
              aria-labelledby={dialogId + "-title"}
              className={"ui-dialog-content " + className}
              style={{ zIndex: layer + 1 }}
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (returnFocus.current?.isConnected)
                  returnFocus.current.focus();
              }}
            >
              {children}
            </Primitive.Content>
          </Primitive.Portal>
        </TitleId.Provider>
      </Layer.Provider>
    </Primitive.Root>
  );
}

export function DialogTitle(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
  return <Primitive.Title {...props} id={useContext(TitleId)} />;
}
