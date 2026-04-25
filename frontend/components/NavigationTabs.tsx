'use client';

interface NavigationTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function NavigationTabs({ activeTab, onTabChange }: NavigationTabsProps) {
  const tabs = [
    { id: 'local', label: 'Feed' },
    { id: 'mesh', label: 'Mesh' },
    { id: 'qr', label: 'QR Drops' },
    { id: 'direct', label: 'Direct' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <nav className="glass sticky top-0 z-40">
      <div className="flex px-4 sm:px-6 lg:px-8 gap-1 relative">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
            className={`px-6 py-4 text-xs font-bold transition-all relative z-10 cursor-pointer ${
              activeTab === tab.id
                ? 'text-cyan-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_15px_rgba(6,182,212,0.4)] rounded-full animate-in fade-in slide-in-from-bottom-1 duration-300" />
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
