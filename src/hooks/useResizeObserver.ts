import { useState, useEffect, RefObject } from 'react';


function useResizeObserver(ref: RefObject<HTMLElement>): number | undefined {
  const [width, setWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      // We only expect one entry for a single element
      if (entries[0]) {
        setWidth(entries[0].contentRect.width);
      }
    });

    observer.observe(element);

    // Initial observation
    const initialWidth = element.getBoundingClientRect().width;
    setWidth(initialWidth);

    return () => {
      observer.unobserve(element);
    };
  }, [ref]); // Remove ref.current from dependency array

  return width;
}

export default useResizeObserver;