import { useEffect } from "react";

let lockCount = 0;
let scrollY = 0;
let previousOverflow = "";
let previousPosition = "";
let previousTop = "";
let previousWidth = "";
let previousPaddingRight = "";

export function useBodyScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    if (lockCount === 0) {
      scrollY = window.scrollY;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      previousOverflow = document.body.style.overflow;
      previousPosition = document.body.style.position;
      previousTop = document.body.style.top;
      previousWidth = document.body.style.width;
      previousPaddingRight = document.body.style.paddingRight;

      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow;
        document.body.style.position = previousPosition;
        document.body.style.top = previousTop;
        document.body.style.width = previousWidth;
        document.body.style.paddingRight = previousPaddingRight;
        window.scrollTo(0, scrollY);
      }
    };
  }, [enabled]);
}
