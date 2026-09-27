import highsLoader from "highs";
import type { LegacyHighs } from "highs";

let loading: Promise<LegacyHighs> | null = null;

export function loadHighs(): Promise<LegacyHighs> {
  if (!loading) {
    loading = highsLoader().catch((error: unknown) => {
      loading = null;
      throw error;
    });
  }

  return loading;
}
