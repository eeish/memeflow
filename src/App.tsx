import { useState } from 'react';
import { Bell } from 'lucide-react';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { NetworkProvider } from './contexts/NetworkContext';
import { Profile } from './components/Profile';
import { Notifications } from './components/Notifications';
import { Plaza } from './components/Plaza';
import { NotificationProvider } from './contexts/NotificationContext';
import { NotificationContainer } from './components/notifications/NotificationContainer';

// Main App Content Component
function AppContent() {
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { user } = useAuth();

  const handleProfileClick = () => {
    setShowProfile(true);
    setShowNotifications(false);
  };

  const handleNotificationsClick = () => {
    setShowNotifications(true);
    setShowProfile(false);
  };

  const handleBackToFeed = () => {
    setShowProfile(false);
    setShowNotifications(false);
  };

  // Show profile or notifications view
  if (showProfile) {
    return <Profile user={user} onClose={handleBackToFeed} />;
  }

  if (showNotifications) {
    return <Notifications user={user} onClose={handleBackToFeed} />;
  }

  // Main feed view
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg tracking-tight text-gray-900">Cord</h1>

          <div className="flex items-center gap-3">
            <button
              onClick={handleNotificationsClick}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-gray-600" />
            </button>

            <button
              onClick={handleProfileClick}
              className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-600" />
              <span className="font-mono text-sm text-black font-medium">
                {user?.sui_address ? `${user.sui_address.slice(0, 6)}...${user.sui_address.slice(-4)}` : '@' + user?.username}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Feed */}
      <Plaza user={user} />
    </div>
  );
}

// Root App Component with Providers
function App() {
  return (
    <NetworkProvider>
      <AuthProvider>
        <NotificationProvider>
          <NotificationContainer />
          <AppContent />
        </NotificationProvider>
      </AuthProvider>
    </NetworkProvider>
  );
}

export default App;
