import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Card } from './ui/card';
import type { UserSummary } from '../types/users.ts';

interface UserProfilePageProps {
  user: UserSummary;
  onBack: () => void;
}

export const UserProfilePage: React.FC<UserProfilePageProps> = ({ user, onBack }) => {
  const displayName = user.display_name || user.username;
  const avatarFallback = user.username.charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="group inline-flex items-center px-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Plaza
        </Button>
      </div>

      <Card className="border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {user.avatar_url ? (
              <AvatarImage src={user.avatar_url} alt={displayName} />
            ) : (
              <AvatarFallback className="bg-gray-200 text-lg font-semibold text-gray-700">
                {avatarFallback}
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{displayName}</h1>
            <p className="text-sm text-gray-500">@{user.username}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 text-sm text-gray-600">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <span>Token symbol</span>
            <span className="font-medium text-gray-900">{user.token_symbol}</span>
          </div>
          <div className="rounded-lg border border-dashed px-4 py-3 text-center text-gray-400">
            Bio coming soon.
          </div>
        </div>
      </Card>

      <Card className="border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500 text-center">
          Posts from @{user.username} will appear here once published.
        </p>
      </Card>
    </div>
  );
};
