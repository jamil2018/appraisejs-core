import { TemplateStepIcon } from "@prisma/client";
import {
  ALargeSmall,
  BugPlay,
  Database,
  Download,
  Globe,
  Keyboard,
  MousePointerClick,
  Save,
  Server,
  Upload,
  Loader,
  CheckCheck,
  LucideIcon,
} from "lucide-react";
import { ReactElement } from "react";

export const KeyToIconTransformer = (key: TemplateStepIcon) => {
  switch (key) {
    case "MOUSE":
      return <MousePointerClick />;
    case "NAVIGATION":
      return <Globe />;
    case "INPUT":
      return <Keyboard />;
    case "DOWNLOAD":
      return <Download />;
    case "API":
      return <Server />;
    case "STORE":
      return <Save />;
    case "FORMAT":
      return <ALargeSmall />;
    case "DATA":
      return <Database />;
    case "UPLOAD":
      return <Upload />;
    case "WAIT":
      return <Loader />;
    case "VALIDATION":
      return <CheckCheck />;
    case "DEBUG":
      return <BugPlay />;
  }
};

// Map of component types to TemplateStepIcon values
const componentToIconMap = new Map<LucideIcon, TemplateStepIcon>([
  [MousePointerClick, "MOUSE"],
  [Globe, "NAVIGATION"],
  [Keyboard, "INPUT"],
  [Download, "DOWNLOAD"],
  [Server, "API"],
  [Save, "STORE"],
  [ALargeSmall, "FORMAT"],
  [Database, "DATA"],
  [Upload, "UPLOAD"],
  [Loader, "WAIT"],
  [CheckCheck, "VALIDATION"],
  [BugPlay, "DEBUG"],
]);

// Map of string values to TemplateStepIcon values
const stringToIconMap = new Map<string, TemplateStepIcon>([
  ["MOUSE", "MOUSE"],
  ["NAVIGATION", "NAVIGATION"],
  ["INPUT", "INPUT"],
  ["DOWNLOAD", "DOWNLOAD"],
  ["API", "API"],
  ["STORE", "STORE"],
  ["FORMAT", "FORMAT"],
  ["DATA", "DATA"],
  ["UPLOAD", "UPLOAD"],
  ["WAIT", "WAIT"],
  ["VALIDATION", "VALIDATION"],
  ["DEBUG", "DEBUG"],
]);

export const IconToKeyTransformer = (
  icon: React.ReactNode | string
): TemplateStepIcon | undefined => {
  // Handle string input
  if (typeof icon === "string") {
    return stringToIconMap.get(icon);
  }

  // Handle React component input
  if (!icon || typeof icon !== "object") return undefined;

  // Get the component type from the React element
  const componentType = (icon as ReactElement)?.type;
  if (!componentType) return undefined;

  // Look up the icon in our map
  return componentToIconMap.get(componentType as LucideIcon);
};
