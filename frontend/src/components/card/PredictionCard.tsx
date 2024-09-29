import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { IoAdd, IoRemove, IoTimeOutline, IoWalletOutline, IoCheckmark, IoClose, IoCash, IoBulb, IoTrendingUp, IoTrendingDown, IoSwapHorizontal } from 'react-icons/io5';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import axios from 'axios';
import toast from 'react-hot-toast';

interface PredictionCardProps {
  prediction: {
    id: string;
    description: string;
    end_time: string;
    start_time: string;
    state: { value: number };
    yes_votes: string;
    no_votes: string;
    yes_price: string;
    no_price: string;
    total_bet: string;
    total_votes: string;
    result: number;
    tags: string[];
  };
  onPredict: (id: string, verdict: boolean, share: number, useChip: boolean) => void;
}

const MODULE_ADDRESS = '0xe5daef3712e9be57eee01a28e4b16997e89e0b446546d304d5ec71afc9d1bacd';
const config = new AptosConfig({ network: Network.DEVNET });
const aptos = new Aptos(config);

const CHIP_EXCHANGE_RATE = 100; // 100 CHIP = 1 APT

const PredictionCard: React.FC<PredictionCardProps> = ({ prediction, onPredict }) => {
  const [shareAmount, setShareAmount] = useState(1);
  const [isYesSelected, setIsYesSelected] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [outcome, setOutcome] = useState<number>(0);
  const [isAIFinalizing, setIsAIFinalizing] = useState(false);
  const { account, signAndSubmitTransaction } = useWallet();
  const [useChips, setUseChips] = useState(true);

  const [isPredictionEnded, setIsPredictionEnded] = useState(false);

  useEffect(() => {
    if (prediction) {
      setIsPredictionEnded(Date.now() / 1000 > Number(prediction.end_time));
    }
  }, [prediction]);

  useEffect(() => {
    checkAdminRole();
  }, [account]);

  const checkAdminRole = async () => {
    if (account) {
      try {
        const adminAddress = await aptos.view({
          payload: {
            function: `${MODULE_ADDRESS}::hashpredictalpha::get_admin`,
            typeArguments: [],
            functionArguments: []
          }
        });
        setIsAdmin(adminAddress[0] === account.address);
      } catch (error) {
        console.error('Error checking admin role:', error);
      }
    }
  };

  const [showUSD, setShowUSD] = useState(true);
  const [aptPrice, setAptPrice] = useState(0);

  useEffect(() => {
    fetchAptPrice();
  }, []);

  const fetchAptPrice = async () => {
    try {
      const response = await axios.get('https://hermes.pyth.network/api/latest_price_feeds', {
        params: {
          ids: ['0x03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5']
        }
      });
      const priceData = response.data[0].price;
      const price = Number(priceData.price) * Math.pow(10, priceData.expo);
      setAptPrice(price);
    } catch (error) {
      console.error('Error fetching APT price:', error);
      toast.error('Failed to fetch APT price');
    }
  };

  const formatPrice = (amount: string) => {
    const aptAmount = Number(amount) / 1e8;
    if (showUSD) {
      const usdAmount = aptAmount * aptPrice;
      return `$${usdAmount.toFixed(2)}`;
    } else {
      return `${aptAmount.toFixed(2)} APT`;
    }
  };
  
  const handleFinalize = async (useAI = false) => {
    if (!account) return;
    try {
      let finalOutcome;
      if (useAI) {
        setIsAIFinalizing(true);
        try {
          const response = await axios.post(process.env.NEXT_PUBLIC_SERVER_URL+`/finalize-prediction/${prediction.id}`);
          finalOutcome = response.data.outcome;
        } catch (error) {
          console.error('Error finalizing with AI:', error);
          setIsAIFinalizing(false);
          return;
        }
      } else {
        finalOutcome = outcome;
      }

      await signAndSubmitTransaction({
        data: {
          function: `${MODULE_ADDRESS}::hashpredictalpha::resolve_prediction`,
          typeArguments: [],
          functionArguments: [prediction.id, finalOutcome]
        },
      });
      
      console.log(`Prediction finalized ${useAI ? 'with AI' : 'by admin'}`);
    } catch (error) {
      console.error('Error finalizing prediction:', error);
    } finally {
      setIsAIFinalizing(false);
    }
  };

  const handleIncrement = () => setShareAmount(prev => prev + 1);
  const handleDecrement = () => setShareAmount(prev => Math.max(1, prev - 1));

  const handlePredict = () => {
    onPredict(prediction.id, isYesSelected, shareAmount, useChips);
  };

  const handleCancel = async () => {
    if (!account) return;
    try {
      await signAndSubmitTransaction({
        data: {
          function: `${MODULE_ADDRESS}::hashpredictalpha::pause_prediction`,
          typeArguments: [],
          functionArguments: [prediction.id]
        },
      });
    } catch (error) {
      console.error('Error cancelling prediction:', error);
    }
  };

  const handleDistributeRewards = async () => {
    if (!account) return;
    try {
      await signAndSubmitTransaction({
        data: {
          function: `${MODULE_ADDRESS}::hashpredictalpha::mass_withdraw`,
          typeArguments: [],
          functionArguments: [prediction.id]
        },
      });
    } catch (error) {
      console.error('Error distributing rewards:', error);
    }
  };

  const calculatePotentialPayout = (selectedYes: boolean) => {
    const betAmount = shareAmount * 1e8; // 1 share = 1 APT = 1e8 units
    const totalPool = Number(prediction.total_bet);
    const selectedPool = selectedYes ? Number(prediction.yes_votes) : Number(prediction.no_votes);
    
    if (totalPool === 0 || selectedPool === 0) return 0;

    // Calculate the payout based on the current voting distribution
    const payoutRatio = (totalPool * 0.95) / selectedPool; // 5% fee
    const potentialPayout = (betAmount * payoutRatio) / 1e8; // Convert back to APT

    return potentialPayout;
  };

  
  const formatTime = (timestamp: string) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  const calculatePercentage = (votes: string, total: string) => {
    const votesNum = Number(votes) || 0;
    const totalNum = Number(total) || 0;
    return totalNum > 0 ? (votesNum / totalNum) * 100 : 50;
  };

  const formatAPT = (amount: string) => {
    return (Number(amount) / 1e8).toFixed(2);
  };

  const { id, description, end_time, state, yes_votes, no_votes, yes_price, no_price, total_bet, total_votes, result, tags } = prediction;

  const yesPercentage = calculatePercentage(yes_votes, total_votes);
  const noPercentage = calculatePercentage(no_votes, total_votes);
  const stateValue = typeof state === 'object' && state !== null ? state.value : (typeof state === 'number' ? state : 0);

  const isActive = stateValue === 0;
  const isFinalized = stateValue === 2;
  const isCancelled = stateValue === 1;
  const totalApt = formatAPT(total_bet);

  const potentialPayout = calculatePotentialPayout(isYesSelected);

  return (
    <motion.div 
      className="bg-white dark:bg-navy-800 rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-2xl border border-gray-200 dark:border-navy-700 flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="p-6 flex-grow">
        <h2 className="text-2xl font-bold text-navy-700 dark:text-white mb-3 line-clamp-2">
          {description}
        </h2>
        <div className="flex flex-wrap items-center justify-between mb-6 text-sm text-gray-600 dark:text-gray-400 gap-2">
          <div className="flex items-center bg-gray-100 dark:bg-navy-700 rounded-full px-3 py-1">
            <IoTimeOutline className="mr-2 text-brand-500" />
            <span>Ends: {formatTime(end_time)}</span>
          </div>
          <div className="flex items-center bg-brand-100 dark:bg-brand-900 rounded-full px-3 py-1">
            <IoWalletOutline className="mr-2 text-brand-500" />
            <span className="font-semibold text-brand-700 dark:text-brand-300">
              Pool: {formatPrice(total_bet)}
            </span>
            <button 
              onClick={() => setShowUSD(!showUSD)} 
              className="ml-2 text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300"
            >
              <IoSwapHorizontal />
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {tags.map((tag, index) => (
            <span key={index} className="bg-gray-200 dark:bg-navy-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full text-xs">
              {tag}
            </span>
          ))}
        </div>
        
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <motion.span 
              className="text-sm font-medium text-green-500 dark:text-green-400 flex items-center"
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <IoTrendingUp className="mr-1" />
              Yes: {yesPercentage.toFixed(1)}%
            </motion.span>
            <motion.span 
              className="text-sm font-medium text-red-500 dark:text-red-400 flex items-center"
              initial={{ x: 10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <IoTrendingDown className="mr-1" />
              No: {noPercentage.toFixed(1)}%
            </motion.span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-navy-700 rounded-full h-3 overflow-hidden relative">
            <motion.div 
              className="absolute left-0 h-full rounded-full bg-gradient-to-r from-green-400 to-brand-500 dark:from-green-500 dark:to-brand-400"
              initial={{ width: 0 }}
              animate={{ width: `${yesPercentage}%` }}
              transition={{ duration: 0.5, delay: 0.2 }}
            />
            <motion.div 
              className="absolute right-0 h-full rounded-full bg-gradient-to-l from-red-400 to-brand-400 dark:from-red-500 dark:to-brand-300"
              initial={{ width: 0 }}
              animate={{ width: `${noPercentage}%` }}
              transition={{ duration: 0.5, delay: 0.2 }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 dark:text-gray-400 mb-6">
          <div className="bg-gray-50 dark:bg-navy-900 rounded-lg p-3">
            <p className="font-semibold mb-1">Yes Votes: {Number(yes_votes).toLocaleString()}</p>
            <p>Yes Price: {formatPrice(yes_price)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-navy-900 rounded-lg p-3">
            <p className="font-semibold mb-1">No Votes: {Number(no_votes).toLocaleString()}</p>
            <p>No Price: {formatPrice(no_price)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-navy-700 dark:text-white flex items-center text-sm font-medium">
            Status: 
            <span className={`ml-2 px-2 py-1 rounded-full ${
              isActive ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
              isFinalized ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100' :
              'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
            }`}>
              {isActive ? 'Active' : isFinalized ? 'Finalized' : 'Cancelled'}
            </span>
          </div>
          {isActive && (
            <div className="text-navy-700 dark:text-white flex items-center text-sm font-medium">
              Potential Payout: 
              <span className="ml-2 px-2 py-1 rounded-full bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100">
                {potentialPayout.toFixed(2)} APT
              </span>
            </div>
          )}
        </div>
        {isFinalized && (
          <p className="text-navy-700 dark:text-white mt-4 text-sm font-medium">
            Result: 
            <span className={`ml-2 px-2 py-1 rounded-full ${
              result === 0 ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
              result === 1 ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' :
              'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
            }`}>
              {result === 0 ? 'Yes' : result === 1 ? 'No' : 'Undefined'}
            </span>
          </p>
        )}
      </div>

      {isActive && !isPredictionEnded && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2 flex-grow">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsYesSelected(true)}
                className={`py-2 px-4 rounded-lg transition-colors duration-200 text-sm font-medium flex-1 ${
                  isYesSelected 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Yes
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsYesSelected(false)}
                className={`py-2 px-4 rounded-lg transition-colors duration-200 text-sm font-medium flex-1 ${
                  !isYesSelected 
                    ? 'bg-red-500 text-white' 
                    : 'bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                No
              </motion.button>
            </div>
          </div>
          <div className="flex items-center space-x-2 mb-4">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleDecrement}
              className="bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300 rounded-full p-2"
            >
              <IoRemove size={16} />
            </motion.button>
            <input 
              type="number" 
              value={shareAmount}
              onChange={(e) => setShareAmount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 text-center border dark:border-navy-600 rounded-lg py-2 bg-white dark:bg-navy-900 text-gray-700 dark:text-gray-300 text-sm"
            />
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleIncrement}
              className="bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300 rounded-full p-2"
            >
              <IoAdd size={16} />
            </motion.button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              ({useChips ? `${shareAmount * CHIP_EXCHANGE_RATE} CHIP` : formatPrice((shareAmount * 0.01 * 1e8).toString())})
            </span>
          </div>
          <div className="flex items-center space-x-2 mb-4">
            <label className="inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={useChips}
                onChange={() => setUseChips(!useChips)}
                className="form-checkbox h-5 w-5 text-brand-500 rounded border-gray-300 focus:ring-brand-500 dark:border-gray-600 dark:bg-navy-900 dark:focus:ring-brand-400"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Use CHIP tokens</span>
            </label>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePredict}
            className="w-full bg-gradient-to-r from-brand-400 to-brand-500 dark:from-brand-500 dark:to-brand-400 text-white rounded-lg py-3 px-4 transition-all duration-200 text-sm font-medium"
          >
            Predict
          </motion.button>
        </div>
      )}

      {isAdmin && isActive && isPredictionEnded && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center space-x-2">
              <select 
                value={outcome}
                onChange={(e) => setOutcome(parseInt(e.target.value))}
                className="flex-grow p-2 border rounded dark:bg-navy-700 dark:border-navy-600 text-sm"
              >
                <option value={0}>Yes</option>
                <option value={1}>No</option>
              </select>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleFinalize(false)}
                className="bg-blue-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center"
              >
                <IoCheckmark className="mr-1" /> Admin Finalize
              </motion.button>
            </div>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleFinalize(true)}
              disabled={isAIFinalizing}
              className="w-full bg-purple-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center"
            >
              {isAIFinalizing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Finalizing with AI...
                </>
              ) : (
                <>
                  <IoBulb className="mr-2" /> Finalize with AI
                </>
              )}
            </motion.button>
          </div>
        </div>
      )}

      {isAdmin && isActive && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCancel}
            className="w-full bg-red-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center"
          >
            <IoClose className="mr-2" /> Cancel Prediction
          </motion.button>
        </div>
      )}

      {isAdmin && isFinalized && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDistributeRewards}
            className="w-full bg-green-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center"
          >
            <IoCash className="mr-2" /> Distribute Rewards
          </motion.button>
        </div>
      )}
      {isPredictionEnded && !isFinalized && !isAdmin && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <div className="text-center text-sm font-medium text-gray-600 dark:text-gray-400">
            <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100 px-2 py-1 rounded-full">
              This prediction has ended and is awaiting finalization
            </span>
          </div>
        </div>
      )}
      {(isFinalized || isCancelled) && !isAdmin && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <div className="text-center text-sm font-medium text-gray-600 dark:text-gray-400">
            {isFinalized ? (
              <span className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 px-2 py-1 rounded-full">
                This prediction has been finalized
              </span>
            ) : (
              <span className="bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100 px-2 py-1 rounded-full">
                This prediction has been cancelled
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default PredictionCard;