import { findAuthoredElement } from "./authored-element";

describe("findAuthoredElement", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finds an element the runtime gave a real id", () => {
    document.body.innerHTML = `<div id="plans">plans</div>`;
    expect(findAuthoredElement("plans")?.textContent).toBe("plans");
  });

  it("finds an authored container, which carries data-id and no id", () => {
    // The bug this exists for. A `scroll_to` action names a container by the
    // data-id the constructor assigned it, but ContainerRegistry spreads the
    // authored attributes straight through — so the rendered div has `data-id`
    // and no `id`, and `getElementById` returns null. The action then did
    // nothing at all, silently: no scroll, no error, on every published page.
    document.body.innerHTML = `<div data-id="08b72b94-d39d-4339-b365-8c4cdbd46d38">plans</div>`;
    expect(
      findAuthoredElement("08b72b94-d39d-4339-b365-8c4cdbd46d38")?.textContent,
    ).toBe("plans");
  });

  it("prefers the id over a data-id on a different element", () => {
    // Some components do set `id` from their data-id — the component-ref
    // wrapper here, ProgressBar in sart-funnel. Where both exist the id is the
    // element the author is naming.
    document.body.innerHTML = `
      <div data-id="dup">by-data-id</div>
      <div id="dup">by-id</div>
    `;
    expect(findAuthoredElement("dup")?.textContent).toBe("by-id");
  });

  it("takes the first match when a data-id repeats", () => {
    // Ids are meant to be unique and authored content does not always oblige;
    // document order is the only answer that is not arbitrary.
    document.body.innerHTML = `
      <div data-id="twice">first</div>
      <div data-id="twice">second</div>
    `;
    expect(findAuthoredElement("twice")?.textContent).toBe("first");
  });

  it("prefers the active page over a hidden preloaded page carrying the same id", () => {
    // The clone-page bug. BuilderClient keeps neighbour pages mounted
    // (display:none) for preloading, and a duplicated page carries the source
    // page's container ids verbatim. Document order put the hidden twin first,
    // so scroll_to resolved to an element scrollIntoView cannot reach — the
    // Get Started button "did nothing". The active page is marked and must win
    // regardless of DOM order.
    document.body.innerHTML = `
      <div style="display: none" data-bevr-page-id="1">
        <div data-id="cta">hidden twin</div>
      </div>
      <div data-bevr-active-page="true" data-bevr-page-id="2">
        <div data-id="cta">active</div>
      </div>
    `;
    expect(findAuthoredElement("cta")?.textContent).toBe("active");
  });

  it("prefers an open dialog over the active page", () => {
    // Dialogs and drawers portal outside the page wrapper and render on top of
    // it; while one is open, an action naming an id that exists in both is
    // acting on the visible surface — the dialog.
    document.body.innerHTML = `
      <div data-bevr-active-page="true">
        <div data-id="cta">page</div>
      </div>
      <div data-bevr-active-dialog="true">
        <div data-id="cta">dialog</div>
      </div>
    `;
    expect(findAuthoredElement("cta")?.textContent).toBe("dialog");
  });

  it("still prefers id over data-id within the active scope", () => {
    document.body.innerHTML = `
      <div data-bevr-active-page="true">
        <div data-id="dup">by-data-id</div>
        <div id="dup">by-id</div>
      </div>
    `;
    expect(findAuthoredElement("dup")?.textContent).toBe("by-id");
  });

  it("falls back to the whole document when the active page misses the id", () => {
    // The target may legitimately live outside the page wrapper (host chrome,
    // content rendered without the markers). Scoping narrows, it must not lose
    // elements the old document-wide search found.
    document.body.innerHTML = `
      <div data-bevr-active-page="true"><div data-id="other"></div></div>
      <div data-id="outside">outside</div>
    `;
    expect(findAuthoredElement("outside")?.textContent).toBe("outside");
  });

  it("returns null for an id nothing on the page carries", () => {
    document.body.innerHTML = `<div data-id="present"></div>`;
    expect(findAuthoredElement("absent")).toBeNull();
  });

  it("returns null rather than throwing on an id that is not a valid selector", () => {
    // Authored ids come from the constructor and are normally uuids, but a
    // quote or a bracket in one must not take the whole interaction down —
    // every action after it in the rule would stop running too.
    document.body.innerHTML = `<div data-id="ok"></div>`;
    expect(findAuthoredElement('bad"]:(')).toBeNull();
    expect(findAuthoredElement("")).toBeNull();
  });

  it("matches a data-id containing characters a selector must escape", () => {
    document.body.innerHTML = `<div data-id='say "hi"'>quoted</div>`;
    expect(findAuthoredElement('say "hi"')?.textContent).toBe("quoted");
  });
});
