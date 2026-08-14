export const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "😡"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const REACTION_EMOJI_ASSETS: Record<
  ReactionEmoji,
  { src: string; label: string }
> = {
  "❤️": { src: "/emojis/heart.png", label: "Heart" },
  "👍": {
    src: "/emojis/Thumbs_Up_Sign_Emoji_Icon_ios10_large.webp",
    label: "Thumbs up",
  },
  "😂": { src: "/emojis/haha.webp", label: "Laughing" },
  "😮": {
    src: "/emojis/Flushed_Emoji_Icon_5e6ce936-4add-472b-96ba-9082998adcf7_large.webp",
    label: "Surprised",
  },
  "😢": { src: "/emojis/sob.png", label: "Crying" },
  "😡": { src: "/emojis/rage.png", label: "Rage" },
};

export function getReactionAsset(emoji: string) {
  return REACTION_EMOJI_ASSETS[emoji as ReactionEmoji] ?? null;
}
