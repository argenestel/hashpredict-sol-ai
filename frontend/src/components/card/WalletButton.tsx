import React, { useState, useEffect } from 'react';
import { useWallet, WalletReadyState } from '@aptos-labs/wallet-adapter-react';
import { IoWallet, IoClose, IoChevronDown, IoCheckmark, IoWarning, IoCopy } from 'react-icons/io5';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const TelegramIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#0088cc">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const WalletButton = ({ name, icon, onClick, special }) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`flex items-center justify-between w-full p-4 mb-3 bg-white dark:bg-navy-800 border ${special ? 'border-brand-500 dark:border-brand-400' : 'border-gray-200 dark:border-navy-700'} rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors`}
  >
    <div className="flex items-center">
      {typeof icon === 'string' ? (
        <img src={icon} alt={name} className="w-8 h-8 mr-3" />
      ) : (
        <div className="w-8 h-8 mr-3 flex items-center justify-center">
          {icon}
        </div>
      )}
      <span className="text-sm font-medium dark:text-white">{name}</span>
    </div>
    <span className={`text-sm ${special ? 'text-brand-500 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'} font-medium`}>Connect</span>
  </motion.button>
);
const WalletSelector = ({ onConnect }) => {
  const { connect, disconnect, account, network, wallets } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [availableWallets, setAvailableWallets] = useState([]);
  const [specialWallets, setSpecialWallets] = useState([]);

  useEffect(() => {
    const installed = wallets.filter((wallet) => wallet.readyState === WalletReadyState.Installed);
    
    const special = installed.filter(wallet => 
      wallet.name === 'Mizu Wallet' || wallet.name === 'Continue with Google'
    );
    const others = installed.filter(wallet => 
      wallet.name !== 'Mizu Wallet' && wallet.name !== 'Continue with Google'
    );

    setSpecialWallets(special);
    setAvailableWallets(others);
  }, [wallets]);

  useEffect(() => {
    if (account) {
      onConnect(true, account);
    } else {
      onConnect(false, null);
    }
  }, [account, onConnect]);

  const handleConnect = async (wallet) => {
    try {
      await connect(wallet.name);
      setIsOpen(false);
      toast.success(`Connected to ${wallet.name}`);
    } catch (error) {
      console.error('Failed to connect:', error);
      toast.error(`Failed to connect to ${wallet.name}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setIsOpen(false);
      toast.success('Wallet disconnected');
    } catch (error) {
      console.error('Failed to disconnect:', error);
      toast.error('Failed to disconnect wallet');
    }
  };

  const truncateAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Address copied to clipboard!');
    }, (err) => {
      toast.error('Failed to copy address');
    });
  };

  const getWalletIcon = (name) => {
    if (name === 'Mizu Wallet') return <TelegramIcon />;
    if (name === 'Continue with Google') return <GoogleIcon />;
    return null;
  };

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="flex items-center px-4 py-2 bg-brand-500 dark:bg-brand-400 text-white rounded-lg hover:bg-brand-600 dark:hover:bg-brand-500 transition-colors"
      >
        <IoWallet className="mr-2" />
        {account ? truncateAddress(account.address) : 'Connect Wallet'}
        <IoChevronDown className="ml-2" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center mt-40 pt-40 bg-black bg-opacity-50 z-50"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-navy-800 rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold dark:text-white">Wallet</h2>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsOpen(false)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <IoClose size={24} />
                </motion.button>
              </div>

              {account ? (
                <div className="space-y-4">
                  <div className="bg-gray-100 dark:bg-navy-700 p-4 rounded-lg">
                    {/* <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Connected with {account.}</p> */}
                    <div className="flex items-center justify-between">
                      <span className="font-medium dark:text-white">{truncateAddress(account.address)}</span>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => copyToClipboard(account.address)}
                        className="text-brand-500 dark:text-brand-400 hover:text-brand-600 dark:hover:text-brand-500"
                      >
                        <IoCopy size={20} />
                      </motion.button>
                    </div>
                  </div>
                  <div className="bg-gray-100 dark:bg-navy-700 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Network</p>
                    <p className="font-medium dark:text-white">{network.name}</p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleDisconnect}
                    className="w-full py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Disconnect
                  </motion.button>
                </div>
              ) : (
                <div>
                  <p className="mb-4 text-gray-600 dark:text-gray-300 text-center">Connect a wallet to get started</p>
                  
                  {/* Special Wallets Section */}
                  {specialWallets.map((wallet) => (
                    <WalletButton
                      key={wallet.name}
                      name={wallet.name === 'Mizu Wallet' ? 'Mizu Wallet (Telegram)' : wallet.name}
                      icon={getWalletIcon(wallet.name) || wallet.icon}
                      onClick={() => handleConnect(wallet)}
                      special={true}
                    />
                  ))}

                  {/* Separator */}
                  {availableWallets.length > 0 && specialWallets.length > 0 && (
                    <div className="my-4 border-t border-gray-200 dark:border-navy-700"></div>
                  )}

                  {/* Other Available Wallets Section */}
                  {availableWallets.map((wallet) => (
                    <WalletButton
                      key={wallet.name}
                      name={wallet.name}
                      icon={getWalletIcon(wallet.name) || wallet.icon}
                      onClick={() => handleConnect(wallet)}
                      special={false}
                    />
                  ))}

                  {availableWallets.length === 0 && specialWallets.length === 0 && (
                    <div className="text-center text-gray-500 dark:text-gray-400 p-4 bg-gray-100 dark:bg-navy-700 rounded-lg">
                      <IoWarning size={24} className="mx-auto mb-2" />
                      <p>No compatible wallets found. Please install a supported wallet.</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WalletSelector;