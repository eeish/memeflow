import { useState } from 'react';
import { Bell, ArrowLeft } from './components/ui-simple/Icons';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { NetworkProvider } from './contexts/NetworkContext';
import { Profile } from './components/Profile';
import { EditProfile } from './components/EditProfile';
import { Notifications } from './components/Notifications';
import { Plaza } from './components/Plaza';
import { UserProfilePage } from './components/UserProfilePage';
import { NotificationProvider } from './contexts/NotificationContext';
import { NotificationContainer } from './components/notifications/NotificationContainer';
import type { User } from './lib/api';
import type { FeedAuthor } from './components/feed/types';
import type { UserSummary } from './types/users';

// Main App Content Component
function AppContent() {
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState<UserSummary | null>(null);
  const { user, setUser, refreshUser } = useAuth();

  const handleProfileClick = () => {
    setShowProfile(true);
    setShowNotifications(false);
    setShowEditProfile(false);
  };

  const handleNotificationsClick = () => {
    setShowNotifications(true);
    setShowProfile(false);
    setShowEditProfile(false);
  };

  const handleBackToFeed = () => {
    setShowProfile(false);
    setShowNotifications(false);
    setShowEditProfile(false);
    setSelectedUserProfile(null);
  };

  // Handle navigation to a user's public profile from the feed
  const handleNavigateToUserProfile = (author: FeedAuthor) => {
    // Don't navigate if clicking on own profile - show own profile instead
    if (author.id === user?.id) {
      setShowProfile(true);
      return;
    }

    // Convert FeedAuthor to UserSummary
    const userSummary: UserSummary = {
      id: author.id || '',
      username: author.username,
      display_name: author.displayName || null,
      avatar_url: author.avatarUrl || null,
      token_symbol: author.tokenSymbol || author.username.toUpperCase(),
    };
    setSelectedUserProfile(userSummary);
    setShowProfile(false);
    setShowNotifications(false);
    setShowEditProfile(false);
  };

  const handleEditProfile = () => {
    setShowEditProfile(true);
    setShowProfile(false);
  };

  const handleEditProfileClose = () => {
    setShowEditProfile(false);
    setShowProfile(true);
  };

  const handleEditProfileSave = (updatedUser: User) => {
    // Update user in auth context
    setUser({ ...user, ...updatedUser });
    // Refresh to ensure consistency
    refreshUser?.();
    // Return to profile
    setShowEditProfile(false);
    setShowProfile(true);
  };

  // Show edit profile view
  if (showEditProfile && user) {
    return (
      <EditProfile
        user={user}
        onClose={handleEditProfileClose}
        onSave={handleEditProfileSave}
      />
    );
  }

  // Show profile or notifications view
  if (showProfile) {
    return (
      <Profile
        user={user}
        onClose={handleBackToFeed}
        onEditProfile={handleEditProfile}
      />
    );
  }

  if (showNotifications) {
    return <Notifications user={user} onClose={handleBackToFeed} />;
  }

  // Show public user profile page
  if (selectedUserProfile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center relative">
            <button
              onClick={handleBackToFeed}
              className="p-1.5 hover:bg-gray-100 rounded-full transition-colors absolute left-4"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <h1 className="text-lg tracking-tight text-gray-900 w-full text-center">Profile</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-6">
          <UserProfilePage user={selectedUserProfile} />
        </main>
      </div>
    );
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
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-600" />
              )}
              <span className="font-mono text-sm text-black font-medium">
                {user?.sui_address ? `${user.sui_address.slice(0, 6)}...${user.sui_address.slice(-4)}` : '@' + user?.username}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Feed */}
      <Plaza user={user} onNavigateToProfile={handleNavigateToUserProfile} />
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
