# MemeFlow Network Setup Guide

## Current Deployment Status

MemeFlow contracts are currently deployed on **Sui Devnet** with the following addresses:

- **Package ID**: `0x5e60863e57204f2a2635fe799ab4e5b792ba6d487d1eaf723abecfa7ee49a19f`
- **Profile Registry ID**: `0xe5e152b3e6c7a29472007cfc40590cb0ea5d6317b2ebcc8ed7072a4c731fa265`
- **Factory ID**: `0x415f3576fdb53312e721ab4f520fd74767470431db3b8d369b195edb817d28d4`
- **Network**: Devnet
- **RPC URL**: `https://fullnode.devnet.sui.io:443`

## Wallet Configuration Required

### ⚠️ Important: Your Sui wallet must be connected to Devnet

If you see the error:
```
Package object does not exist with ID 0x5e60863e57204f2a2635fe799ab4e5b792ba6d487d1eaf723abecfa7ee49a19f
```

This means your wallet is connected to a different network (likely Testnet or Mainnet).

## How to Switch Your Wallet to Devnet

### For Sui Wallet Extension:
1. Open your Sui Wallet browser extension
2. Click on the network selector (usually shows "Mainnet" or "Testnet" at the top)
3. Select **"Devnet"** from the dropdown
4. The wallet should now show "Devnet" as the active network
5. Refresh the MemeFlow application page

### For Suiet Wallet:
1. Open Suiet wallet extension
2. Click on the gear/settings icon
3. Find "Network" settings
4. Switch to **"Devnet"**
5. Close settings and refresh the application

### For Ethos Wallet:
1. Open Ethos wallet
2. Click on the menu (three lines)
3. Go to Settings
4. Select Network
5. Choose **"Devnet"**
6. Refresh the application

## Getting Devnet SUI Tokens

Once connected to Devnet, you'll need some test SUI tokens:

1. Copy your wallet address
2. Visit the Sui Devnet Faucet: https://faucet.devnet.sui.io
3. Paste your address and request tokens
4. You should receive 10 SUI for testing

## Application Network Configuration

The application is configured via environment variables. Make sure your `.env` file has:

```env
VITE_NETWORK=devnet
```

## Checking Your Current Network

You can verify your setup by:

1. Opening the browser console (F12)
2. Looking for logs that show:
   - `Profile - Current network: devnet`
   - `Creating profile with: { network: "devnet", packageId: "0x5e60..." }`

## Troubleshooting

### Issue: "Contracts not deployed on this network"
**Solution**: The contracts are only deployed on Devnet. Switch your wallet to Devnet.

### Issue: "Package object does not exist"
**Solution**: Your wallet is on the wrong network. Follow the wallet switching steps above.

### Issue: No SUI balance on Devnet
**Solution**: Use the faucet link above to get free test tokens.

## Future Network Deployments

Currently, MemeFlow is only deployed on Devnet for testing. Future deployments:

- **Testnet**: Planned (requires deployment)
- **Mainnet**: Coming soon (after thorough testing)

To deploy on other networks:
```bash
# Deploy to testnet (requires funded wallet)
npm run contract:deploy:testnet

# Deploy to mainnet (requires funded wallet)
npm run contract:deploy:mainnet
```

## Development Tips

1. Always ensure your wallet and application are on the same network
2. The application shows the current network in the Profile page
3. Network warnings will appear when configuration issues are detected
4. Check browser console for detailed network information

## Support

If you continue to experience network issues:

1. Clear your browser cache
2. Disconnect and reconnect your wallet
3. Ensure you're using a supported wallet (Sui Wallet, Suiet, or Ethos)
4. Check that the application is running on the correct port (usually http://localhost:5173)
