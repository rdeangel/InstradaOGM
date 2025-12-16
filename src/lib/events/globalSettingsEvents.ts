// Simple event emitter for global settings updates
class GlobalSettingsEventEmitter {
  private listeners: (() => void)[] = [];

  subscribe(callback: () => void) {
    this.listeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  emit() {
    this.listeners.forEach(callback => callback());
  }
}

export const globalSettingsEvents = new GlobalSettingsEventEmitter();
