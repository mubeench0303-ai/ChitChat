import axios, { isAxiosError, type AxiosRequestConfig } from "axios";

import { ApiError } from "@/lib/api/errors";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

function extractErrorDetails(error: unknown): { message: string; code?: string } {
  if (isAxiosError(error)) {
    const data = error.response?.data;

    if (data && typeof data === "object") {
      const body = data as Record<string, unknown>;
      const code =
        typeof body.code === "string" && body.code.trim()
          ? body.code.trim()
          : undefined;

      if (typeof body.message === "string" && body.message.trim()) {
        return { message: body.message, code };
      }

      if (typeof body.error === "string" && body.error.trim()) {
        return { message: body.error, code };
      }
    }
  }

  return { message: "Something went wrong" };
}

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    const { message, code } = extractErrorDetails(error);
    return Promise.reject(new ApiError(message, status, code));
  }
);

export interface ApiInstance {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T>;
  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T>;
  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
}

export default api as ApiInstance;
