import { useCallback, useEffect, useState } from "react";
import { failureMessage, onFailure, takePendingFailures } from "./failures";

export function useNotice(): [string | null, (error: unknown, fallback?: string) => void] {
  const [notice, setNotice] = useState<string | null>(null);
  const showNotice = useCallback((error: unknown, fallback = "Something went wrong.") => {
    if (error == null) {
      setNotice(null);
      return;
    }
    setNotice(failureMessage(error, fallback));
  }, []);
  useEffect(() => {
    for (const message of takePendingFailures()) {
      showNotice(message, message);
    }
    return onFailure((message) => {
      showNotice(message, message);
    });
  }, [showNotice]);
  return [notice, showNotice];
}
