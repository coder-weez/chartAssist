// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

// caOnPage / caActive stop a page script's persisted click handlers from acting
// after EMSCharts swaps page content via history navigation (no full reload) —
// e.g. the user has moved to pagept.cfm but page2's toolbar is still bound.
// caActive additionally gates on a valid login session (see the auth gate).
let caOnPage, caActive, caSetSession;
beforeAll(() => {
    const mod = require('../src/jquery.min.js');
    global.jQuery = global.$ = mod.default || mod;
    const ca = require('../src/chartassist.js').default || require('../src/chartassist.js');
    caOnPage = ca.caOnPage;
    caActive = ca.caActive;
    caSetSession = ca.caSetSession;
});

afterEach(() => {
    delete global.chrome;
    caSetSession(null);
    window.history.pushState({}, '', '/');
});

function at(path) {
    window.history.pushState({}, '', path);
}

// A session valid one hour from now.
function liveSession() {
    return { session_expires_at: Date.now() + 3600 * 1000 };
}

describe('caOnPage', () => {
    it('matches the page it targets', () => {
        at('/pr/page2.cfm?prid=123');
        expect(caOnPage(2)).toBe(true);
    });

    it('does not match a different page', () => {
        at('/pr/page2.cfm?prid=123');
        expect(caOnPage(3)).toBe(false);
    });

    it('does not match the patient page (pagept.cfm)', () => {
        at('/pr/pagept.cfm?prid=108094488');
        expect(caOnPage(2)).toBe(false);
    });

    it('is case-insensitive on the path', () => {
        at('/PR/Page4.CFM');
        expect(caOnPage(4)).toBe(true);
    });

    it('page1 does not match a would-be page10/pagept (requires .cfm after the number)', () => {
        at('/pr/pagept.cfm');
        expect(caOnPage(1)).toBe(false);
    });
});

describe('caActive', () => {
    it('is false when the extension context is invalidated (no runtime.id)', () => {
        at('/pr/page2.cfm');
        caSetSession(liveSession());
        global.chrome = { runtime: {} }; // reloaded: id is gone
        expect(caActive(2)).toBe(false);
    });

    it('requires a valid login session, even on the target page', () => {
        global.chrome = { runtime: { id: 'abc' } };
        at('/pr/page2.cfm');
        caSetSession(null);
        expect(caActive(2)).toBe(false);
        caSetSession({ session_expires_at: Date.now() - 1000 }); // expired
        expect(caActive(2)).toBe(false);
    });

    it('is true only when context is valid AND on the target page AND signed in', () => {
        global.chrome = { runtime: { id: 'abc' } };
        caSetSession(liveSession());
        at('/pr/page2.cfm');
        expect(caActive(2)).toBe(true);
        at('/pr/pagept.cfm');
        expect(caActive(2)).toBe(false);
    });
});
