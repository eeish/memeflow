import { useState, useEffect, useCallback } from 'react';
import { Bell, ArrowLeft, User as UserIcon, Settings, X } from './components/ui-simple/Icons';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { NetworkProvider } from './contexts/NetworkContext';
import { Profile } from './components/Profile';
import { EditProfile } from './components/EditProfile';
import { Notifications } from './components/Notifications';
import { Plaza } from './components/Plaza';
import { UserProfilePage } from './components/UserProfilePage';
import { TradePage } from './components/trade/TradePage';
import { NotificationProvider } from './contexts/NotificationContext';
import { SharePurchaseFeedbackProvider } from './contexts/SharePurchaseFeedbackContext';
import { NotificationContainer } from './components/notifications/NotificationContainer';
import type { User } from './lib/api';
import type { FeedAuthor } from './components/feed/types';
import type { UserSummary } from './types/users';
import type { TradePageContext } from './types/trade';

// Main App Content Component
function AppContent() {
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState<UserSummary | null>(null);
  const [tradeRoute, setTradeRoute] = useState<{
    market: TradePageContext;
    previousView: {
      showProfile: boolean;
      showNotifications: boolean;
      showEditProfile: boolean;
      selectedUserProfile: UserSummary | null;
    };
  } | null>(null);
  const { user, setUser, refreshUser } = useAuth();

  // ── Side-menu (avatar drawer) ─────────────────────────────────────────────
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const openMenu = useCallback(() => {
    setMenuMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setMenuOpen(true)));
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setTimeout(() => setMenuMounted(false), 300);
  }, []);

  useEffect(() => {
    if (!menuMounted) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuMounted, closeMenu]);

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
    setTradeRoute(null);
  };

  const handleOpenTradePage = (market: TradePageContext) => {
    setTradeRoute({
      market,
      previousView: {
        showProfile,
        showNotifications,
        showEditProfile,
        selectedUserProfile,
      },
    });
    setShowProfile(false);
    setShowNotifications(false);
    setShowEditProfile(false);
    setSelectedUserProfile(null);
  };

  const handleCloseTradePage = () => {
    if (!tradeRoute) {
      handleBackToFeed();
      return;
    }

    const { previousView } = tradeRoute;
    setTradeRoute(null);
    setShowProfile(previousView.showProfile);
    setShowNotifications(previousView.showNotifications);
    setShowEditProfile(previousView.showEditProfile);
    setSelectedUserProfile(previousView.selectedUserProfile);
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
      avatar_url: author.avatarUrl || null,
      token_symbol: author.tokenSymbol || author.username.toUpperCase(),
    };
    setSelectedUserProfile(userSummary);
    setShowProfile(false);
    setShowNotifications(false);
    setShowEditProfile(false);
  };

  // Handle navigation from Holdings (UserSummary)
  const handleNavigateToUserSummary = (userSummary: UserSummary) => {
    if (userSummary.id === user?.id) {
      setShowProfile(true);
      return;
    }
    setSelectedUserProfile(userSummary);
    setShowProfile(false);
    setShowNotifications(false);
    setShowEditProfile(false);
  };

  // Unified handler: accepts either FeedAuthor or UserSummary
  // UserSummary has snake_case `token_symbol`; FeedAuthor has camelCase `tokenSymbol`
  const handleNavigateToAnyProfile = (profile: FeedAuthor | UserSummary) => {
    if ('token_symbol' in profile) {
      handleNavigateToUserSummary(profile as UserSummary);
    } else {
      handleNavigateToUserProfile(profile as FeedAuthor);
    }
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

  if (tradeRoute) {
    return <TradePage market={tradeRoute.market} onClose={handleCloseTradePage} />;
  }

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
        onOpenTrade={handleOpenTradePage}
      />
    );
  }

  if (showNotifications) {
    return (
      <Notifications
        user={user}
        onClose={handleBackToFeed}
        onOpenPost={() => handleBackToFeed()}
      />
    );
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
          <UserProfilePage
            user={selectedUserProfile}
            onOpenTrade={handleOpenTradePage}
          />
        </main>
      </div>
    );
  }

  // Main feed view
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={openMenu}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Open menu"
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
          </button>

          <button
            onClick={handleNotificationsClick}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </header>

      <Plaza
        user={user}
        onNavigateToProfile={handleNavigateToAnyProfile}
        onOpenTrade={handleOpenTradePage}
      />

      {/* ── Side drawer ─────────────────────────────────────────────────────── */}
      {menuMounted && (
        <>
          {/* Backdrop */}
          <div
            aria-hidden="true"
            className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ease-out ${
              menuOpen ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
            onClick={closeMenu}
          />

          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className={`fixed left-0 top-0 bottom-0 z-50 w-72 bg-white shadow-2xl flex flex-col
              transition-transform duration-300 ease-out
              ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            {/* Close button */}
            <div className="flex items-center justify-end px-4 pt-4 pb-2">
              <button
                onClick={closeMenu}
                aria-label="Close menu"
                className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* User identity block */}
            <div className="px-5 pb-5 border-b border-gray-100">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt="Avatar"
                  className="w-14 h-14 rounded-full object-cover mb-3 ring-2 ring-offset-2 ring-gray-100"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 mb-3" />
              )}
              <p className="text-base font-semibold text-gray-900 tracking-tight">
                @{user?.username}
              </p>
              {user?.wallet_address && (
                <p className="text-xs font-mono text-gray-400 mt-0.5 truncate">
                  {`${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}`}
                </p>
              )}
            </div>

            {/* Nav items */}
            <nav className="flex-1 px-3 py-3 space-y-0.5">
              {[
                {
                  icon: <UserIcon className="w-4 h-4" />,
                  label: 'Profile',
                  onClick: () => { closeMenu(); handleProfileClick(); },
                },
                {
                  icon: <Settings className="w-4 h-4" />,
                  label: 'Settings',
                  onClick: () => { closeMenu(); /* settings page TBD */ },
                },
              ].map(({ icon, label, onClick }) => (
                <button
                  key={label}
                  onClick={onClick}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-gray-700
                    hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100
                    transition-colors text-left"
                >
                  <span className="text-gray-400">{icon}</span>
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}

// Root App Component with Providers
function App() {
  return (
    <NetworkProvider>
      <AuthProvider>
        <NotificationProvider>
          <SharePurchaseFeedbackProvider>
            <NotificationContainer />
            <AppContent />
          </SharePurchaseFeedbackProvider>
        </NotificationProvider>
      </AuthProvider>
    </NetworkProvider>
  );
}

export default App;
