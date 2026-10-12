/** Emoji reactions AUXees can drop on a request (shared by client and server). */
export const REACTIONS = ['🔥', '🙌', '💪', '❤️', '‼️', '🌍', '😱', '⚡', '👌', '🙏'] as const;
export type Reaction = (typeof REACTIONS)[number];
