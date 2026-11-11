import {
  LayoutDashboard, Mic, Users, FileSpreadsheet, History, BarChart3, Sparkles, Settings2, LifeBuoy
} from 'lucide-react';

// One source of truth for the navigation. The sidebar, the mobile drawer, the
// top-bar title and the import that maps a URL to a page heading all read this,
// so no nav option can ever be defined twice.
export const NAV_GROUPS = [
  {
    title: 'Workspace',
    items: [
      { to: '/overview', label: 'Overview', icon: LayoutDashboard }
    ]
  },
  {
    title: 'Selling',
    items: [
      { to: '/agent', label: 'Voice Agent', icon: Mic },
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/import', label: 'Import Customers', icon: FileSpreadsheet }
    ]
  },
  {
    title: 'Insights',
    items: [
      { to: '/history', label: 'Call History', icon: History },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 }
    ]
  },
  {
    title: 'Configuration',
    items: [
      { to: '/ai-settings', label: 'AI Settings', icon: Sparkles },
      { to: '/profile', label: 'Profile & Settings', icon: Settings2 },
      { to: '/help', label: 'Help & Support', icon: LifeBuoy }
    ]
  }
];

export const NAV_ITEMS = NAV_GROUPS.flatMap(group => group.items);

const LONGEST_FIRST = [...NAV_ITEMS].sort((a, b) => b.to.length - a.to.length);

export function navForPath(pathname = '') {
  return LONGEST_FIRST.find(item => pathname === item.to || pathname.startsWith(`${item.to}/`));
}

export function pageTitle(pathname) {
  return navForPath(pathname)?.label || 'VoicePitch AI';
}
