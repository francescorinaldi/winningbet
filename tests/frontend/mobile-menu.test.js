/**
 * @jest-environment jsdom
 */

/* global document, window, KeyboardEvent, initMobileMenu */

/**
 * Tests for initMobileMenu() — iOS scroll lock pattern
 *
 * Verifies the 3 bug fixes from dce29f3:
 * 1. iOS scroll lock: position:fixed + top:-scrollY on open, restore on close
 * 2. Menu open/close toggle via hamburger button
 * 3. Menu closes on backdrop click, link click, and ESC key
 */

const fs = require('fs');
const path = require('path');

// Load shared.js source — it uses `var` declarations that become globals
const sharedSource = fs.readFileSync(path.join(__dirname, '../../public/shared.js'), 'utf8');

beforeEach(() => {
  // Reset DOM
  document.body.innerHTML = `
    <nav id="navbar">
      <div class="nav-links" id="navLinks">
        <a href="#tips">Tips</a>
        <a href="#pricing">Pricing</a>
        <a href="/auth.html" class="btn btn-outline btn-sm">Accedi</a>
      </div>
      <button class="hamburger" id="hamburger" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </nav>
  `;

  // Reset body styles
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.overflow = '';

  // Mock window.matchMedia (required by shared.js REDUCED_MOTION)
  window.matchMedia = jest.fn().mockReturnValue({ matches: false });

  // Mock window.scrollTo
  window.scrollTo = jest.fn();

  // Mock window.scrollY (default 0, overridable per test)
  Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });

  // Mock window.requestAnimationFrame (used by particle system, not relevant here)
  window.requestAnimationFrame = jest.fn();

  // Load shared.js into jsdom global scope — indirect eval (0, eval)
  // ensures `var` declarations become true globals
  (0, eval)(sharedSource);
});

afterEach(() => {
  // Remove any backdrop elements appended by initMobileMenu
  document.querySelectorAll('.nav-backdrop').forEach((el) => el.remove());
});

describe('initMobileMenu — iOS scroll lock pattern', () => {
  it('creates a backdrop overlay element', () => {
    initMobileMenu();
    const backdrop = document.querySelector('.nav-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
  });

  it('sets initial aria state on hamburger', () => {
    initMobileMenu();
    const hamburger = document.getElementById('hamburger');
    expect(hamburger.getAttribute('aria-expanded')).toBe('false');
    expect(hamburger.getAttribute('aria-controls')).toBe('navLinks');
  });

  it('opens menu on hamburger click — applies iOS scroll lock', () => {
    // Simulate user scrolled down 500px
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });

    initMobileMenu();
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    const backdrop = document.querySelector('.nav-backdrop');

    hamburger.click();

    // Menu should be open
    expect(hamburger.classList.contains('active')).toBe(true);
    expect(hamburger.getAttribute('aria-expanded')).toBe('true');
    expect(navLinks.classList.contains('open')).toBe(true);
    expect(backdrop.classList.contains('open')).toBe(true);

    // iOS scroll lock: body should be fixed at -scrollY
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-500px');
    expect(document.body.style.width).toBe('100%');
  });

  it('closes menu on second hamburger click — restores scroll position', () => {
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true });

    initMobileMenu();
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    const backdrop = document.querySelector('.nav-backdrop');

    // Open
    hamburger.click();
    expect(navLinks.classList.contains('open')).toBe(true);

    // Close
    hamburger.click();

    // Menu should be closed
    expect(hamburger.classList.contains('active')).toBe(false);
    expect(hamburger.getAttribute('aria-expanded')).toBe('false');
    expect(navLinks.classList.contains('open')).toBe(false);
    expect(backdrop.classList.contains('open')).toBe(false);

    // iOS scroll lock removed — body styles cleared
    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.width).toBe('');
    expect(document.body.style.overflow).toBe('');

    // Scroll position restored to where user was before opening
    expect(window.scrollTo).toHaveBeenCalledWith(0, 300);
  });

  it('closes menu on backdrop click — restores scroll position', () => {
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });

    initMobileMenu();
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    const backdrop = document.querySelector('.nav-backdrop');

    // Open menu
    hamburger.click();
    expect(navLinks.classList.contains('open')).toBe(true);

    // Click backdrop
    backdrop.click();

    // Menu should be closed
    expect(navLinks.classList.contains('open')).toBe(false);
    expect(document.body.style.position).toBe('');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 200);
  });

  it('closes menu on ESC key — restores scroll position', () => {
    Object.defineProperty(window, 'scrollY', { value: 150, configurable: true });

    initMobileMenu();
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');

    // Open menu
    hamburger.click();
    expect(navLinks.classList.contains('open')).toBe(true);

    // Press ESC
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    // Menu should be closed
    expect(navLinks.classList.contains('open')).toBe(false);
    expect(document.body.style.position).toBe('');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 150);
  });

  it('closes menu on nav link click — restores scroll position', () => {
    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });

    initMobileMenu();
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');

    // Open menu
    hamburger.click();
    expect(navLinks.classList.contains('open')).toBe(true);

    // Click a nav link
    const link = navLinks.querySelector('a');
    link.click();

    // Menu should be closed
    expect(navLinks.classList.contains('open')).toBe(false);
    expect(document.body.style.position).toBe('');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 400);
  });

  it('does nothing when hamburger or navLinks elements are missing', () => {
    document.body.innerHTML = '';
    expect(() => initMobileMenu()).not.toThrow();
  });

  it('ESC key does nothing when menu is already closed', () => {
    initMobileMenu();
    const navLinks = document.getElementById('navLinks');
    expect(navLinks.classList.contains('open')).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    // Nothing should change
    expect(navLinks.classList.contains('open')).toBe(false);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('preserves scroll position through multiple open/close cycles', () => {
    initMobileMenu();
    const hamburger = document.getElementById('hamburger');

    // First cycle at scrollY=100
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });
    hamburger.click(); // open
    expect(document.body.style.top).toBe('-100px');
    hamburger.click(); // close
    expect(window.scrollTo).toHaveBeenCalledWith(0, 100);

    // Second cycle at scrollY=700
    Object.defineProperty(window, 'scrollY', { value: 700, configurable: true });
    hamburger.click(); // open
    expect(document.body.style.top).toBe('-700px');
    hamburger.click(); // close
    expect(window.scrollTo).toHaveBeenCalledWith(0, 700);
  });
});

describe('CSS mobile nav link color fix', () => {
  it('styles.css has color: #ffffff for .nav-links a:not(.btn) in mobile media query', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../public/styles.css'), 'utf8');

    // Find the mobile media query section with .nav-links a:not(.btn)
    const mobileNavLinkRule = /\.nav-links\s+a:not\(\.btn\)\s*\{[^}]*color:\s*#ffffff/;
    expect(css).toMatch(mobileNavLinkRule);
  });
});

describe('script.js anchor scroll setTimeout fix', () => {
  it('script.js wraps scrollTo in setTimeout for iOS position:fixed teardown', () => {
    const scriptSource = fs.readFileSync(path.join(__dirname, '../../public/script.js'), 'utf8');

    // Verify the setTimeout wrapper exists around scrollTo for anchor links
    expect(scriptSource).toContain('setTimeout(function');
    expect(scriptSource).toContain('getBoundingClientRect');
    expect(scriptSource).toContain("behavior: 'smooth'");
  });
});
