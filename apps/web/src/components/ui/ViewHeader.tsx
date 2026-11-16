import React from 'react';

interface ViewHeaderProps {
  title: React.ReactNode;
  badge?: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  as?: 'h1' | 'h2';
}

/** Compact page header: title, one-line subtitle, optional data line, actions on the right. */
export const ViewHeader: React.FC<ViewHeaderProps> = ({ title, badge, subtitle, meta, actions, as = 'h1' }) => {
  const Tag = as;
  return (
    <header className="ms-view-head">
      <div className="ms-view-head-text">
        <Tag className="ms-view-title">
          {title}
          {badge !== undefined && badge !== null && <span className="ms-badge">{badge}</span>}
        </Tag>
        {subtitle !== undefined && subtitle !== null && <p className="ms-view-sub">{subtitle}</p>}
        {meta}
      </div>
      {actions !== undefined && actions !== null && <div className="ms-view-actions">{actions}</div>}
    </header>
  );
};
