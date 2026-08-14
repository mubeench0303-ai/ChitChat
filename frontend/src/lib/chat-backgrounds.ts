import type { CSSProperties } from "react";

export type ChatBackgroundType = "default" | "preset" | "custom";

export interface ChatBackgroundPreset {
  id: string;
  label: string;
  src: string;
}

export const CHAT_BACKGROUND_PRESETS: ChatBackgroundPreset[] = [
  { id: "preset_1", label: "Sunset", src: "/chat-backgrounds/preset_1.svg" },
  { id: "preset_2", label: "Ocean", src: "/chat-backgrounds/preset_2.svg" },
  { id: "preset_3", label: "Forest", src: "/chat-backgrounds/preset_3.svg" },
  { id: "preset_4", label: "Dusk", src: "/chat-backgrounds/preset_4.svg" },
  { id: "preset_5", label: "Peach", src: "/chat-backgrounds/preset_5.svg" },
  { id: "preset_6", label: "Slate", src: "/chat-backgrounds/preset_6.svg" },
  { id: "preset_7", label: "Rose", src: "/chat-backgrounds/preset_7.svg" },
];

export function getChatBackgroundStyle(
  backgroundType?: ChatBackgroundType,
  backgroundValue?: string | null
): CSSProperties | undefined {
  if (!backgroundType || backgroundType === "default") {
    return undefined;
  }

  if (backgroundType === "preset" && backgroundValue) {
    const preset = CHAT_BACKGROUND_PRESETS.find(
      (item) => item.id === backgroundValue
    );
    if (!preset) {
      return undefined;
    }

    return {
      backgroundImage: `url(${preset.src})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  if (backgroundType === "custom" && backgroundValue) {
    return {
      backgroundImage: `url(${backgroundValue})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  return undefined;
}
