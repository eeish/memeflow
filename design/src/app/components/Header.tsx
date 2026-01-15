import { Bell } from 'lucide-react';

interface HeaderProps {
  walletAddress: string;
  onProfileClick: () => void;
  onNotificationsClick: () => void;
}

export function Header({ walletAddress, onProfileClick, onNotificationsClick }: HeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg tracking-tight text-gray-900">Cord</h1>
        
        <div className="flex items-center gap-3">
          <button
            onClick={onNotificationsClick}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5 text-gray-600" />
          </button>
          
          <button
            onClick={onProfileClick}
            className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400" />
            <span className="font-mono text-sm text-gray-900">{walletAddress}</span>
          </button>
        </div>
      </div>
    </header>
  );
}