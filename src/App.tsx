import { useState } from 'react';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar';
import { User, TrendingUp, Bell, Zap, Sparkles, LogOut, Settings, Home, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { NetworkProvider } from './contexts/NetworkContext';
import { Profile } from './components/Profile';
import { Market } from './components/Market';
import { Notifications } from './components/Notifications';
import { NetworkSwitcher } from './components/NetworkSwitcher';
import { Plaza } from './components/Plaza';
import { NotificationProvider } from './contexts/NotificationContext';
import { NotificationContainer } from './components/notifications/NotificationContainer';

// Main App Content Component
function AppContent() {
  const [activeView, setActiveView] = useState('plaza');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { user, signOut } = useAuth();

  // Utility function to format wallet address for display
  const formatWalletAddress = (address: string) => {
    if (!address) return 'No address';
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
      <div className="min-h-screen relative overflow-hidden bg-[#F8F9FA]">
        {/* Light animated background elements */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 rounded-full bg-gradient-to-r from-blue-100/40 to-purple-100/40 blur-xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-24 h-24 rounded-full bg-gradient-to-r from-pink-100/40 to-orange-100/40 blur-lg animate-pulse delay-1000"></div>
          <div className="absolute bottom-32 left-1/4 w-40 h-40 rounded-full bg-gradient-to-r from-green-100/30 to-blue-100/30 blur-2xl animate-pulse delay-2000"></div>
          <div className="absolute bottom-20 right-1/3 w-28 h-28 rounded-full bg-gradient-to-r from-orange-100/35 to-red-100/35 blur-xl animate-pulse delay-500"></div>
        </div>

        {/* Light overlay for subtle depth */}
        <div className="fixed inset-0 bg-gradient-to-br from-gray-50/30 via-white/20 to-gray-100/30 pointer-events-none"></div>

        {/* Main Content */}
        <main className="relative z-10 min-h-screen">
          {!user ? (
            <div className="flex items-center justify-center min-h-screen p-4">
              <div className="max-w-md mx-auto relative">
                {/* Light floating elements */}
                <div className="absolute -top-8 -left-8 text-blue-500 animate-bounce delay-300">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="absolute -top-4 -right-6 text-purple-500 animate-bounce delay-700">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="absolute -bottom-6 -left-4 text-blue-400 animate-bounce delay-500">
                  <Sparkles className="w-4 h-4" />
                </div>
                
                <Card className="bg-white border border-[#ECECEC] p-12 rounded-3xl shadow-lg">
                  <div className="relative mb-8">
                    <div className="w-24 h-24 mx-auto mb-6 relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 rounded-full blur-lg opacity-20"></div>
                      <div className="relative bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 rounded-full p-6">
                        <div className="w-12 h-12 text-white flex items-center justify-center font-bold text-2xl">M</div>
                      </div>
                    </div>
                  </div>
                  
                  <h2 className="text-4xl font-bold text-gray-900 mb-4 text-center">
                    MemeFlow
                  </h2>
                  <h3 className="text-lg font-semibold text-blue-600 mb-6 tracking-wide text-center">
                    THE ULTIMATE MEME METAVERSE
                  </h3>
                  <p className="text-gray-700 mb-8 leading-relaxed text-lg text-center">
                    Your username becomes your token automatically!
                    <br />
                    <span className="text-purple-600 font-semibold">
                      Enter the future of social trading 🚀
                    </span>
                  </p>
                  
                  <div className="flex flex-col items-center space-y-4">
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span>Powered by Sui Blockchain</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-300"></div>
                      <span>Auto Token Generation</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse delay-600"></div>
                      <span>Real-time Social Trading</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex min-h-screen">
              {/* Main content area */}
              <div className="flex-1 flex">
                {/* Clean White Sidebar */}
                <div className={`${isSidebarCollapsed ? 'w-20' : 'w-72'} bg-white border-r border-[#ECECEC] py-8 ${isSidebarCollapsed ? 'px-3' : 'px-6'} flex flex-col shadow-sm transition-all duration-300 ease-in-out relative`}>
                  {/* Collapse Toggle Button */}
                  <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className="absolute -right-3 top-10 bg-white border border-gray-200 rounded-full p-1.5 hover:bg-gray-50 transition-colors z-10 shadow-md"
                    title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  >
                    {isSidebarCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    ) : (
                      <ChevronLeft className="w-4 h-4 text-gray-600" />
                    )}
                  </button>

                  {/* User Identity Section */}
                  <div className={`${isSidebarCollapsed ? 'mb-6 pb-6' : 'mb-8 pb-8'} border-b border-[#ECECEC]`}>
                    {/* User Profile */}
                    <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-4'} mb-4`}>
                      <Avatar className={`${isSidebarCollapsed ? 'w-10 h-10' : 'w-16 h-16'} border-2 border-gray-200`}>
                        {(user.avatar_url || user.avatar) && (
                          <AvatarImage src={user.avatar_url || user.avatar} alt={`@${user.username}`} />
                        )}
                        <AvatarFallback className="bg-purple-600 text-white text-xl font-semibold">
                          {user.username ? user.username[0].toUpperCase() : 'T'}
                        </AvatarFallback>
                      </Avatar>
                      {!isSidebarCollapsed && (
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <h2 className="text-gray-900 font-semibold text-lg truncate">
                              @{user.username || user.email?.split('@')[0]}
                            </h2>
                            <span className="text-blue-600 text-sm font-medium px-2 py-1 bg-blue-50 rounded">
                              ${user.username?.toUpperCase() || 'TOKEN'}
                            </span>
                          </div>
                          <div className="text-gray-600 text-sm font-mono truncate">
                            {formatWalletAddress(user.wallet_address || '0x1234...5678')}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Navigation Section */}
                  <nav className="space-y-2 flex-1 mb-8">
                    <Button
                      variant="ghost"
                      onClick={() => setActiveView('plaza')}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center' : 'justify-start'} text-left h-14 px-4 rounded-lg transition-all duration-150 ease-out active:scale-95 ${
                        activeView === 'plaza' 
                          ? 'bg-gray-200 text-gray-900' 
                          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200'
                      }`}
                      title={isSidebarCollapsed ? 'Plaza' : undefined}
                    >
                      <Home className={`w-6 h-6 ${isSidebarCollapsed ? '' : 'mr-4'}`} />
                      {!isSidebarCollapsed && <span className="text-lg font-medium">Plaza</span>}
                    </Button>
                    
                    <Button
                      variant="ghost"
                      onClick={() => setActiveView('tokens')}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center' : 'justify-start'} text-left h-14 px-4 rounded-lg transition-all duration-150 ease-out active:scale-95 ${
                        activeView === 'tokens' 
                          ? 'bg-gray-200 text-gray-900' 
                          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200'
                      }`}
                      title={isSidebarCollapsed ? 'Markets' : undefined}
                    >
                      <TrendingUp className={`w-6 h-6 ${isSidebarCollapsed ? '' : 'mr-4'}`} />
                      {!isSidebarCollapsed && <span className="text-lg font-medium">Markets</span>}
                    </Button>
                    
                    <Button
                      variant="ghost"
                      onClick={() => setActiveView('profile')}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center' : 'justify-start'} text-left h-14 px-4 rounded-lg transition-all duration-150 ease-out active:scale-95 ${
                        activeView === 'profile' 
                          ? 'bg-gray-200 text-gray-900' 
                          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200'
                      }`}
                      title={isSidebarCollapsed ? 'Profile' : undefined}
                    >
                      <User className={`w-6 h-6 ${isSidebarCollapsed ? '' : 'mr-4'}`} />
                      {!isSidebarCollapsed && <span className="text-lg font-medium">Profile</span>}
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={() => setActiveView('notifications')}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center' : 'justify-start'} text-left h-14 px-4 rounded-lg transition-all duration-150 ease-out active:scale-95 relative ${
                        activeView === 'notifications' 
                          ? 'bg-gray-200 text-gray-900' 
                          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200'
                      }`}
                      title={isSidebarCollapsed ? 'Notifications' : undefined}
                    >
                      <Bell className={`w-6 h-6 ${isSidebarCollapsed ? '' : 'mr-4'}`} />
                      {!isSidebarCollapsed && <span className="text-lg font-medium">Notifications</span>}
                      <div className={`absolute ${isSidebarCollapsed ? 'top-2 right-2' : 'top-3 right-3'} w-2 h-2 bg-blue-500 rounded-full`}></div>
                    </Button>
                  </nav>

                  {/* Settings Section */}
                  <div className="pt-8 border-t border-[#ECECEC] space-y-2">
                    <Button
                      variant="ghost"
                      onClick={() => setActiveView('network')}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center' : 'justify-start'} text-left h-14 px-4 rounded-lg transition-all duration-150 ease-out active:scale-95 ${
                        activeView === 'network' 
                          ? 'bg-gray-200 text-gray-900' 
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200'
                      }`}
                      title={isSidebarCollapsed ? 'Settings' : undefined}
                    >
                      <Settings className={`w-6 h-6 ${isSidebarCollapsed ? '' : 'mr-4'}`} />
                      {!isSidebarCollapsed && <span className="text-lg font-medium">Settings</span>}
                    </Button>
                    
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to sign out?')) {
                          signOut();
                        }
                      }}
                      className={`w-full ${isSidebarCollapsed ? 'justify-center' : 'justify-start'} text-left h-14 px-4 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 active:bg-red-100 transition-all duration-150 ease-out active:scale-95`}
                      title={isSidebarCollapsed ? 'Sign Out' : undefined}
                    >
                      <LogOut className={`w-6 h-6 ${isSidebarCollapsed ? '' : 'mr-4'}`} />
                      {!isSidebarCollapsed && <span className="text-lg font-medium">Sign Out</span>}
                    </Button>
                  </div>
                  
                  {/* Network Status - Hidden but functional */}
                  <div className="hidden">
                    <NetworkSwitcher variant="compact" />
                  </div>
                </div>

                {/* Main content - Full Width for Market */}
                <div className="flex-1 p-6 bg-[#F8F9FA]">
                  <div className={activeView === 'tokens' ? '' : 'max-w-4xl mx-auto'}>
                    {activeView === 'plaza' && <Plaza user={user} />}
                    {activeView === 'tokens' && <Market user={user} />}
                    {activeView === 'profile' && <Profile user={user} />}
                    {activeView === 'network' && (
                      <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">
                          Settings & Network
                        </h2>
                        <NetworkSwitcher variant="full" />
                      </div>
                    )}
                    {activeView === 'notifications' && (
                      <Notifications user={user} onClose={() => setActiveView('plaza')} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Footer light effect */}
        <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-100/30 to-transparent pointer-events-none"></div>
      </div>
  );
}

// Main App wrapper with AuthProvider and NetworkProvider
function App() {
  return (
    <NetworkProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppContent />
          <NotificationContainer />
        </NotificationProvider>
      </AuthProvider>
    </NetworkProvider>
  );
}

export default App;