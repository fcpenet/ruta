import { request } from './api';

export interface User {
  id: string;
  username: string;
}

export interface Session {
  token: string;
  user: User;
}

const credentials = (username: string, password: string) =>
  JSON.stringify({ username: username.trim(), password });

export function signUp(username: string, password: string): Promise<Session> {
  return request<Session>('/auth/signup', { method: 'POST', body: credentials(username, password) });
}

export function logIn(username: string, password: string): Promise<Session> {
  return request<Session>('/auth/login', { method: 'POST', body: credentials(username, password) });
}

export async function logOut(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

export async function fetchMe(): Promise<User> {
  const { user } = await request<{ user: User }>('/auth/me');
  return user;
}
