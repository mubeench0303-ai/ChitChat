import axios, { isAxiosError, type AxiosRequestConfig } from "axios";

import { ApiError } from "@/lib/api/errors";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

function extractErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data;

    if (data && typeof data === "object") {
      const body = data as Record<string, unknown>;

      if (typeof body.message === "string" && body.message.trim()) {
        return body.message;
      }

      if (typeof body.error === "string" && body.error.trim()) {
        return body.error;
      }
    }
  }

  return "Something went wrong";
}

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    return Promise.reject(new ApiError(extractErrorMessage(error), status));
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
