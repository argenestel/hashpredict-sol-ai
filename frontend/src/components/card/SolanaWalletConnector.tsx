import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { IoWallet, IoClose, IoChevronDown, IoCopy, IoWarning } from 'react-icons/io5';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

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

const SolanaWalletSelector = ({ onConnect }) => {
  const { select, disconnect, publicKey, wallet, wallets } = useWallet();
  const { connection } = useConnection();
  const [isOpen, setIsOpen] = useState(false);
  const [availableWallets, setAvailableWallets] = useState([]);
  const [network, setNetwork] = useState('');
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    const installed = wallets.filter((wallet) => 
      wallet.readyState === WalletReadyState.Installed || 
      wallet.adapter.name === 'Burner Wallet'
    );
    setAvailableWallets(installed);

    // Log all wallet names
    console.log('All available wallets:', wallets.map(wallet => wallet.adapter.name));
    console.log('Installed wallets:', installed.map(wallet => wallet.adapter.name));
  }, [wallets]);

  useEffect(() => {
    if (publicKey) {
      onConnect(true, publicKey.toString());
      fetchBalance();
    } else {
      onConnect(false, null);
      setBalance(null);
    }
  }, [publicKey, onConnect, connection]);

  useEffect(() => {
    const getNetworkName = async () => {
      try {
        const genesisHash = await connection.getGenesisHash();
        let networkName;
        switch (genesisHash) {
          case '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':
            networkName = 'Mainnet Beta';
            break;
          case 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG':
            networkName = 'Testnet';
            break;
          case '8E9rvCKLFQia2Y35HXjjpWzj8weVo44K9vzSaXuHiC3c':
            networkName = 'Devnet';
            break;
          default:
            networkName = 'Unknown';
        }
        setNetwork(networkName);
      } catch (error) {
        console.error('Failed to get network:', error);
        setNetwork('Unknown');
      }
    };

    getNetworkName();
  }, [connection]);

  const fetchBalance = async () => {
    if (publicKey && connection) {
      try {
        const balance = await connection.getBalance(publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      } catch (error) {
        console.error('Failed to fetch balance:', error);
        setBalance(null);
      }
    }
  };

  const handleConnect = async (wallet) => {
    try {
      await select(wallet.adapter.name);
      setIsOpen(false);
      toast.success(`Connected to ${wallet.adapter.name}`);
    } catch (error) {
      console.error('Failed to connect:', error);
      toast.error(`Failed to connect to ${wallet.adapter.name}`);
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

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="flex items-center px-4 py-2 bg-brand-500 dark:bg-brand-400 text-white rounded-lg hover:bg-brand-600 dark:hover:bg-brand-500 transition-colors"
      >
        <IoWallet className="mr-2" />
        {publicKey ? truncateAddress(publicKey.toString()) : 'Connect Wallet'}
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

              {publicKey ? (
                <div className="space-y-4">
                  <div className="bg-gray-100 dark:bg-navy-700 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium dark:text-white">{truncateAddress(publicKey.toString())}</span>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => copyToClipboard(publicKey.toString())}
                        className="text-brand-500 dark:text-brand-400 hover:text-brand-600 dark:hover:text-brand-500"
                      >
                        <IoCopy size={20} />
                      </motion.button>
                    </div>
                  </div>
                  <div className="bg-gray-100 dark:bg-navy-700 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Network</p>
                    <p className="font-medium dark:text-white">{network}</p>
                  </div>
                  <div className="bg-gray-100 dark:bg-navy-700 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Balance</p>
                    <p className="font-medium dark:text-white">
                      {balance !== null ? `${balance.toFixed(4)} SOL` : 'Loading...'}
                    </p>
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
                  
                  {availableWallets.map((wallet) => (
                    <WalletButton
                      key={wallet.adapter.name}
                      name={wallet.adapter.name}
                      icon={wallet.adapter.icon}
                      onClick={() => handleConnect(wallet)}
                      special={wallet.adapter.name === 'UnsafeBurnerWallet'}
                    />
                  ))}

                  {availableWallets.length === 0 && (
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

export default SolanaWalletSelector;