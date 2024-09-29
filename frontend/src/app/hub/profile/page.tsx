'use client'
import React, { useState, useEffect } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Aptos, AptosConfig, Network, MoveValue } from '@aptos-labs/ts-sdk';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose, IoRefresh, IoAdd, IoWallet, IoStatsChart, IoTrophy, IoGift, IoShare, IoCopy } from 'react-icons/io5';
import toast, { Toaster } from "react-hot-toast";
import Image from 'next/image';
const MODULE_ADDRESS = '0xe5daef3712e9be57eee01a28e4b16997e89e0b446546d304d5ec71afc9d1bacd';
const config = new AptosConfig({ network: Network.DEVNET });
const aptos = new Aptos(config);

interface UserInfo {
  alias: string;
  apt_balance: string;
  chip_balance: string;
  rank: string;
  reputation: string;
  total_predictions: string;
  correct_predictions: string;
}

interface PredictionEntry {
  prediction_id: string;
  amount: string;
  is_chip: boolean;
  verdict: boolean;
  outcome: boolean;
}

interface DailyClaimInfo {
  lastClaimTime: string;
  currentStreak: string;
}

const Profile = () => {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [predictions, setPredictions] = useState<PredictionEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const { account, connected, signAndSubmitTransaction } = useWallet();
  const [isLoading, setIsLoading] = useState(true);
  const [userExists, setUserExists] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dailyClaimInfo, setDailyClaimInfo] = useState<DailyClaimInfo | null>(null);
  const [referrals, setReferrals] = useState<string[]>([]);
  const [referralCode, setReferralCode] = useState('');
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);
  const [userReferralCode, setUserReferralCode] = useState('');
  const [isReferralCodeUsed, setIsReferralCodeUsed] = useState(false);
  useEffect(() => {
    if (connected && account) {
      checkUserExists();
      fetchDailyClaimInfo();
      fetchReferrals();
    } else {
      setIsLoading(false);
      setUserExists(false);
      setUserInfo(null);
      setPredictions([]);
      setErrorMessage(null);
      setDailyClaimInfo(null);
      setReferrals([]);
    }
  }, [account, connected]);

  const generateReferralCode = async () => {
    if (!connected || !account) {
      toast.error('Wallet not connected');
      return;
    }

    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      await signAndSubmitTransaction({
        data: {
          function: `${MODULE_ADDRESS}::reward_system::generate_referral_code`,
          typeArguments: [],
          functionArguments: [code]
        },
      });
      setUserReferralCode(code);
      toast.success('Referral code generated successfully');
    } catch (error) {
      console.error('Error generating referral code:', error);
      toast.error('Failed to generate referral code');
    }
  };
  const copyReferralCode = () => {
    navigator.clipboard.writeText(userReferralCode);
    toast.success('Referral code copied to clipboard');
  };
  const checkUserExists = async () => {
    if (!account) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      console.log('Checking if user exists for address:', account.address);
      const result = await aptos.view({
        payload: {
          function: `${MODULE_ADDRESS}::user_account::has_claimed_account`,
          typeArguments: [],
          functionArguments: [account.address]
        }
      });
      console.log('User exists result:', result);
      setUserExists(result[0]);
      if (result[0]) {
        await fetchUserInfo();
        await fetchUserPredictions();
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error checking user existence:', error);
      setErrorMessage('Failed to check user account. Please try again.');
      setIsLoading(false);
    }
  };

  const fetchUserInfo = async () => {
    if (!account) return;
    try {
      console.log('Fetching user info for address:', account.address);
      const result = await aptos.view({
        payload: {
          function: `${MODULE_ADDRESS}::user_account::get_user_info`,
          typeArguments: [],
          functionArguments: [account.address]
        }
      });
      console.log('User info result:', result);
      setUserInfo({
        alias: result[0].toString(),
        apt_balance: (Number(result[1])/1e8).toString(),
        chip_balance: (Number(result[2])/1e8).toString(),
        rank: result[3].toString(),
        reputation: result[4].toString(),
        total_predictions: result[5].toString(),
        correct_predictions: result[6].toString(),
      });
    } catch (error) {
      console.error('Error fetching user info:', error);
      setErrorMessage('Failed to fetch user information. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };


  const fetchDailyClaimInfo = async () => {
    if (!account) return;
    try {
      const response = await fetch(`http://localhost:4000/get-daily-claim-info/${account.address}`);
      const data = await response.json();
      setDailyClaimInfo(data);
    } catch (error) {
      console.error('Error fetching daily claim info:', error);
      toast.error('Failed to fetch daily claim information');
    }
  };

  const fetchReferrals = async () => {
    if (!account) return;
    try {
      const response = await fetch(`http://localhost:4000/get-referrals/${account.address}`);
      const data = await response.json();
      setReferrals(data.referrals);
    } catch (error) {
      console.error('Error fetching referrals:', error);
      toast.error('Failed to fetch referrals');
    }
  };

  const handleClaimDailyReward = async () => {
    if (!connected || !account) {
      toast.error('Wallet not connected');
      return;
    }

    try {
      const response = await fetch('http://localhost:4000/claim-daily-reward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userAddress: account.address }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Daily reward claimed successfully');
        await fetchUserInfo();
        await fetchDailyClaimInfo();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error claiming daily reward:', error);
      toast.error('Failed to claim daily reward');
    }
  };

  const handleUseReferralCode = async () => {
    if (!connected || !account) {
      toast.error('Wallet not connected');
      return;
    }

    try {
      const response = await fetch('http://localhost:4000/use-referral-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userAddress: account.address, referralCode }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Referral code used successfully');
        await fetchUserInfo();
        setIsReferralModalOpen(false);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error using referral code:', error);
      toast.error('Failed to use referral code');
    }
  };

  const fetchUserPredictions = async () => {
    if (!account) return;
    try {
      console.log('Fetching user predictions for address:', account.address);
      const result = await aptos.view({
        payload: {
          function: `${MODULE_ADDRESS}::user_account::get_user_predictions`,
          typeArguments: [],
          functionArguments: [account.address]
        }
      });
      console.log('User predictions result:', result);
      setPredictions(result[0].map((prediction: any) => ({
        prediction_id: prediction.prediction_id.toString(),
        amount: (Number(prediction.amount)/1e8).toString(),
        is_chip: prediction.is_chip,
        verdict: prediction.verdict,
        outcome: prediction.outcome,
      })));
    } catch (error) {
      console.error('Error fetching user predictions:', error);
      toast.error('Failed to fetch user predictions');
    }
  };

  const handleUpdateBalances = async () => {
    if (!connected || !account) {
      toast.error('Wallet not connected');
      return;
    }

    try {
      await signAndSubmitTransaction({
        data: {
          function: `${MODULE_ADDRESS}::user_account::update_balances`,
          typeArguments: [],
          functionArguments: []
        },
      });
      toast.success('Balances updated successfully');
      await fetchUserInfo();
    } catch (error) {
      console.error('Error updating balances:', error);
      toast.error('Failed to update balances');
    }
  };

  const handleCreateOrChangeAlias = async () => {
    if (!connected || !account) {
      toast.error('Wallet not connected');
      return;
    }

    try {
      console.log('Creating/changing alias for address:', account.address);
      await signAndSubmitTransaction({
        data: {
          function: `${MODULE_ADDRESS}::user_account::register_user`,
          typeArguments: [],
          functionArguments: [newAlias]
        },
      });
      toast.success(userExists ? 'Alias changed successfully' : 'Account created successfully');
      await checkUserExists();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error creating/changing alias:', error);
      toast.error(userExists ? 'Failed to change alias' : 'Failed to create account');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br bg-blue-50  dark:bg-navy-900 p-4 sm:p-6 md:p-8">
      <Toaster />
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-indigo-900 dark:text-indigo-100 mb-6 text-center">User Profile</h1>

        {isLoading ? (
          <LoadingSkeleton />
        ) : errorMessage ? (
          <ErrorMessage message={errorMessage} />
        ) : userExists && userInfo ? (
          <UserProfile
            userInfo={userInfo}
            dailyClaimInfo={dailyClaimInfo}
            referrals={referrals}
            predictions={predictions}
            handleUpdateBalances={handleUpdateBalances}
            handleClaimDailyReward={handleClaimDailyReward}
            setIsModalOpen={setIsModalOpen}
            setIsReferralModalOpen={setIsReferralModalOpen}
            generateReferralCode={generateReferralCode}
            copyReferralCode={copyReferralCode}
            userReferralCode={userReferralCode}
            isReferralCodeUsed={isReferralCodeUsed}
          />
        ) : connected ? (
          <CreateAccount setIsModalOpen={setIsModalOpen} />
        ) : (
          <ConnectWallet />
        )}
      </div>

      <AliasModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        newAlias={newAlias}
        setNewAlias={setNewAlias}
        handleCreateOrChangeAlias={handleCreateOrChangeAlias}
        userExists={userExists}
      />

      <ReferralModal
        isOpen={isReferralModalOpen}
        onClose={() => setIsReferralModalOpen(false)}
        referralCode={referralCode}
        setReferralCode={setReferralCode}
        handleUseReferralCode={handleUseReferralCode}
        isReferralCodeUsed={isReferralCodeUsed}
      />
    </div>
  );
};

const LoadingSkeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg"></div>
    <div className="h-32 bg-white dark:bg-gray-800 rounded-xl shadow-lg"></div>
  </div>
);

const ErrorMessage = ({ message }) => (
  <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-lg" role="alert">
    <p className="font-bold">Error</p>
    <p>{message}</p>
  </div>
);

const UserProfile = ({
  userInfo,
  dailyClaimInfo,
  referrals,
  predictions,
  handleUpdateBalances,
  handleClaimDailyReward,
  setIsModalOpen,
  setIsReferralModalOpen,
  generateReferralCode,
  copyReferralCode,
  userReferralCode,
  isReferralCodeUsed
}) => (
  <div className="space-y-6">
    <ProfileHeader userInfo={userInfo} setIsModalOpen={setIsModalOpen} />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <BalanceCard userInfo={userInfo} handleUpdateBalances={handleUpdateBalances} />
      <StatsCard userInfo={userInfo} />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <DailyRewardCard dailyClaimInfo={dailyClaimInfo} handleClaimDailyReward={handleClaimDailyReward} />
      <ReferralsCard
        referrals={referrals}
        generateReferralCode={generateReferralCode}
        copyReferralCode={copyReferralCode}
        userReferralCode={userReferralCode}
        isReferralCodeUsed={isReferralCodeUsed}
        setIsReferralModalOpen={setIsReferralModalOpen}
      />
    </div>
    <PredictionsTable predictions={predictions} />
  </div>
);

const ProfileHeader = ({ userInfo, setIsModalOpen }) => (
  <div className="bg-white dark:bg-navy-800 rounded-xl shadow-lg overflow-hidden">
    <div className="relative h-32 sm:h-48 bg-gradient-to-r from-indigo-500 to-purple-600 dark:bg-navy-800">
      <div className="absolute -bottom-16 left-1/2 transform -translate-x-1/2">
        <Image
          width={96}
          height={96}
          className="rounded-full border-4 border-white dark:border-gray-700"
          src={`https://robohash.org/${userInfo.alias}.png`}
          alt="User Avatar"
        />
      </div>
    </div>
    <div className="pt-20 px-4 sm:px-6 pb-6 text-center">
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">{userInfo.alias}</h2>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsModalOpen(true)}
        className="mt-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2 px-4 text-sm sm:text-base inline-flex items-center justify-center transition-colors duration-200"
      >
        <IoRefresh className="mr-2" /> Change Alias
      </motion.button>
    </div>
  </div>
);

const BalanceCard = ({ userInfo, handleUpdateBalances }) => (
  <div className="bg-white dark:bg-navy-800 rounded-xl shadow-lg p-6">
    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Balances</h3>
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-indigo-100 dark:bg-indigo-900 p-4 rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-indigo-600 dark:text-indigo-300">APT Balance</p>
            <p className="text-xl font-semibold text-indigo-900 dark:text-indigo-100">{userInfo.apt_balance}</p>
          </div>
          <IoWallet className="text-3xl text-indigo-500" />
        </div>
      </div>
      <div className="bg-purple-100 dark:bg-purple-900 p-4 rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-purple-600 dark:text-purple-300">CHIP Balance</p>
            <p className="text-xl font-semibold text-purple-900 dark:text-purple-100">{userInfo.chip_balance}</p>
          </div>
          <IoStatsChart className="text-3xl text-purple-500" />
        </div>
      </div>
    </div>
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleUpdateBalances}
      className="mt-4 w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2 px-4 text-sm sm:text-base flex items-center justify-center transition-colors duration-200"
    >
      <IoRefresh className="mr-2" /> Update Balances
    </motion.button>
  </div>
);

const StatsCard = ({ userInfo }) => (
  <div className="bg-white dark:bg-navy-800 rounded-xl shadow-lg p-6">
    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Statistics</h3>
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-green-100 dark:bg-green-900 p-4 rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-green-600 dark:text-green-300">Rank</p>
            <p className="text-xl font-semibold text-green-900 dark:text-green-100">{userInfo.rank}</p>
          </div>
          <IoTrophy className="text-3xl text-green-500" />
        </div>
      </div>
      <div className="bg-yellow-100 dark:bg-yellow-900 p-4 rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-yellow-600 dark:text-yellow-300">Reputation</p>
            <p className="text-xl font-semibold text-yellow-900 dark:text-yellow-100">{userInfo.reputation}</p>
          </div>
          <IoStatsChart className="text-3xl text-yellow-500" />
        </div>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-4">
      <div className="text-center">
        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{userInfo.total_predictions}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">Total Predictions</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{userInfo.correct_predictions}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">Correct Predictions</p>
      </div>
    </div>
  </div>
);

const DailyRewardCard = ({ dailyClaimInfo, handleClaimDailyReward }) => (
  <div className="bg-white dark:bg-navy-800 rounded-xl shadow-lg p-6">
    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Daily Reward</h3>
    {dailyClaimInfo ? (
      <>
        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Last Claim: {new Date(parseInt(dailyClaimInfo.lastClaimTime) * 1000).toLocaleString()}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Current Streak: {dailyClaimInfo.currentStreak} days
          </p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700 mb-4">
          <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${(dailyClaimInfo.currentStreak % 7) * 100 / 7}%` }}></div>
        </div>
        {new Date(parseInt(dailyClaimInfo.lastClaimTime) * 1000).getDate() !== new Date().getDate() ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleClaimDailyReward}
            className="w-full bg-green-500 hover:bg-green-600 text-white rounded-lg py-2 px-4 text-sm sm:text-base flex items-center justify-center transition-colors duration-200"
          >
            <IoGift className="mr-2" /> Claim Daily Reward
          </motion.button>
        ) : (
          <p className="text-center text-sm sm:text-base text-gray-500 dark:text-gray-400">Daily reward already claimed</p>
        )}
      </>
    ) : (
      <p className="text-sm text-gray-600 dark:text-gray-400">Loading claim info...</p>
    )}
  </div>
);

const ReferralsCard = ({
  referrals,
  generateReferralCode,
  copyReferralCode,
  userReferralCode,
  isReferralCodeUsed,
  setIsReferralModalOpen
}) => (
  <div className="bg-white dark:bg-navy-800 rounded-xl shadow-lg p-6">
    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Referrals</h3>
    <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4">
      Total Referrals: {referrals.length}
    </p>
    {userReferralCode ? (
      <div className="mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Your Referral Code:</p>
        <div className="flex items-center">
          <input
            type="text"
            value={userReferralCode}
            readOnly
            className="flex-grow p-2 border rounded-l-lg text-sm sm:text-base dark:bg-gray-700 dark:text-white dark:border-gray-600"
          />
          <button
            onClick={copyReferralCode}
            className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-r-lg p-2 transition-colors duration-200"
          >
            <IoCopy size={20} />
          </button>

          </div>
      </div>
    ) : (
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={generateReferralCode}
        className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2 px-4 text-sm sm:text-base flex items-center justify-center mb-4 transition-colors duration-200"
      >
        <IoShare className="mr-2" /> Generate Referral Code
      </motion.button>
    )}
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => setIsReferralModalOpen(true)}
      disabled={isReferralCodeUsed}
      className={`w-full ${isReferralCodeUsed ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white rounded-lg py-2 px-4 text-sm sm:text-base flex items-center justify-center transition-colors duration-200`}
    >
      <IoShare className="mr-2" /> {isReferralCodeUsed ? 'Referral Code Used' : 'Use Referral Code'}
    </motion.button>
  </div>
);

const PredictionsTable = ({ predictions }) => (
  <div className="bg-white dark:bg-navy-800 rounded-xl shadow-lg overflow-hidden">
    <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Your Predictions</h3>
    </div>
    {predictions.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">ID</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Verdict</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
            {predictions.map((prediction, index) => (
              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-4 py-2 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400">{prediction.prediction_id}</td>
                <td className="px-4 py-2 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400">{prediction.amount}</td>
                <td className="px-4 py-2 whitespace-nowrap text-xs sm:text-sm">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${prediction.is_chip ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                    {prediction.is_chip ? 'CHIP' : 'APT'}
                  </span>
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400">{prediction.verdict ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2 whitespace-nowrap text-xs sm:text-sm">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${prediction.outcome ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {prediction.outcome ? 'Correct' : 'Incorrect'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="text-center py-8">
        <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No predictions made yet</h3>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4">Start making predictions to see them here!</p>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2 px-4 text-sm sm:text-base flex items-center justify-center mx-auto transition-colors duration-200"
        >
          <IoAdd className="mr-2" /> Make a Prediction
        </motion.button>
      </div>
    )}
  </div>
);

const CreateAccount = ({ setIsModalOpen }) => (
  <div className="text-center py-8 bg-white dark:bg-navy-800 rounded-xl shadow-lg">
    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">No user account found</h2>
    <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4">Create your account to start using the platform</p>
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => setIsModalOpen(true)}
      className="bg-green-500 hover:bg-green-600 text-white rounded-lg py-2 px-4 text-sm sm:text-base font-semibold flex items-center justify-center mx-auto transition-colors duration-200"
    >
      <IoAdd className="mr-2" /> Create Account
    </motion.button>
  </div>
);

const ConnectWallet = () => (
  <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Wallet not connected</h2>
    <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4">Connect your wallet to view or create your profile</p>
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2 px-4 text-sm sm:text-base font-semibold flex items-center justify-center mx-auto transition-colors duration-200"
    >
      <IoWallet className="mr-2" /> Connect Wallet
    </motion.button>
  </div>
);

const AliasModal = ({ isOpen, onClose, newAlias, setNewAlias, handleCreateOrChangeAlias, userExists }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white dark:bg-navy-800 rounded-xl p-6 w-full max-w-sm"
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {userExists ? 'Change Alias' : 'Create Account'}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <IoClose size={24} />
            </button>
          </div>
          <div className="space-y-4">
            <input
              type="text"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder={userExists ? 'New Alias' : 'Choose an Alias'}
              className="w-full p-2 border rounded-lg text-sm sm:text-base dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCreateOrChangeAlias}
              className="w-full bg-indigo-500 hover:bg-indigo-800 text-white rounded-lg py-2 px-4 text-sm sm:text-base font-semibold transition-colors duration-200"
            >
              {userExists ? 'Change Alias' : 'Create Account'}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

const ReferralModal = ({ isOpen, onClose, referralCode, setReferralCode, handleUseReferralCode, isReferralCodeUsed }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white dark:bg-navy-800 rounded-xl p-6 w-full max-w-sm"
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Use Referral Code
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <IoClose size={24} />
            </button>
          </div>
          <div className="space-y-4">
            <input
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="Enter referral code"
              className="w-full p-2 border rounded-lg text-sm sm:text-base dark:bg-gray-700 dark:text-white dark:border-gray-600"
              disabled={isReferralCodeUsed}
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                handleUseReferralCode();
                onClose();
              }}
              disabled={isReferralCodeUsed}
              className={`w-full ${isReferralCodeUsed ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600'} text-white rounded-lg py-2 px-4 text-sm sm:text-base font-semibold transition-colors duration-200`}
            >
              {isReferralCodeUsed ? 'Referral Code Used' : 'Use Referral Code'}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default Profile;