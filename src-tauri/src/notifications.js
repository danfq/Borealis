/**
 * notification api backed by the app
 *
 * wkwebview denies notifications without asking and never shows them, so the
 * page gets this replacement that asks and shows them through the app instead
 *
 * @param permission permission known when the session was created
 */
(permission) => {
  /**
   * message handler registered by the app
   */
  const HANDLER = "borealis";

  /**
   * event dispatched by the app when a notification is clicked
   */
  const CLICK = "borealis-notification-click";

  /**
   * permission api names for each notification permission
   */
  const STATES = { default: "prompt", granted: "granted", denied: "denied" };

  /**
   * notifications still on screen, keyed by id
   */
  const open = new Map();

  /**
   * send a message to the app
   *
   * @param message message body
   *
   * @returns {Promise<unknown>} reply
   */
  const post = (message) => {
    const handler = window.webkit?.messageHandlers?.[HANDLER];

    // the handler is registered right after the session is created
    if (!handler) return Promise.reject(new Error("app is not ready"));

    return handler.postMessage(JSON.stringify(message));
  };

  class Notification extends EventTarget {
    #id = crypto.randomUUID();

    onclick = null;
    onshow = null;
    onclose = null;
    onerror = null;

    static get permission() {
      return permission;
    }

    static get maxActions() {
      return 0;
    }

    /**
     * ask the app, which answers from the settings or prompts the user
     *
     * @param callback legacy callback
     *
     * @returns {Promise<string>} permission
     */
    static async requestPermission(callback) {
      permission = await post({ kind: "request" }).catch(() => permission);
      callback?.(permission);

      return permission;
    }

    static {
      window.addEventListener(CLICK, (event) =>
        open.get(event.detail)?.#fire("click"),
      );
    }

    constructor(title, options = {}) {
      super();

      this.title = String(title);
      this.body = options.body ?? "";
      this.tag = options.tag ?? "";
      this.icon = options.icon ?? "";
      this.data = options.data ?? null;
      this.silent = options.silent ?? null;
      this.dir = options.dir ?? "auto";
      this.lang = options.lang ?? "";
      this.requireInteraction = options.requireInteraction ?? false;

      if (permission !== "granted") {
        queueMicrotask(() => this.#fire("error"));
        return;
      }

      open.set(this.#id, this);

      post({
        kind: "show",
        id: this.#id,
        title: this.title,
        body: this.body,
        tag: this.tag,
        silent: Boolean(this.silent),
      }).then(
        () => this.#fire("show"),
        () => open.delete(this.#id) && this.#fire("error"),
      );
    }

    close() {
      if (!open.delete(this.#id)) return;

      post({ kind: "close", id: this.#id, tag: this.tag }).catch(() => {});
      this.#fire("close");
    }

    /**
     * dispatch an event and call the matching handler property
     *
     * @param type event type
     */
    #fire(type) {
      const event = new Event(type, { cancelable: type === "click" });

      this.dispatchEvent(event);
      this[`on${type}`]?.call(this, event);
    }
  }

  Object.defineProperty(window, "Notification", {
    value: Notification,
    writable: true,
    configurable: true,
  });

  // the permissions api would still report what webkit thinks
  const query = navigator.permissions?.query?.bind(navigator.permissions);

  if (query) {
    navigator.permissions.query = (descriptor) => {
      if (descriptor?.name !== "notifications") return query(descriptor);

      const status = Object.assign(new EventTarget(), {
        name: "notifications",
        onchange: null,
      });

      Object.defineProperty(status, "state", {
        get: () => STATES[permission],
      });

      return Promise.resolve(status);
    };
  }

  // settings may have changed since the session was created
  post({ kind: "state" }).then(
    (state) => (permission = state),
    () => {},
  );
};
