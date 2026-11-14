/**
 * search inside the session for the app's own search
 *
 * the app asks every session at once, each answers with what whatsapp's own
 * chat, contact and message search finds and can later open a result
 */
(() => {
  /**
   * matches kept per kind
   */
  const LIMIT = 20;

  /**
   * longest a part of the search may take, message search never settles
   * before the session finished loading
   */
  const TIMEOUT = 4000;

  /**
   * message types listed as files
   */
  const FILES = new Set(["document", "image", "video", "audio", "ptt"]);

  /**
   * what opens each result of the last search, by result id
   */
  const opened = new Map();

  /**
   * load a whatsapp module
   *
   * @param name module name
   *
   * @returns {any} module exports
   */
  const load = (name) => window.require(name);

  /**
   * reject a promise that takes too long
   *
   * @param promise promise to wait for
   *
   * @returns {Promise<any>} the promise, or a rejection after the timeout
   */
  const limit = (promise) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("search timed out")), TIMEOUT),
      ),
    ]);

  /**
   * chats and contacts matching the query
   *
   * @param query search text
   *
   * @returns {Promise<object[]>} results
   */
  const people = async (query) => {
    const { ChatSearch } = load("WAWebChatSearchModel");
    const { ContactSearch } = load("WAWebContactSearchModel");
    const { getFormattedTitle } = load("WAWebFrontendChatGetters");
    const { getFormattedName } = load("WAWebFrontendContactGetters");
    const { findOrCreateLatestChat } = load("WAWebFindChatAction");
    const { Cmd } = load("WAWebCmd");

    const options = { pagination: { page: 0, pageLength: LIMIT } };

    const chats = (await new ChatSearch().query(query, options)).results.map(
      ({ id, data: chat }) => ({
        id,
        kind: "chat",
        title: getFormattedTitle(chat),
        subtitle: "",
        open: () => Cmd.openChatBottom({ chat }),
      }),
    );

    // people with a chat already show up as that chat
    const listed = new Set(chats.map(({ id }) => id));

    const contacts = (await new ContactSearch().query(query, options)).results
      .filter(({ id }) => !listed.has(id))
      .map(({ id, data: contact }) => ({
        id,
        kind: "contact",
        title: getFormattedName(contact),
        subtitle: "",
        open: async () => {
          const { chat } = await findOrCreateLatestChat(
            contact.id,
            "newChatFlow",
          );

          Cmd.openChatBottom({ chat });
        },
      }));

    return [...chats, ...contacts];
  };

  /**
   * messages and files matching the query, newest first
   *
   * @param query search text
   *
   * @returns {Promise<object[]>} results
   */
  const messages = async (query) => {
    const { MsgCollection } = load("WAWebMsgCollection");
    const { ChatCollection } = load("WAWebChatCollection");
    const { getSearchContext } = load("WAWebChatMessageSearch");
    const { getFormattedTitle } = load("WAWebFrontendChatGetters");
    const { Cmd } = load("WAWebCmd");

    const { messages } = await MsgCollection.search(query, 1, LIMIT * 2);

    return messages.flatMap((msg) => {
      const chat = ChatCollection.get(msg.id.remote);

      if (!chat) return [];

      const file = FILES.has(msg.type);

      return [
        {
          id: msg.id.toString(),
          kind: file ? "file" : "message",
          title: getFormattedTitle(chat),
          subtitle: (file ? msg.filename || msg.caption : msg.body) || "",
          timestamp: msg.t ?? null,
          open: () =>
            Cmd.openChatAt({
              chat,
              msgContext: getSearchContext({ chat, msgKey: msg.id }),
            }),
        },
      ];
    });
  };

  /**
   * search the session and send the results to the app
   *
   * @param token search the results belong to
   * @param query search text
   */
  const search = async (token, query) => {
    opened.clear();

    // a session that isn't logged in yet has nothing to search
    const settled = query.trim()
      ? await Promise.allSettled([limit(people(query)), limit(messages(query))])
      : [];

    const results = settled
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .map(({ open, ...result }) => {
        opened.set(result.id, open);

        return result;
      });

    window.__TAURI_INTERNALS__?.invoke("search_results", { token, results });
  };

  /**
   * open a result of the last search
   *
   * @param id result id
   */
  const open = (id) => {
    Promise.resolve(opened.get(id)?.()).catch(() => {});
  };

  Object.defineProperty(window, "__borealisSearch", {
    value: Object.freeze({ search, open }),
  });
})();
