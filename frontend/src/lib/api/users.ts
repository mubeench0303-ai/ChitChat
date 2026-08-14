import api from "@/lib/axios";
import type { PublicProfile, UserSearchResult } from "@/types";

export function searchUsers(query: string): Promise<UserSearchResult[]> {
  return api.get<UserSearchResult[]>("/users/search", {
    params: { q: query },
  });
}

export function getPublicProfile(username: string): Promise<PublicProfile> {
  return api.get<PublicProfile>(`/users/${encodeURIComponent(username)}`);
}
