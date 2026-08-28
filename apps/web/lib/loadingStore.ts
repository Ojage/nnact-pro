type LoadingListener = (loading: boolean) => void;

/** Delay before showing the top progress bar — skips flicker on fast/cached navigations. */
const SHOW_DELAY_MS = 180;

class LoadingStore {
  isLoading = false;
  private count = 0;
  private listeners = new Set<LoadingListener>();
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(listener: LoadingListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setLoading(loading: boolean): void {
    if (this.isLoading === loading) return;
    this.isLoading = loading;
    for (const listener of this.listeners) {
      listener(loading);
    }
  }

  private scheduleShow(): void {
    if (this.showTimer || this.isLoading) return;
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      if (this.count > 0) this.setLoading(true);
    }, SHOW_DELAY_MS);
  }

  private cancelShow(): void {
    if (!this.showTimer) return;
    clearTimeout(this.showTimer);
    this.showTimer = null;
  }

  /** Marks one in-flight request as started (ref-counted). */
  begin(): void {
    this.count += 1;
    this.scheduleShow();
  }

  /** Marks one in-flight request as finished (ref-counted). */
  end(): void {
    this.count = Math.max(0, this.count - 1);
    if (this.count === 0) {
      this.cancelShow();
      this.setLoading(false);
    }
  }

  /** Force-resets the counter (e.g. on auth failures). */
  reset(): void {
    this.count = 0;
    this.cancelShow();
    this.setLoading(false);
  }
}

export const loadingStore = new LoadingStore();
