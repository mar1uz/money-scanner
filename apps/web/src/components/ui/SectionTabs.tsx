import React from 'react';
import type { AppTab } from '../../types.js';
import { useLanguage } from '../../i18n.js';
import {
  GROUP_LABELS,
  GROUP_SECTION_TABS,
  NAV_GROUP_OF,
  SECTION_PARENT,
  TAB_LABELS,
} from '../../navigation.js';
import { Segmented } from './Segmented.js';

interface SectionTabsProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onPrefetchTab?: (tab: AppTab) => void;
}

export const SectionTabs: React.FC<SectionTabsProps> = ({ activeTab, onTabChange, onPrefetchTab }) => {
  const { language } = useLanguage();
  const group = NAV_GROUP_OF[activeTab];
  const tabs = GROUP_SECTION_TABS[group];
  if (tabs.length < 2) return null;

  return (
    <div className="mb-6">
      <Segmented
        ariaLabel={GROUP_LABELS[group][language]}
        scrollable
        skipTranslate
        options={tabs.map((tab) => ({ value: tab, label: TAB_LABELS[tab][language] }))}
        value={SECTION_PARENT[activeTab] ?? activeTab}
        onChange={onTabChange}
        onItemPointerEnter={onPrefetchTab}
      />
    </div>
  );
};
