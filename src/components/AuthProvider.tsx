import { createContext, useContext, useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Check, LogIn, UserPlus } from 'lucide-react';

const AuthContext = createContext<any>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children, onAuthChange }: { children: any, onAuthChange: any }) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    onAuthChange?.(user);
  }, [user, onAuthChange]);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (token) {
        // Mock user data - in real app, validate token with backend
        const mockUser = {
          id: '1',
          email: localStorage.getItem('user_email') || 'user@example.com',
          username: localStorage.getItem('username') || 'memetrader',
          avatar: null,
          created_at: new Date().toISOString()
        };
        setUser(mockUser);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_email');
      localStorage.removeItem('username');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Mock authentication - replace with real auth
      if (formData.email && formData.password) {
        const mockToken = 'mock-jwt-token-' + Date.now();
        const username = formData.email.split('@')[0];
        
        localStorage.setItem('access_token', mockToken);
        localStorage.setItem('user_email', formData.email);
        localStorage.setItem('username', username);
        
        const newUser = {
          id: '1',
          email: formData.email,
          username: username,
          avatar: null,
          created_at: new Date().toISOString()
        };
        
        setUser(newUser);
        setSuccess('Successfully signed in!');
      } else {
        setError('Please fill in all fields');
      }
    } catch (error: any) {
      setError(error.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Mock registration - replace with real auth
      if (formData.email && formData.password && formData.username && formData.password === formData.confirmPassword) {
        const mockToken = 'mock-jwt-token-' + Date.now();
        
        localStorage.setItem('access_token', mockToken);
        localStorage.setItem('user_email', formData.email);
        localStorage.setItem('username', formData.username);
        
        const newUser = {
          id: '1',
          email: formData.email,
          username: formData.username,
          avatar: null,
          created_at: new Date().toISOString()
        };
        
        setUser(newUser);
        setSuccess('Successfully signed up!');
      } else {
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
        } else {
          setError('Please fill in all fields');
        }
      }
    } catch (error: any) {
      setError(error.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: any) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    if (error) setError('');
    if (success) setSuccess('');
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_email');
      localStorage.removeItem('username');
      setUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-pink-900 to-cyan-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-pink-900 to-cyan-900 p-4">
        <Card className="w-full max-w-md p-8 glass-strong border-2 border-white/20">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-white font-bold text-2xl">M</span>
            </div>
            <h2 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text">
              {isSignUp ? 'Join MemeFlow' : 'Welcome Back'}
            </h2>
            <p className="text-white/70 mt-2">
              {isSignUp ? 'Create your account and start trading' : 'Sign in to your account'}
            </p>
          </div>

          {error && (
            <Alert className="mb-4 border-red-500 bg-red-500/10">
              <AlertDescription className="text-red-400">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-4 border-green-500 bg-green-500/10">
              <Check className="w-4 h-4" />
              <AlertDescription className="text-green-400">{success}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={(e) => {
            e.preventDefault();
            isSignUp ? handleSignUp() : handleSignIn();
          }}>
            <div className="space-y-4">
              {isSignUp && (
                <div>
                  <Label htmlFor="username" className="text-white">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    placeholder="Enter your username"
                    value={formData.username}
                    onChange={handleInputChange}
                    className="mt-1 bg-white/5 border-white/20 text-white placeholder-white/50"
                    required
                  />
                </div>
              )}

              <div>
                <Label htmlFor="email" className="text-white">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="mt-1 bg-white/5 border-white/20 text-white placeholder-white/50"
                  required
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-white">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="mt-1 bg-white/5 border-white/20 text-white placeholder-white/50"
                  required
                />
              </div>

              {isSignUp && (
                <div>
                  <Label htmlFor="confirmPassword" className="text-white">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="mt-1 bg-white/5 border-white/20 text-white placeholder-white/50"
                    required
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white"
                disabled={loading}
              >
                {loading ? 'Loading...' : (isSignUp ? (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Sign Up
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In
                  </>
                ))}
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <Button
              variant="ghost"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccess('');
                setFormData({
                  email: '',
                  password: '',
                  username: '',
                  confirmPassword: ''
                });
              }}
              className="text-cyan-400 hover:text-cyan-300"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
};