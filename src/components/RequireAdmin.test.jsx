import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireAdmin from './RequireAdmin';

const mockState = { profile: null, dataLoading: false, dataError: null };
vi.mock('../store/useStore', () => ({
  useStore: (selector) => selector(mockState),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

async function renderAt(path) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard" element={<div>dashboard-home</div>} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <div>admin-panel</div>
              </RequireAdmin>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  });
}

async function cleanup() {
  if (root) await act(async () => { root.unmount(); });
  container?.remove();
  root = null;
  container = null;
}

describe('RequireAdmin', () => {
  beforeEach(() => {
    mockState.profile = null;
    mockState.dataLoading = false;
    mockState.dataError = null;
  });

  it('renders a loading placeholder instead of redirecting while data is loading', async () => {
    mockState.dataLoading = true;
    mockState.dataError = null;
    try {
      await renderAt('/admin');
      expect(container.textContent).toContain('Loading admin access');
      expect(container.textContent).not.toContain('admin-panel');
      expect(container.textContent).not.toContain('dashboard-home');
    } finally {
      await cleanup();
    }
  });

  it('renders an error placeholder instead of admin content when data fails to load', async () => {
    mockState.dataLoading = false;
    mockState.dataError = 'Failed to load profile';
    mockState.profile = { isAdmin: false };
    try {
      await renderAt('/admin');
      expect(container.textContent).toContain("Couldn't load admin access");
      expect(container.textContent).not.toContain('admin-panel');
    } finally {
      await cleanup();
    }
  });

  it('redirects non-admin users to /dashboard', async () => {
    mockState.profile = { isAdmin: false };
    try {
      await renderAt('/admin');
      expect(container.textContent).toContain('dashboard-home');
      expect(container.textContent).not.toContain('admin-panel');
    } finally {
      await cleanup();
    }
  });

  it('renders children for admin users', async () => {
    mockState.profile = { isAdmin: true };
    try {
      await renderAt('/admin');
      expect(container.textContent).toContain('admin-panel');
      expect(container.textContent).not.toContain('dashboard-home');
    } finally {
      await cleanup();
    }
  });
});
