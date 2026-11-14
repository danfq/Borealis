import { useEffect, useRef } from "react";
import { hideSession, showSession, useObscured } from "@/lib/session";

type SessionProps = {
  /**
   * account whose whatsapp web session is shown
   */
  id: string;
};

/**
 * placeholder the native session webview is laid over
 */
export function Session({ id }: SessionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const obscured = useObscured();

  useEffect(() => {
    const element = ref.current;

    if (!element || obscured) return;

    /**
     * report the current area so the webview follows the layout
     */
    const sync = () => {
      const { x, y, width, height } = element.getBoundingClientRect();

      showSession(id, { x, y, width, height });
    };

    // right away so a pending hide from the previous account is cancelled,
    // then on every resize
    sync();

    const observer = new ResizeObserver(sync);
    observer.observe(element);

    return () => {
      observer.disconnect();
      hideSession();
    };
  }, [id, obscured]);

  return (
    <section
      ref={ref}
      data-slot="session"
      className="flex min-h-0 flex-1 bg-background"
    />
  );
}
