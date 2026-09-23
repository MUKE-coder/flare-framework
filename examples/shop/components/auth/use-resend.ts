"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Send a new code", with a countdown so it can't be hammered.
 *
 * Asking again doesn't invalidate the code already sitting in the inbox — people press
 * resend, then find the first email. The server keeps both valid until they expire.
 */
export function useResend(send: () => Promise<unknown>, seconds = 30) {
  const [remaining, setRemaining] = useState(0);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  const resend = useCallback(async () => {
    if (remaining > 0 || sending) return;
    setSending(true);
    try {
      await send();
    } finally {
      setSending(false);
    }
    setRemaining(seconds);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) clearInterval(timer.current);
        return Math.max(0, value - 1);
      });
    }, 1000);
  }, [remaining, sending, send, seconds]);

  return {
    resend,
    sending,
    remaining,
    /** "Send a new code" → "Send a new code in 24s" */
    label: remaining > 0 ? `Send a new code in ${remaining}s` : "Send a new code",
    disabled: remaining > 0 || sending,
  };
}
