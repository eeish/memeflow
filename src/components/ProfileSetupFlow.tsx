import React, { useState } from 'react';
import { MemeLaunchPage } from './MemeLaunchPage';
import { useSocialFollow } from '../hooks/useSocialFollow';
import { Alert, AlertDescription } from './ui-simple/Alert';

interface ProfileSetupFlowProps {
  walletAddress: string;
  onComplete: (userData: {
    username: string;
  }) => void;
  onCancel: () => void;
}

export const ProfileSetupFlow: React.FC<ProfileSetupFlowProps> = ({
  walletAddress,
  onComplete,
  onCancel
}) => {
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const { createProfile, loading: profileLoading } = useSocialFollow();

  const handleProfileSubmit = async (userData: {
    username: string;
  }) => {
    try {
      setIsCreatingProfile(true);
      setProfileError(null);

      console.log('🚀 Creating on-chain profile...');

      // Create on-chain profile with username (token name) only
      await createProfile(userData.username);

      console.log('✅ On-chain profile created successfully');

      // Profile created successfully, proceed with backend creation
      onComplete(userData);

    } catch (error: any) {
      console.error('❌ Failed to create on-chain profile:', error);
      setProfileError(error.message || 'Failed to create on-chain profile. Please try again.');
      setIsCreatingProfile(false);
    }
  };

  return (
    <div>
      {profileError && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4">
          <Alert variant="error">
            <AlertDescription>{profileError}</AlertDescription>
          </Alert>
        </div>
      )}

      <MemeLaunchPage
        walletAddress={walletAddress}
        onComplete={handleProfileSubmit}
        onCancel={onCancel}
        loading={isCreatingProfile || profileLoading}
      />
    </div>
  );
};
