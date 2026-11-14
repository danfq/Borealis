/**
 * hide whatsapp's prompts to install its desktop app
 *
 * whatsapp shows them whenever it believes the os can run the app, which it
 * assumes for every safari, so its os checks are made to always say no
 */
(() => {
  /**
   * module holding the os checks
   */
  const MODULE = "WAWebDesktopUpsellUtils";

  /**
   * checks deciding whether the prompts show up
   */
  const CHECKS = [
    "isWebUserOnSupportedMacOSForCatalystAsync",
    "isWebUserOnSupportedWindowsOSForUWPAsync",
  ];

  /**
   * turn the os checks off once the module filled in its exports
   *
   * @param factory module factory
   *
   * @returns {Function} patched factory
   */
  const patch = (factory) => {
    const patched = function (...args) {
      const result = factory.apply(this, args);

      for (const exports of args) {
        if (exports === null || typeof exports !== "object") continue;
        if (!(CHECKS[0] in exports)) continue;

        for (const check of CHECKS) exports[check] = async () => false;
      }

      return result;
    };

    // the loader passes arguments based on how many the factory declares
    Object.defineProperty(patched, "length", { value: factory.length });

    return patched;
  };

  /**
   * module definer set by whatsapp's loader
   */
  let define;

  Object.defineProperty(window, "__d", {
    configurable: true,
    get: () => define,
    set: (value) => {
      if (typeof value !== "function") {
        define = value;
        return;
      }

      define = function (name, deps, factory, ...rest) {
        const target = name === MODULE && typeof factory === "function";

        return value.call(
          this,
          name,
          deps,
          target ? patch(factory) : factory,
          ...rest,
        );
      };
    },
  });
})();
