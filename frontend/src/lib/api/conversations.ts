import api from "@/lib/axios";

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export function sendMessageRequest(
  username: string,
  content: string
): Promise<Message> {
  return api.post<Message>("/messages/request", {
    username,
    content,
  });
}
