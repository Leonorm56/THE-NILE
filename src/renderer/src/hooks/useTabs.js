import { useCallback, useMemo, useState } from "react";

import useValuesMemo from "./useValuesMemo";

export default function useTabs(defaultList = [], defaultValue) {
  /** List */
  const list = useMemo(() => defaultList, defaultList);

  /** Tab Value */
  const [value, setValue] = useState(defaultValue || list[0]);

  /** Reset Tab */
  const reset = useCallback(() => setValue(list[0]), [list, setValue]);

  return useValuesMemo({
    value,
    list,
    reset,
    setValue,
    rootProps: useValuesMemo({ value, onValueChange: setValue }),
  });
}
