import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { 
  Rocket, 
  User, 
  Image as ImageIcon, 
  Sparkles, 
  Zap, 
  DollarSign, 
  AlertCircle,
  Check,
  Upload,
  X
} from 'lucide-react';

interface MemeLaunchPageProps {
  walletAddress: string;
  onComplete: (userData: {
    username: string;
    bio?: string;
    avatarUrl?: string;
  }) => void;
  onCancel: () => void;
  loading?: boolean;
}

export const MemeLaunchPage: React.FC<MemeLaunchPageProps> = ({
  walletAddress,
  onComplete,
  onCancel,
  loading = false
}) => {
  const [formData, setFormData] = useState({
    username: '',
    bio: '',
    avatarUrl: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear errors when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Username validation
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    } else if (formData.username.length > 20) {
      newErrors.username = 'Username must be less than 20 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      newErrors.username = 'Username can only contain letters, numbers, and underscores';
    }

    // Bio validation
    if (formData.bio && formData.bio.length > 280) {
      newErrors.bio = 'Bio must be less than 280 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    onComplete({
      username: formData.username.toLowerCase(),
      bio: formData.bio || undefined,
      avatarUrl: formData.avatarUrl || undefined
    });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, avatar: 'Please select an image file' }));
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, avatar: 'Image must be less than 2MB' }));
      return;
    }

    setIsUploading(true);
    try {
      // For now, we'll create a data URL for the image
      // In production, this would upload to a storage service
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setFormData(prev => ({ ...prev, avatarUrl: dataUrl }));
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setErrors(prev => ({ ...prev, avatar: 'Failed to upload image' }));
      setIsUploading(false);
    }
  };

  const removeAvatar = () => {
    setFormData(prev => ({ ...prev, avatarUrl: '' }));
  };

  const tokenSymbol = formData.username ? `$${formData.username.toUpperCase()}` : '$USERNAME';
  const shortAddress = `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-pink-900 to-cyan-900 p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 rounded-full bg-gradient-to-r from-cyan-500/20 to-purple-500/20 blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-24 h-24 rounded-full bg-gradient-to-r from-pink-500/20 to-yellow-500/20 blur-lg animate-pulse delay-1000"></div>
        <div className="absolute bottom-32 left-1/4 w-40 h-40 rounded-full bg-gradient-to-r from-green-500/10 to-blue-500/10 blur-2xl animate-pulse delay-2000"></div>
      </div>

      <Card className="w-full max-w-lg p-6 glass border border-white/20 relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-8 h-8 text-white" />
          </div>
          
          <h1 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text mb-2">
            Launch Your Token
          </h1>
          <p className="text-white/70 text-base mb-4">
            Create your username to get started
          </p>
          
          {/* Wallet info */}
          <div className="flex items-center justify-center space-x-2 text-sm text-white/50 bg-white/5 rounded-lg p-2">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <code className="text-cyan-300 font-mono">{shortAddress}</code>
          </div>
        </div>


        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username Input */}
          <div>
            <Label htmlFor="username" className="text-white text-sm font-medium mb-2 block">
              Username <span className="text-red-400">*</span>
            </Label>
            <div className="relative">
              <Input
                id="username"
                type="text"
                placeholder="Enter username"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                className="bg-white/5 border-white/20 text-white placeholder-white/30 pr-16 h-11"
                maxLength={20}
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <span className="text-cyan-400 font-medium text-sm">{tokenSymbol}</span>
              </div>
            </div>
            {errors.username && (
              <p className="text-red-400 text-sm mt-1">{errors.username}</p>
            )}
            <p className="text-white/40 text-xs mt-1">
              Token symbol: {tokenSymbol}
            </p>
          </div>



          {/* Avatar Upload */}
          <div>
            <Label className="text-white text-sm font-medium mb-2 block">
              Profile Avatar (Optional)
            </Label>
            <div className="flex items-center space-x-4">
              {/* Avatar Preview */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center overflow-hidden border-2 border-white/20">
                {formData.avatarUrl ? (
                  <img src={formData.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-white" />
                )}
              </div>
              
              {/* Upload/Remove Controls */}
              <div className="flex-1">
                {!formData.avatarUrl ? (
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      disabled={isUploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isUploading}
                      className="bg-white/5 border-white/20 text-white hover:bg-white/10 w-full"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {isUploading ? 'Uploading...' : 'Upload Image'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={removeAvatar}
                    className="bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 w-full"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove Image
                  </Button>
                )}
              </div>
            </div>
            {errors.avatar && (
              <p className="text-red-400 text-sm mt-1">{errors.avatar}</p>
            )}
            <p className="text-white/40 text-xs mt-1">
              JPG, PNG or GIF. Max size 2MB.
            </p>
          </div>

          {/* Bio Input */}
          <div>
            <Label htmlFor="bio" className="text-white text-sm font-medium mb-2 block">
              Bio (Optional)
            </Label>
            <Textarea
              id="bio"
              placeholder="Tell everyone about yourself..."
              value={formData.bio}
              onChange={(e) => handleInputChange('bio', e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder-white/30 min-h-[80px] resize-none"
              maxLength={280}
            />
            <div className="flex justify-between items-center mt-1">
              {errors.bio && (
                <p className="text-red-400 text-sm">{errors.bio}</p>
              )}
              <span className="text-white/40 text-xs ml-auto">
                {280 - formData.bio.length} remaining
              </span>
            </div>
          </div>


          {/* Action Buttons */}
          <div className="flex space-x-3 pt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              className="text-white/60 hover:text-white hover:bg-white/10 px-6"
              disabled={loading}
            >
              Cancel
            </Button>
            
            <Button
              type="submit"
              disabled={loading || !formData.username.trim()}
              className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white flex-1 h-11 font-medium"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Create Account
                </>
              )}
            </Button>
          </div>
        </form>

      </Card>
    </div>
  );
};