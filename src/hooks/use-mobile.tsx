import * as React from "react"

const MOBILE_BREAKPOINT_WIDTH = 1367;
const MOBILE_BREAKPOINT_HEIGHT = 750;
const SMALL_SCREEN_BREAKPOINT = 1024;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_WIDTH - 1}px)`);
    const mqlHeight = window.matchMedia(`(max-height: ${MOBILE_BREAKPOINT_HEIGHT}px)`);

    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_WIDTH || window.innerHeight <= MOBILE_BREAKPOINT_HEIGHT);
    };

    mql.addEventListener("change", onChange);
    mqlHeight.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_WIDTH || window.innerHeight <= MOBILE_BREAKPOINT_HEIGHT);
    return () => {
      mql.removeEventListener("change", onChange);
      mqlHeight.removeEventListener("change", onChange);
    };
  }, []);

  return !!isMobile
}

export function useIsSmallScreen() {
  const [isSmallScreen, setIsSmallScreen] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${SMALL_SCREEN_BREAKPOINT - 1}px)`);

    const onChange = () => {
      setIsSmallScreen(window.innerWidth < SMALL_SCREEN_BREAKPOINT);
    };

    mql.addEventListener("change", onChange);
    setIsSmallScreen(window.innerWidth < SMALL_SCREEN_BREAKPOINT);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  return !!isSmallScreen
}

export function useIsPhone() {
  const [isPhone, setIsPhone] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: 767px)`);

    const onChange = () => {
      setIsPhone(window.innerWidth < 768);
    };

    mql.addEventListener("change", onChange);
    setIsPhone(window.innerWidth < 768);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  return !!isPhone
}
