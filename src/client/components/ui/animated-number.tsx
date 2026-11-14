import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import 'number-flow';
import type NumberFlowElement from 'number-flow';

/** Shared NumberFlow adapter. Initial values are static; only subsequent changes animate. */
export function AnimatedNumber({ value, format, animated = true }: {
  value: number;
  format?: NumberFlowElement['format'];
  animated?: boolean;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const flow = useRef<NumberFlowElement | null>(null);
  const [ready, setReady] = useState(false);
  const finiteValue = Number.isFinite(value) ? value : 0;
  const valid = Number.isFinite(value);
  const formatted = valid ? new Intl.NumberFormat(undefined, format).format(finiteValue) : '—';
  useLayoutEffect(() => {
    if (!host.current || typeof customElements === 'undefined') return;
    const element = document.createElement('number-flow');
    if (typeof element.update !== 'function') return;
    element.respectMotionPreference = true;
    element.transformTiming = { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' };
    element.opacityTiming = { duration: 125, easing: 'ease-out' };
    element.style.fontVariantNumeric = 'tabular-nums';
    host.current.appendChild(element);
    flow.current = element;
    setReady(true);
    return () => { element.remove(); flow.current = null; };
  }, []);
  useLayoutEffect(() => {
    const element = flow.current;
    if (!element) return;
    element.hidden = !valid;
    if (!valid) return;
    element.animated = animated;
    element.format = format;
    element.update(finiteValue);
  }, [finiteValue, format, animated, valid]);
  return <span style={{ position: 'relative', fontVariantNumeric: 'tabular-nums' }}>
    <span aria-hidden="true" ref={host} />
    {(!ready || !valid) && <span aria-hidden="true">{formatted}</span>}
    <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>{formatted}</span>
  </span>;
}
