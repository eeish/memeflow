import React, { useState } from 'react';
import { MemeLaunchPage } from './MemeLaunchPage';
import { useSocialFollow } from '../hooks/useSocialFollow';
import { Alert, AlertDescription } from './ui-simple/Alert';

interface ProfileSetupFlowProps {
  walletAddress: string;
  skipOnChain?: boolean;
  onComplete: (userData: {
    username: string;
  }) => void;
  onCancel: () => void;
}

export const ProfileSetupFlow: React.FC<ProfileSetupFlowProps> = ({
  walletAddress,
  skipOnChain = false,
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

      if (!skipOnChain) {
        // createProfile calls share_market::create_market internally — one wallet popup, one tx
        console.log('🚀 Creating on-chain profile and share market...');
        await createProfile(userData.username);
        console.log('✅ On-chain profile and share market created successfully');
      } else {
        console.log('⏭️ Skipping on-chain setup for zkLogin user');
      }

      // Profile created successfully, proceed with backend creation
      onComplete(userData);

    } catch (error: any) {
      console.error('❌ Failed to create on-chain profile:', error);
      const msg: string = error.message || '';
      const isInsufficientBalance = msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('balance');
      setProfileError(
        isInsufficientBalance
          ? 'Insufficient SUI balance. Get testnet SUI from the faucet at faucet.testnet.sui.io, then try again.'
          : msg || 'Failed to create on-chain profile. Please try again.'
      );
    } finally {
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
