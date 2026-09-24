export const useState = v => [typeof v === 'function' ? v() : v, () => {}];
export const useEffect = () => {};
export const useRef = v => ({ current: v });
export const useMemo = f => f();
export const useCallback = f => f;
