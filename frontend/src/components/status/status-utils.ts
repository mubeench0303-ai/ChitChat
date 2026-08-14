export const STATUS_DURATION_MS = 10000;

export const STATUS_BG_SWATCHES = [
  { id: "coral", value: "#ff404f" },
  { id: "violet", value: "#7c3aed" },
  { id: "ocean", value: "#0ea5e9" },
  { id: "forest", value: "#059669" },
  { id: "sunset", value: "#ea580c" },
  { id: "slate", value: "#475569" },
] as const;

export type StatusBackgroundColor = (typeof STATUS_BG_SWATCHES)[number]["value"];

export function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatStatusTimeAgo(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatStatusTimestamp(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getLatestStatusTimestamp(statuses: { createdAt: string }[]) {
  if (statuses.length === 0) {
    return "";
  }

  const latest = statuses.reduce((current, item) =>
    new Date(item.createdAt).getTime() > new Date(current.createdAt).getTime()
      ? item
      : current
  );

  return formatStatusTimeAgo(latest.createdAt);
}

export function isFeedEntryFullyViewed(
  statuses: { id: string }[],
  viewedStatusIds: Set<string>
) {
  if (statuses.length === 0) {
    return true;
  }

  return statuses.every((status) => viewedStatusIds.has(status.id));
}
