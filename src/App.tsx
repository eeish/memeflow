import { useState } from 'react';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Home, User, TrendingUp, Search, Bell, Zap, Sparkles, LogOut, Settings } from 'lucide-react';
import { AuthProvider } from './components/AuthProvider';
import { SocialFeed } from './components/SocialFeed';
import { Profile } from './components/Profile';
import { TokenDashboard } from './components/TokenDashboard';
import { Notifications } from './components/Notifications';
import { SearchPage } from './components/SearchPage';

function App() {
  const [activeView, setActiveView] = useState('feed');
  const [user, setUser] = useState<any>(null);

  return (
    <AuthProvider onAuthChange={setUser}>
      <div className="min-h-screen relative overflow-hidden">
        {/* Animated background elements */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 rounded-full bg-gradient-to-r from-cyan-500/20 to-purple-500/20 blur-xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-24 h-24 rounded-full bg-gradient-to-r from-pink-500/20 to-yellow-500/20 blur-lg animate-pulse delay-1000"></div>
          <div className="absolute bottom-32 left-1/4 w-40 h-40 rounded-full bg-gradient-to-r from-green-500/10 to-blue-500/10 blur-2xl animate-pulse delay-2000"></div>
          <div className="absolute bottom-20 right-1/3 w-28 h-28 rounded-full bg-gradient-to-r from-orange-500/15 to-red-500/15 blur-xl animate-pulse delay-500"></div>
        </div>

        {/* Main gradient overlay */}
        <div className="fixed inset-0 bg-gradient-to-br from-purple-900/50 via-pink-900/30 to-cyan-900/50 pointer-events-none"></div>

        {/* Main Content */}
        <main className="relative z-10 min-h-screen">
          {!user ? (
            <div className="flex items-center justify-center min-h-screen p-4">
              <div className="max-w-md mx-auto relative">
                {/* Floating sparkles */}
                <div className="absolute -top-8 -left-8 text-cyan-400 animate-bounce delay-300">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="absolute -top-4 -right-6 text-pink-400 animate-bounce delay-700">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="absolute -bottom-6 -left-4 text-purple-400 animate-bounce delay-500">
                  <Sparkles className="w-4 h-4" />
                </div>
                
                <Card className="glass-strong border-2 border-white/20 p-12 rounded-3xl glow-purple float">
                  <div className="relative mb-8">
                    <div className="w-24 h-24 mx-auto mb-6 relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 rounded-full blur-lg opacity-70 animate-pulse"></div>
                      <div className="relative bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 rounded-full p-6 glass">
                        <div className="w-12 h-12 text-white flex items-center justify-center font-bold text-2xl">M</div>
                      </div>
                    </div>
                  </div>
                  
                  <h2 className="text-4xl font-bold text-transparent bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text mb-4 text-center">
                    MemeFlow
                  </h2>
                  <h3 className="text-lg font-semibold text-cyan-300 mb-6 tracking-wide text-center">
                    THE ULTIMATE MEME METAVERSE
                  </h3>
                  <p className="text-white/80 mb-8 leading-relaxed text-lg text-center">
                    Your username becomes your token automatically!
                    <br />
                    <span className="text-transparent bg-gradient-to-r from-pink-400 to-cyan-400 bg-clip-text font-semibold">
                      Enter the future of social trading 🚀
                    </span>
                  </p>
                  
                  <div className="flex flex-col items-center space-y-4">
                    <div className="flex items-center space-x-2 text-sm text-white/60">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span>Powered by Sui Blockchain</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-white/60">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse delay-300"></div>
                      <span>Auto Token Generation</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-white/60">
                      <div className="w-2 h-2 bg-pink-400 rounded-full animate-pulse delay-600"></div>
                      <span>Real-time Social Trading</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex flex-col min-h-screen">
              {/* Simplified header with app name and user info */}
              <div className="glass-strong border-b border-white/10 p-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">M</span>
                    </div>
                    <h1 className="text-xl font-bold text-transparent bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text">
                      MemeFlow
                    </h1>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <span className="text-transparent bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text font-semibold">
                      @{user.username || user.email?.split('@')[0]}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setActiveView('notifications')}
                      className="text-white hover:text-cyan-300 hover:bg-cyan-500/20 transition-all duration-300 relative"
                    >
                      <Bell className="w-4 h-4" />
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-pink-500 rounded-full animate-pulse"></div>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Main content area */}
              <div className="flex-1 flex">
                {/* Sidebar navigation */}
                <div className="w-64 glass-strong border-r border-white/10 p-4">
                  <nav className="space-y-2">
                    <Button
                      variant={activeView === 'feed' ? 'default' : 'ghost'}
                      onClick={() => setActiveView('feed')}
                      className={`w-full justify-start text-left ${
                        activeView === 'feed' 
                          ? 'bg-gradient-to-r from-cyan-500/20 to-pink-500/20 text-white glow-cyan' 
                          : 'text-white hover:text-cyan-300 hover:bg-cyan-500/20'
                      } transition-all duration-300`}
                    >
                      <Home className="w-4 h-4 mr-3" />
                      Social Feed
                    </Button>
                    
                    <Button
                      variant={activeView === 'tokens' ? 'default' : 'ghost'}
                      onClick={() => setActiveView('tokens')}
                      className={`w-full justify-start text-left ${
                        activeView === 'tokens' 
                          ? 'bg-gradient-to-r from-purple-500/20 to-cyan-500/20 text-white glow-purple' 
                          : 'text-white hover:text-purple-300 hover:bg-purple-500/20'
                      } transition-all duration-300`}
                    >
                      <TrendingUp className="w-4 h-4 mr-3" />
                      Token Market
                    </Button>
                    
                    <Button
                      variant={activeView === 'search' ? 'default' : 'ghost'}
                      onClick={() => setActiveView('search')}
                      className={`w-full justify-start text-left ${
                        activeView === 'search' 
                          ? 'bg-gradient-to-r from-pink-500/20 to-yellow-500/20 text-white glow-pink' 
                          : 'text-white hover:text-pink-300 hover:bg-pink-500/20'
                      } transition-all duration-300`}
                    >
                      <Search className="w-4 h-4 mr-3" />
                      Search
                    </Button>
                    
                    <Button
                      variant={activeView === 'profile' ? 'default' : 'ghost'}
                      onClick={() => setActiveView('profile')}
                      className={`w-full justify-start text-left ${
                        activeView === 'profile' 
                          ? 'bg-gradient-to-r from-green-500/20 to-blue-500/20 text-white glow-green' 
                          : 'text-white hover:text-green-300 hover:bg-green-500/20'
                      } transition-all duration-300`}
                    >
                      <User className="w-4 h-4 mr-3" />
                      Profile
                    </Button>
                  </nav>

                  {/* User token info card */}
                  <Card className="mt-8 p-4 glass border border-white/10">
                    <div className="text-center">
                      <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold">
                          {user.username ? user.username[0].toUpperCase() : 'T'}
                        </span>
                      </div>
                      <h3 className="font-semibold text-white mb-1">
                        ${user.username?.toUpperCase() || 'TOKEN'}
                      </h3>
                      <p className="text-xs text-cyan-300/70">Your Token</p>
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-white/60">Price:</span>
                          <span className="text-green-400">0.001 SUI</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-white/60">Change:</span>
                          <span className="text-green-400">+5.2%</span>
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Bottom actions */}
                  <div className="mt-auto pt-8 space-y-2">
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-white hover:text-cyan-300 hover:bg-cyan-500/20 transition-all duration-300"
                    >
                      <Settings className="w-4 h-4 mr-3" />
                      Settings
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to sign out?')) {
                          localStorage.removeItem('session_token');
                          localStorage.removeItem('access_token');
                          window.location.reload();
                        }
                      }}
                      className="w-full justify-start text-red-300 hover:text-red-200 hover:bg-red-500/20 transition-all duration-300"
                    >
                      <LogOut className="w-4 h-4 mr-3" />
                      Sign Out
                    </Button>
                  </div>
                </div>

                {/* Main content */}
                <div className="flex-1 p-6">
                  <div className="max-w-4xl mx-auto">
                    {activeView === 'feed' && <SocialFeed user={user} />}
                    {activeView === 'tokens' && <TokenDashboard user={user} />}
                    {activeView === 'search' && <SearchPage user={user} />}
                    {activeView === 'profile' && <Profile user={user} />}
                    {activeView === 'notifications' && (
                      <Notifications user={user} onClose={() => setActiveView('feed')} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Footer glow effect */}
        <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-purple-900/20 to-transparent pointer-events-none"></div>
      </div>
    </AuthProvider>
  );
}

export default App;