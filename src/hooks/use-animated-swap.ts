import { useEffect, useRef, useState } from "react";

type Swappable = { id: string } | null | undefined;

export function useAnimatedSwap<T extends Swappable>(value: T, exitMs = 900) {
  const [displayed, setDisplayed] = useState<T>(value);
  const [isLeaving, setIsLeaving] = useState(false);
  const nextValue = useRef<T>(value);

  useEffect(() => {
    const displayedId = displayed?.id ?? null;
    const valueId = value?.id ?? null;

    if (displayedId === valueId) {
      setDisplayed(value);
      return;
    }

    if (!displayed) {
      setDisplayed(value);
      setIsLeaving(false);
      return;
    }

    nextValue.current = value;
    setIsLeaving(true);

    const timeout = window.setTimeout(() => {
      setDisplayed(nextValue.current);
      setIsLeaving(false);
    }, exitMs);

    return () => window.clearTimeout(timeout);
  }, [displayed, exitMs, value]);

  return { displayed, isLeaving };
}
