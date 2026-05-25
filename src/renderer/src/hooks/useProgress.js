import { useCallback, useState } from "react";

const useProgress = () => {
  const [target, setTarget] = useState(0);
  const [progress, setProgress] = useState(0);

  const resetProgress = useCallback(() => {
    setTarget(0);
    setProgress(0);
  }, []);

  const incrementProgress = useCallback(
    () => setProgress((prev) => prev + 1),
    []
  );

  return {
    target,
    progress,
    setTarget,
    resetProgress,
    incrementProgress,
  };
};

export { useProgress };
