import type { Rich } from '@/i18n';

import { ThemedText, type ThemedTextProps } from './themed-text';

/** Renders translated text whose `{ b }` parts are bold. */
export function RichText({ parts, ...props }: { parts: Rich } & ThemedTextProps) {
  return (
    <ThemedText {...props}>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <ThemedText key={i} type="smallBold">
            {p.b}
          </ThemedText>
        )
      )}
    </ThemedText>
  );
}
