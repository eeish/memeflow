import React, { useState } from 'react';
import { Button } from './ui-simple/Button';
import { Input } from './ui-simple/Input';
import { Label } from './ui-simple/Label';

interface MemeLaunchPageProps {
  walletAddress: string;
  onComplete: (userData: {
    username: string;
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
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const validateUsername = (value: string): string => {
    if (!value.trim()) {
      return 'Username is required';
    }
    if (value.length < 3) {
      return 'Must be at least 3 characters';
    }
    if (value.length > 20) {
      return 'Must be less than 20 characters';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      return 'Letters, numbers, and underscores only';
    }
    return '';
  };

  const handleInputChange = (value: string) => {
    setUsername(value);
    if (error) {
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateUsername(username);
    if (validationError) {
      setError(validationError);
      return;
    }

    onComplete({
      username: username.toLowerCase()
    });
  };

  const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl font-medium text-gray-900 mb-3">
              Choose your username
            </h1>
            <p className="text-sm text-gray-500 mb-2">
              {shortAddress}
            </p>
            <p className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg py-2 px-3 inline-block">
              You can't change the token name later.
            </p>
          </div>

          {/* Username Input */}
          <div>
            <Label htmlFor="username" className="sr-only">
              Username
            </Label>
            <Input
              id="username"
              type="text"
              placeholder="username"
              value={username}
              onChange={(e) => handleInputChange(e.target.value)}
              className="h-12 text-base bg-white border-gray-300 text-gray-900 text-center"
              maxLength={20}
              autoFocus
            />
            {error && (
              <p className="text-red-600 text-sm mt-2 text-center">{error}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1 h-11 text-sm border-gray-300"
              disabled={loading}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={loading || !username.trim()}
              className="flex-1 h-11 text-sm bg-gray-900 hover:bg-gray-800 text-white font-medium"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
