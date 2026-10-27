import { getItem, setItem } from './storage';

/** Saved login (token + user), kept in secure storage on phones. */

const KEY = 'ruta.session';

export const readSession = () => getItem(KEY);
export const writeSession = (value: string | null) => setItem(KEY, value);
