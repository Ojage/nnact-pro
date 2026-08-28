type LoadingListener = (loading: boolean) => void;

class LoadingStore {
  isLoading = false;
  private count = 0;
  private listeners = new Set<LoadingListener>();

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

  /** Marks one in-flight request as started (ref-counted). */
  begin(): void {
    this.count += 1;
    this.setLoading(true);
  }

  /** Marks one in-flight request as finished (ref-counted). */
  end(): void {
    this.count = Math.max(0, this.count - 1);
    if (this.count === 0) this.setLoading(false);
  }

  /** Force-resets the counter (e.g. on auth failures). */
  reset(): void {
    this.count = 0;
    this.setLoading(false);
  }
}

export const loadingStore = new LoadingStore();
