'use client'
import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { motion } from 'framer-motion';
import { IoWallet, IoRefresh, IoStatsChart, IoTrophy, IoGift, IoShare } from 'react-icons/io5';
import toast, { Toaster } from 'react-hot-toast';
import Image from 'next/image';

const EnhancedProfile: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Mock data
  const [userInfo, setUserInfo] = useState({
    alias: 'CryptoWizard',
    rank: '42',
    reputation: '95',
    totalPredictions: '156',
    correctPredictions: '112',
  });

  useEffect(() => {
    if (publicKey) {
      fetchBalance();
    } else {
      setBalance(null);
    }
  }, [publicKey, connection]);

  const fetchBalance = async () => {
    if (!publicKey) return;
    setIsLoading(true);
    try {
      const balance = await connection.getBalance(publicKey);
      setBalance(balance / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error('Error fetching balance:', error);
      toast.error('Failed to fetch balance');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-navy-900 dark:to-navy-900 p-4 sm:p-6 md:p-8">
      <Toaster />
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-navy-800 rounded-xl shadow-lg overflow-hidden">
          <div className="relative h-48 bg-gradient-to-r from-indigo-500 to-purple-600">
            <div className="absolute -bottom-16 left-1/2 transform -translate-x-1/2">
              <Image
                width={128}
                height={128}
                className="rounded-full border-4 border-white dark:border-gray-700"
                src={`https://robohash.org/${publicKey ? publicKey.toString() : 'default'}.png`}
                alt="User Avatar"
              />
            </div>
          </div>
          <div className="pt-20 px-6 pb-6">
            <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-2">
              {userInfo.alias}
            </h1>
            {publicKey ? (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6 break-all">
                {publicKey.toString()}
              </p>
            ) : (
              <div className="text-center mb-6">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2 px-4 text-sm sm:text-base flex items-center justify-center mx-auto transition-colors duration-200"
                >
                  <IoWallet className="mr-2" /> Connect Wallet
                </motion.button>
              </div>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
              <div className="bg-indigo-100 dark:bg-indigo-900 p-4 rounded-xl">
                <h2 className="text-lg font-semibold text-indigo-800 dark:text-indigo-200 mb-2">SOL Balance</h2>
                {isLoading ? (
                  <p className="text-indigo-600 dark:text-indigo-300">Loading...</p>
                ) : balance !== null ? (
                  <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{balance.toFixed(4)} SOL</p>
                ) : (
                  <p className="text-indigo-600 dark:text-indigo-300">Not available</p>
                )}
              </div>
              <div className="bg-purple-100 dark:bg-purple-900 p-4 rounded-xl">
                <h2 className="text-lg font-semibold text-purple-800 dark:text-purple-200 mb-2">CHIP Balance</h2>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">1,000 CHIP</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <IoTrophy className="text-3xl text-yellow-500 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Rank</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{userInfo.rank}</p>
              </div>
              <div className="text-center">
                <IoStatsChart className="text-3xl text-green-500 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Reputation</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{userInfo.reputation}</p>
              </div>
              <div className="text-center">
                <IoShare className="text-3xl text-blue-500 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Predictions</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{userInfo.totalPredictions}</p>
              </div>
              <div className="text-center">
                <IoGift className="text-3xl text-red-500 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Correct Predictions</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{userInfo.correctPredictions}</p>
              </div>
            </div>
            
            <div className="flex justify-center space-x-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={fetchBalance}
                className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2 px-4 text-sm sm:text-base flex items-center justify-center transition-colors duration-200"
              >
                <IoRefresh className="mr-2" /> Refresh Balance
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-green-500 hover:bg-green-600 text-white rounded-lg py-2 px-4 text-sm sm:text-base flex items-center justify-center transition-colors duration-200"
              >
                <IoGift className="mr-2" /> Claim Daily Reward
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedProfile;