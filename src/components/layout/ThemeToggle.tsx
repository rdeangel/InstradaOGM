"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Theme Toggle Component
 * 
 * Current Implementation: Cycle through all modes
 * - Light → Dark → System → Light
 * - Shows appropriate icon for each mode (Sun, Moon, Monitor)
 * - Tooltip shows current mode and next mode
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const cycleTheme = () => {
    switch (theme) {
      case "light":
        setTheme("dark");
        break;
      case "dark":
        setTheme("system");
        break;
      case "system":
      default:
        setTheme("light");
        break;
    }
  };

  const getNextTheme = () => {
    switch (theme) {
      case "light":
        return "dark";
      case "dark":
        return "system";
      case "system":
      default:
        return "light";
    }
  };

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <Sun className="h-[1.2rem] w-[1.2rem]" />;
      case "dark":
        return <Moon className="h-[1.2rem] w-[1.2rem]" />;
      case "system":
      default:
        return <Monitor className="h-[1.2rem] w-[1.2rem]" />;
    }
  };

  const getTooltipText = () => {
    const currentTheme = theme === "system" ? "System" : theme === "light" ? "Light" : "Dark";
    const nextTheme = getNextTheme() === "system" ? "System" : getNextTheme() === "light" ? "Light" : "Dark";
    return `${currentTheme} mode • Click for ${nextTheme}`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={cycleTheme}
            aria-label={`Switch to ${getNextTheme()} mode`}
          >
            {getThemeIcon()}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}