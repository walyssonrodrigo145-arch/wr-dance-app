import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "midnight" | "purple" | "emerald" | "mono" | "grafite";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    if (switchable) {
      localStorage.setItem("theme", newTheme);
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "theme-midnight", "theme-purple", "theme-emerald", "theme-mono", "theme-grafite");

    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "midnight") {
      root.classList.add("dark", "theme-midnight");
    } else if (theme === "purple") {
      root.classList.add("dark", "theme-purple");
    } else if (theme === "emerald") {
      root.classList.add("theme-emerald");
    } else if (theme === "mono") {
      root.classList.add("theme-mono");
    } else if (theme === "grafite") {
      root.classList.add("dark", "theme-grafite");
    }

    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setThemeState(prev => {
          const themes: Theme[] = ["light", "dark", "midnight", "purple", "emerald", "mono", "grafite"];
          const nextIndex = (themes.indexOf(prev) + 1) % themes.length;
          const next = themes[nextIndex];
          localStorage.setItem("theme", next);
          return next;
        });
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
