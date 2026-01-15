import { useState } from 'react';
import { Header } from './components/Header';
import { PostComposer } from './components/PostComposer';
import { PostCard, type Post } from './components/PostCard';
import { FeedTabs } from './components/FeedTabs';
import { Profile } from './components/Profile';
import { Notifications } from './components/Notifications';
import { WalletLogin } from './components/WalletLogin';
import { WalletAccount } from './components/wallet/WalletAdapter';

// Mock data
const initialPosts: Post[] = [
  {
    id: '1',
    author: '0x3a...c890',
    content: 'Just exploring this new decentralized social platform. The privacy-first approach is refreshing.',
    timestamp: '2h',
    likes: 12,
    comments: 3,
  },
  {
    id: '2',
    author: '0x7f...a234',
    content: '区块链社交',
    timestamp: '4h',
    likes: 8,
    comments: 1,
  },
  {
    id: '3',
    author: '0x1b...e567',
    content: 'The minimalist design here is perfect. No clutter, just content.',
    timestamp: '6h',
    likes: 15,
    comments: 2,
  },
  {
    id: '4',
    author: 'defaced',
    content: 'I like you too',
    timestamp: '8h',
    likes: 5,
    comments: 0,
  },
];

export default function App() {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [activeTab, setActiveTab] = useState<'trending' | 'following'>('trending');
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [walletAccount, setWalletAccount] = useState<WalletAccount | null>(null);

  const handleNewPost = (content: string, attachment?: { type: 'image' | 'video'; url: string }) => {
    const newPost: Post = {
      id: Date.now().toString(),
      author: walletAccount?.displayAddress || '0x6a...1e77',
      content,
      timestamp: 'now',
      likes: 0,
      comments: 0,
      attachment,
    };
    setPosts([newPost, ...posts]);
  };

  const handleProfileClick = () => {
    setShowProfile(true);
    setShowNotifications(false);
  };

  const handleNotificationsClick = () => {
    setShowNotifications(true);
    setShowProfile(false);
  };

  const handleLogin = (account: WalletAccount) => {
    setWalletAccount(account);
  };

  const handleLogout = () => {
    setWalletAccount(null);
    setShowProfile(false);
    setShowNotifications(false);
  };

  // Show login if not authenticated
  if (!walletAccount) {
    return <WalletLogin onLogin={handleLogin} />;
  }

  if (showProfile) {
    return <Profile 
      walletAddress={walletAccount.displayAddress} 
      fullAddress={walletAccount.address}
      chain={walletAccount.chain}
      onClose={() => setShowProfile(false)} 
      onLogout={handleLogout}
    />;
  }

  if (showNotifications) {
    return <Notifications onClose={() => setShowNotifications(false)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        walletAddress={walletAccount.displayAddress} 
        onProfileClick={handleProfileClick}
        onNotificationsClick={handleNotificationsClick}
      />
      
      <main className="pb-20">
        <PostComposer onPost={handleNewPost} />
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />
        
        <div className="max-w-3xl mx-auto bg-white">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>

        {/* Empty state */}
        {posts.length === 0 && (
          <div className="py-20 text-center text-gray-400">
            <p>No posts yet. Be the first to share something.</p>
          </div>
        )}
      </main>
    </div>
  );
}