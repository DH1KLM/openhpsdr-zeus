// SPDX-License-Identifier: GPL-2.0-or-later
//
// Zeus — OpenHPSDR Protocol-1 / Protocol-2 client.
// Copyright (C) 2025-2026 Brian Keating (EI6LF),
//                         Douglas J. Cerrato (KB2UKA), and contributors.
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the
// Free Software Foundation, either version 2 of the License, or (at your
// option) any later version. See the LICENSE file at the root of this
// repository for the full text, or https://www.gnu.org/licenses/.

import { useState } from 'react';
import { useLayoutCollectionStore } from '../state/layout-collection-store';

export function LayoutBar() {
  const layouts = useLayoutCollectionStore((s) => s.layouts);
  const activeLayoutId = useLayoutCollectionStore((s) => s.activeLayoutId);
  const setActiveLayout = useLayoutCollectionStore((s) => s.setActiveLayout);
  const addLayout = useLayoutCollectionStore((s) => s.addLayout);
  const deleteLayout = useLayoutCollectionStore((s) => s.deleteLayout);
  const resetActiveLayout = useLayoutCollectionStore((s) => s.resetActiveLayout);
  const renameLayout = useLayoutCollectionStore((s) => s.renameLayout);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [newLayoutName, setNewLayoutName] = useState('');

  const handleAddLayout = () => {
    if (!newLayoutName.trim()) return;
    const id = addLayout(newLayoutName.trim());
    setActiveLayout(id);
    setNewLayoutName('');
    setAddModalOpen(false);
  };

  const handleRenameLayout = () => {
    if (!renameTargetId || !newLayoutName.trim()) return;
    renameLayout(renameTargetId, newLayoutName.trim());
    setNewLayoutName('');
    setRenameTargetId(null);
    setRenameModalOpen(false);
  };

  const handleDeleteLayout = (id: string) => {
    if (layouts.length <= 1) {
      alert('Cannot delete the last layout.');
      return;
    }
    if (confirm('Delete this layout? This action cannot be undone.')) {
      deleteLayout(id);
    }
  };

  const handleResetLayout = () => {
    if (confirm('Reset the active layout to default? All panels and positions will be lost.')) {
      resetActiveLayout();
    }
  };

  const openRenameModal = (id: string) => {
    const layout = layouts.find((l) => l.id === id);
    if (layout) {
      setRenameTargetId(id);
      setNewLayoutName(layout.name);
      setRenameModalOpen(true);
    }
  };

  return (
    <>
      <div className="layout-bar">
        <div className="layout-bar-header">
          <span className="layout-bar-title">LAYOUTS</span>
        </div>
        <div className="layout-bar-items">
          {layouts.map((layout) => {
            const isActive = layout.id === activeLayoutId;
            return (
              <div
                key={layout.id}
                className={`layout-bar-item ${isActive ? 'active' : ''}`}
              >
                <button
                  type="button"
                  className="layout-bar-item-btn"
                  onClick={() => setActiveLayout(layout.id)}
                  title={layout.name}
                >
                  <svg viewBox="0 0 16 16" className="layout-bar-icon" aria-hidden>
                    <rect x="2" y="2" width="5" height="5" rx="1" />
                    <rect x="9" y="2" width="5" height="5" rx="1" />
                    <rect x="2" y="9" width="5" height="5" rx="1" />
                    <rect x="9" y="9" width="5" height="5" rx="1" />
                  </svg>
                  <span className="layout-bar-item-name">{layout.name}</span>
                </button>
                <div className="layout-bar-item-actions">
                  <button
                    type="button"
                    className="layout-bar-action-btn"
                    onClick={() => openRenameModal(layout.id)}
                    title="Rename layout"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="layout-bar-action-btn"
                    onClick={() => handleDeleteLayout(layout.id)}
                    title="Delete layout"
                    disabled={layouts.length <= 1}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="layout-bar-footer">
          <button
            type="button"
            className="btn sm"
            onClick={() => setAddModalOpen(true)}
            title="Add new layout"
          >
            + Add
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={handleResetLayout}
            title="Reset active layout to default"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Add Layout Modal */}
      {addModalOpen && (
        <div className="modal-overlay" onClick={() => setAddModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Add New Layout</h3>
            <input
              type="text"
              value={newLayoutName}
              onChange={(e) => setNewLayoutName(e.target.value)}
              placeholder="Layout name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddLayout();
                }
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '12px',
                background: 'var(--bg-1)',
                border: '1px solid var(--line)',
                color: 'var(--fg-0)',
                borderRadius: 'var(--r-md)',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setNewLayoutName('');
                  setAddModalOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={handleAddLayout}
                disabled={!newLayoutName.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Layout Modal */}
      {renameModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setRenameModalOpen(false);
          setRenameTargetId(null);
          setNewLayoutName('');
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Rename Layout</h3>
            <input
              type="text"
              value={newLayoutName}
              onChange={(e) => setNewLayoutName(e.target.value)}
              placeholder="Layout name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleRenameLayout();
                }
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '12px',
                background: 'var(--bg-1)',
                border: '1px solid var(--line)',
                color: 'var(--fg-0)',
                borderRadius: 'var(--r-md)',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setNewLayoutName('');
                  setRenameTargetId(null);
                  setRenameModalOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={handleRenameLayout}
                disabled={!newLayoutName.trim()}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
