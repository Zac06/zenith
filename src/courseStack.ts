import { useState } from "react";

// The open courses, one level per course. App keeps the browser history in sync with every screen, so the
// back/forward buttons (and Alt+Arrow on a desktop) move between courses, pages and the main sections.
export function useCourseStack<T>() {
  const [stack, setStack] = useState<T[]>([]);
  const back = () => history.back();
  const clear = () => setStack([]);
  return [stack, setStack, back, clear] as const;
}
