import { useState, useEffect } from "react";

/**
 * Breakpoints based on user requirements:
 * Mobile: < 768px
 * Tablet: 768px - 1023px
 * Desktop: >= 1024px
 * Desktop XL: >= 1280px (MacBook Pro 14", 1440p, etc.)
 */

export type DeviceType = "mobile" | "tablet" | "desktop";

export function useBreakpoint() {
  const [deviceType, setDeviceType] = useState<DeviceType>(() => {
    if (typeof window === "undefined") return "desktop";
    const width = window.innerWidth;
    if (width < 768) return "mobile";
    if (width < 1024) return "tablet";
    return "desktop";
  });

  const [isXL, setIsXL] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1280;
  });

  const [isMac, setIsMac] = useState(() => {
    if (typeof window === "undefined") return false;
    return /Mac|Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent);
  });

  const [isMacBook, setIsMacBook] = useState(() => {
    if (typeof window === "undefined") return false;
    const isMacOs = /Mac|Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent);
    const width = window.innerWidth;
    return isMacOs && width >= 1024 && width <= 1536;
  });

  useEffect(() => {
    if (typeof document !== "undefined" && isMac) {
      document.documentElement.classList.add("is-mac");
      if (isMacBook) {
        document.documentElement.classList.add("is-macbook");
      }
    }
  }, [isMac, isMacBook]);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setDeviceType("mobile");
      } else if (width < 1024) {
        setDeviceType("tablet");
      } else {
        setDeviceType("desktop");
      }
      setIsXL(width >= 1280);

      const isMacOs = /Mac|Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent);
      setIsMac(isMacOs);
      setIsMacBook(isMacOs && width >= 1024 && width <= 1536);
    };

    window.addEventListener("resize", handleResize);
    // Initial check
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return {
    deviceType,
    isMobile: deviceType === "mobile",
    isTablet: deviceType === "tablet",
    isDesktop: deviceType === "desktop",
    isXL, // >= 1280px (MacBook Pro 14", 1440p+)
    isMac,
    isMacBook,
    isSmallerThanDesktop: deviceType !== "desktop",
  };
}

