import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from './ui-simple/Button';
import { ArrowLeft, Camera, Loader2, Check, AlertCircle } from './ui-simple/Icons';
import { validateUsername, validateBio, countDisplayChars, normalizeUsername } from '../lib/validation';
import { apiService, type User } from '../lib/api';

interface EditProfileProps {
  user: User;
  onClose: () => void;
  onSave: (updatedUser: User) => void;
}

const BIO_MAX_CHARS = 50;
const USERNAME_CHECK_DEBOUNCE_MS = 500;

export function EditProfile({ user, onClose, onSave }: EditProfileProps) {
  // Form state
  const [username, setUsername] = useState(user.username || '');
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '');

  // Validation state
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const usernameCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track changes
  useEffect(() => {
    const usernameChanged = normalizeUsername(username) !== user.username;
    const bioChanged = bio !== (user.bio || '');
    const avatarChanged = avatarUrl !== (user.avatar_url || '');
    setHasUnsavedChanges(usernameChanged || bioChanged || avatarChanged);
  }, [username, bio, avatarUrl, user]);

  // Validate username and check availability
  const checkUsernameAvailability = useCallback(async (value: string) => {
    const normalized = normalizeUsername(value);

    // Skip if same as current username
    if (normalized === user.username) {
      setUsernameError(null);
      setUsernameAvailable(null);
      setCheckingUsername(false);
      return;
    }

    // Frontend validation first
    const validation = validateUsername(value);
    if (!validation.valid) {
      setUsernameError(validation.error || 'Invalid username');
      setUsernameAvailable(null);
      setCheckingUsername(false);
      return;
    }

    // Check availability via API
    setCheckingUsername(true);
    try {
      const response = await apiService.checkUsername(normalized);
      if (response.success && response.data) {
        if (response.data.available) {
          setUsernameError(null);
          setUsernameAvailable(true);
        } else {
          setUsernameError(response.data.error || 'This username is already taken');
          setUsernameAvailable(false);
        }
      } else {
        setUsernameError('Failed to check username');
        setUsernameAvailable(null);
      }
    } catch (err) {
      console.error('Username check error:', err);
      setUsernameError('Failed to check username availability');
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  }, [user.username]);

  // Handle username change with debounced availability check
  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameError(null);
    setUsernameAvailable(null);

    // Clear previous timeout
    if (usernameCheckTimeoutRef.current) {
      clearTimeout(usernameCheckTimeoutRef.current);
    }

    // Immediate frontend validation
    const normalized = normalizeUsername(value);
    if (normalized === user.username) {
      return; // No change from current username
    }

    const validation = validateUsername(value);
    if (!validation.valid) {
      setUsernameError(validation.error || 'Invalid username');
      return;
    }

    // Debounced API check
    setCheckingUsername(true);
    usernameCheckTimeoutRef.current = setTimeout(() => {
      checkUsernameAvailability(value);
    }, USERNAME_CHECK_DEBOUNCE_MS);
  };

  // Handle bio change
  const handleBioChange = (value: string) => {
    setBio(value);
    const validation = validateBio(value);
    setBioError(validation.valid ? null : validation.error || 'Invalid bio');
  };

  // Handle avatar upload
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setSaveError('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setSaveError('Image must be less than 10MB');
      return;
    }

    setUploadingAvatar(true);
    setSaveError(null);

    try {
      const response = await apiService.uploadMedia(file, user.id);
      if (response.success && response.data) {
        setAvatarUrl(response.data.public_url);
      } else {
        setSaveError('Failed to upload image');
      }
    } catch (err) {
      console.error('Avatar upload error:', err);
      setSaveError('Failed to upload image');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Handle save
  const handleSave = async () => {
    // Final validation
    const normalizedUsername = normalizeUsername(username);
    const usernameChanged = normalizedUsername !== user.username;
    const bioChanged = bio !== (user.bio || '');
    const avatarChanged = avatarUrl !== (user.avatar_url || '');

    // Validate username if changed
    if (usernameChanged) {
      const validation = validateUsername(username);
      if (!validation.valid) {
        setUsernameError(validation.error || 'Invalid username');
        return;
      }
      if (usernameAvailable === false) {
        setUsernameError('This username is already taken');
        return;
      }
    }

    // Validate bio if changed
    if (bioChanged) {
      const validation = validateBio(bio);
      if (!validation.valid) {
        setBioError(validation.error || 'Invalid bio');
        return;
      }
    }

    setSaving(true);
    setSaveError(null);

    try {
      const updateData: { username?: string; bio?: string; avatar_url?: string } = {};

      if (usernameChanged) {
        updateData.username = normalizedUsername;
      }
      if (bioChanged) {
        updateData.bio = bio;
      }
      if (avatarChanged) {
        updateData.avatar_url = avatarUrl || undefined;
      }

      const response = await apiService.updateUserProfile(user.id, updateData);

      if (response.success && response.data) {
        onSave(response.data);
      } else {
        setSaveError(response.error || 'Failed to save profile');
      }
    } catch (err) {
      console.error('Save error:', err);
      setSaveError('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel with confirmation
  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (usernameCheckTimeoutRef.current) {
        clearTimeout(usernameCheckTimeoutRef.current);
      }
    };
  }, []);

  const bioCharCount = countDisplayChars(bio);
  const bioOverLimit = bioCharCount > BIO_MAX_CHARS;
  const canSave = hasUnsavedChanges && !usernameError && !bioError && !checkingUsername && !saving;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Cancel"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-lg tracking-tight text-gray-900">Edit Profile</h1>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canSave}
            className="bg-gray-900 hover:bg-gray-800 text-white text-xs px-4"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Error banner */}
        {saveError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {saveError}
          </div>
        )}

        <div className="bg-white border border-gray-100 p-6">
          {/* Avatar section */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative">
              <div
                className="w-24 h-24 rounded-full bg-cyan-400 overflow-hidden cursor-pointer"
                onClick={handleAvatarClick}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-400 to-gray-600" />
                )}
              </div>
              <button
                onClick={handleAvatarClick}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white hover:bg-gray-800 transition-colors"
                aria-label="Change avatar"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">Tap to change photo</p>
          </div>

          {/* Username field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Display Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="username"
                className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                  usernameError
                    ? 'border-red-300 bg-red-50'
                    : usernameAvailable === true
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-200'
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingUsername ? (
                  <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                ) : usernameAvailable === true ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : usernameError ? (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                ) : null}
              </div>
            </div>
            {usernameError && (
              <p className="mt-1 text-xs text-red-600">{usernameError}</p>
            )}
            {usernameAvailable === true && normalizeUsername(username) !== user.username && (
              <p className="mt-1 text-xs text-green-600">Username is available</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              3-15 characters, letters, numbers, and hyphens only
            </p>
          </div>

          {/* Bio field */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Bio
              </label>
              <span
                className={`text-xs ${
                  bioOverLimit ? 'text-red-600 font-medium' : 'text-gray-500'
                }`}
              >
                {bioCharCount}/{BIO_MAX_CHARS}
              </span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => handleBioChange(e.target.value)}
              placeholder="Tell us about yourself..."
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                bioError ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}
            />
            {bioError && (
              <p className="mt-1 text-xs text-red-600">{bioError}</p>
            )}
          </div>

          {/* Wallet address (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Wallet Address
            </label>
            <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 font-mono">
              {user.wallet_address || 'Not connected'}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Wallet address cannot be changed
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
