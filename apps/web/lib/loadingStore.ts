type LoadingListener = (loading: boolean) => void;

class LoadingStore {
  isLoading = false;
  private listeners = new Set<LoadingListener>();

  subscribe(listener: LoadingListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setLoading(loading: boolean): void {
    if (this.isLoading === loading) return;
    this.isLoading = loading;
    for (const listener of this.listeners) {
      listener(loading);
    }
  }
}

export const loadingStore = new LoadingStore();
