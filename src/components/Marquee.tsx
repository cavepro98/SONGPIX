import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  speed?: number; // px per second
  gap?: number; // px
};

export function Marquee({ children, className = "", speed = 40, gap = 48 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [duration, setDuration] = useState(10);

  useEffect(() => {
    const wrap = wrapRef.current;
    const content = measureRef.current;
    if (!wrap || !content) return;

    function measure() {
      const w = wrap!.getBoundingClientRect().width;
      const c = content!.scrollWidth;
      const isOver = c > w + 2;
      setOverflow(isOver);
      if (isOver) setDuration(Math.max(6, (c + gap) / speed));
    }

    const frame = window.requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(content);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => {
      window.cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [children, gap, speed]);

  return (
    <div
      ref={wrapRef}
      className={`${overflow ? "marquee-mask" : ""} relative block w-full min-w-0 max-w-full overflow-hidden ${className}`}
      title={typeof children === "string" ? children : undefined}
    >
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 inline-block max-w-none whitespace-nowrap"
      >
        {children}
      </span>
      {overflow ? (
        <div
          className="flex w-max min-w-full whitespace-nowrap will-change-transform"
          style={
            {
              animation: `marquee-loop ${duration}s linear infinite`,
              gap: `${gap}px`,
              "--marquee-offset": `${gap / 2}px`,
            } as CSSProperties
          }
        >
          <span className="shrink-0">{children}</span>
          <span aria-hidden className="shrink-0">
            {children}
          </span>
        </div>
      ) : (
        <span className="block min-w-0 whitespace-nowrap">{children}</span>
      )}
    </div>
  );
}
