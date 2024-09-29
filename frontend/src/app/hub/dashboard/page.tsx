'use client'
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Aptos, AptosConfig, Network, MoveValue } from '@aptos-labs/ts-sdk';
import { motion, AnimatePresence } from 'framer-motion';
import { IoAdd, IoClose, IoDownload, IoLink, IoRefresh, IoBulb, IoWater } from 'react-icons/io5';
import PredictionCard from 'components/card/PredictionCard';
const MODULE_ADDRESS = '0xe5daef3712e9be57eee01a28e4b16997e89e0b446546d304d5ec71afc9d1bacd';
const config = new AptosConfig({ network: Network.DEVNET });
const aptos = new Aptos(config);
import toast, { Toaster } from "react-hot-toast";

interface PredictionData {
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
  prediction_type: number;
  options_count: number;
}

const Dashboard = () => {
  const [predictions, setPredictions] = useState<PredictionData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGeneratePopupOpen, setIsGeneratePopupOpen] = useState(false);
  const { account, connected, signAndSubmitTransaction } = useWallet();
  const [isAdminRole, setIsAdminRole] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const [generatedPredictions, setGeneratedPredictions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  const [newPrediction, setNewPrediction] = useState({
    description: '',
    duration: '',
    tags: '',
    prediction_type: 0,
    options_count: 2,
  });

  useEffect(() => {
    checkAdminRole();
    fetchPredictions();
  }, [account]);

  useEffect(() => {
    if (predictions.length > 0) {
      const tags = Array.from(new Set(predictions.flatMap(p => p.tags)));
      setAllTags(tags);
    }
  }, [predictions]);

  const checkAdminRole = async () => {
    if (connected && account) {
      try {
        const result = await aptos.view({
          payload: {
            function: `${MODULE_ADDRESS}::hashpredictalpha::get_admin`,
            typeArguments: [],
            functionArguments: []
          }
        });
        setIsAdminRole(result[0] === account.address);
      } catch (error) {
        console.error('Error checking admin role:', error);
      }
    }
  };

  const processMoveValue = (value: MoveValue): any => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    } else if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.map(processMoveValue);
      } else if ('value' in value) {
        return processMoveValue(value.value);
      } else {
        const processedObject: { [key: string]: any } = {};
        for (const key in value) {
          processedObject[key] = processMoveValue(value[key]);
        }
        return processedObject;
      }
    }
    return null;
  };

  const fetchPredictions = async () => {
    setIsLoading(true);
    try {
      const result = await aptos.view({
        payload: {
          function: `${MODULE_ADDRESS}::hashpredictalpha::get_all_predictions`,
          typeArguments: [],
          functionArguments: []
        }
      });
      console.log('Raw result:', JSON.stringify(result, null, 2));

      let predictionsArray = result;
      if (Array.isArray(result) && result.length === 1 && Array.isArray(result[0])) {
        predictionsArray = result[0];
      }

      if (!Array.isArray(predictionsArray)) {
        console.error('Expected an array of predictions, but received:', typeof predictionsArray);
        setPredictions([]);
        return;
      }

      const processedPredictions: PredictionData[] = predictionsArray.map((prediction: any, index: number) => {
        console.log(`Processing prediction ${index}:`, JSON.stringify(prediction, null, 2));
        
        try {
          return {
            id: prediction.id?.toString() ?? '',
            description: prediction.description?.toString() ?? '',
            end_time: prediction.end_time?.toString() ?? '',
            start_time: prediction.start_time?.toString() ?? '',
            state: { value: Number(prediction.state?.value ?? 0) },
            yes_votes: prediction.yes_votes?.toString() ?? '0',
            no_votes: prediction.no_votes?.toString() ?? '0',
            yes_price: prediction.yes_price?.toString() ?? '0',
            no_price: prediction.no_price?.toString() ?? '0',
            total_bet: prediction.total_bet?.toString() ?? '0',
            total_votes: prediction.total_votes?.toString() ?? '0',
            result: Number(prediction.result ?? 0),
            tags: prediction.tags?.map((tag: any) => tag.toString()) ?? [],
            prediction_type: Number(prediction.prediction_type ?? 0),
            options_count: Number(prediction.options_count ?? 2),
          };
        } catch (error) {
          console.error(`Error processing prediction ${index}:`, error);
          return null;
        }
      }).filter((prediction): prediction is PredictionData => prediction !== null);

      console.log('Final processed predictions:', JSON.stringify(processedPredictions, null, 2));
      setPredictions(processedPredictions);
    } catch (error) {
      console.error('Error fetching predictions:', error);
      setPredictions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestFunds = async () => {
    if (!connected || !account) {
      toast.error('Wallet not connected');
      return;
    }

    try {
      const response = await axios.post(process.env.NEXT_PUBLIC_FAUCET_URL + '/mint', null, {
        params: {
          amount: 10000000,
          address: account.address,
        },
      });
      toast.success('Funds requested successfully');
      console.log('Funds requested:', response.data);
    } catch (error) {
      toast.error('Error requesting funds. Please try again.');
      console.error('Error requesting funds:', error);
    }
  };

  const handlePredict = async (id: string, verdict: boolean, share: number, useChip: boolean) => {
    if (!connected || !account) {
      console.error('Wallet not connected');
      return;
    }

    try {
      await signAndSubmitTransaction({
        data: {
          function: `${MODULE_ADDRESS}::hashpredictalpha::predict`,
          typeArguments: [],
          functionArguments: [id, verdict, share, useChip]
        },
      });
      fetchPredictions();
    } catch (error) {
      console.error('Error making prediction:', error);
    }
  };

  const handleCreatePrediction = async () => {
    if (!connected || !account) {
      console.error('Wallet not connected');
      return;
    }

    try {
      let tags;
      if (typeof newPrediction.tags === 'string') {
        tags = newPrediction.tags.split(',').map(tag => tag.trim());
      } else if (Array.isArray(newPrediction.tags)) {
        tags = newPrediction.tags;
      } else {
        tags = [];
      }

      await signAndSubmitTransaction({
        data: {
          function: `${MODULE_ADDRESS}::hashpredictalpha::create_prediction`,
          typeArguments: [],
          functionArguments: [
            newPrediction.description,
            parseInt(newPrediction.duration),
            tags,
            newPrediction.prediction_type,
            newPrediction.options_count
          ]
        },
      });
      setIsModalOpen(false);
      fetchPredictions();
      setNewPrediction({
        description: '',
        duration: '',
        tags: '',
        prediction_type: 0,
        options_count: 2,
      });
    } catch (error) {
      console.error('Error creating prediction:', error);
      toast.error('Failed to create prediction. Please try again.');
    }
  };

  const handleSelectPrediction = (prediction: any) => {
    setNewPrediction({
      description: prediction.description,
      duration: prediction.duration.toString(),
      tags: prediction.tags,
      prediction_type: 0,
      options_count: 2,
    });
    setIsGeneratePopupOpen(false);
    setIsModalOpen(true);
  };

  const handleGeneratePredictions = async () => {
    setIsGenerating(true);
    try {
      const response = await axios.post(process.env.NEXT_PUBLIC_SERVER_URL + '/test/generate-predictions', { topic });
      setGeneratedPredictions(response.data.predictions);
      setIsGeneratePopupOpen(true);
    } catch (error) {
      console.error('Error generating predictions:', error);
    }
    setIsGenerating(false);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prevTags =>
      prevTags.includes(tag)
        ? prevTags.filter(t => t !== tag)
        : [...prevTags, tag]
    );
  };

  const filteredPredictions = predictions.filter(prediction => 
    selectedTags.length === 0 || prediction.tags.some(tag => selectedTags.includes(tag))
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-100 dark:bg-navy-900 min-h-screen">
    <Toaster />
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 space-y-4 sm:space-y-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy-700 dark:text-white mb-4 sm:mb-0">Prediction Dashboard</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRequestFunds}
            className="bg-blue-500 text-white rounded-lg py-2 px-3 text-sm flex items-center justify-center flex-grow sm:flex-grow-0"
          >
            <IoWater className="mr-1 sm:mr-2" /> <span className="hidden sm:inline">Request</span> Funds
          </motion.button>
          {isAdminRole && (
            <>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsModalOpen(true)}
                className="bg-green-500 text-white rounded-lg py-2 px-3 text-sm flex items-center justify-center flex-grow sm:flex-grow-0"
              >
                <IoAdd className="mr-1 sm:mr-2" /> Create
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsGeneratePopupOpen(true)}
                className="bg-purple-500 text-white rounded-lg py-2 px-3 text-sm flex items-center justify-center flex-grow sm:flex-grow-0"
              >
                <IoBulb className="mr-1 sm:mr-2" /> Generate
              </motion.button>
            </>
          )}
        </div>
      </div>

      {/* Tags filter */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-navy-700 dark:text-white mb-2">Filter by Tags:</h2>
        <div className="flex flex-wrap gap-2">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1 rounded-full text-sm ${
                selectedTags.includes(tag)
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="bg-white dark:bg-navy-800 rounded-xl shadow-lg p-4 sm:p-6 animate-pulse">
              <div className="h-6 bg-gray-200 dark:bg-navy-700 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-1/2 mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-1/3 mb-4"></div>
              <div className="h-20 bg-gray-200 dark:bg-navy-700 rounded mb-4"></div>
              <div className="h-10 bg-gray-200 dark:bg-navy-700 rounded"></div>
            </div>
          ))}
        </div>
      ) : filteredPredictions.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredPredictions.map((prediction) => (
            <PredictionCard
              key={prediction.id}
              prediction={prediction}
              onPredict={handlePredict}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <h2 className="text-xl sm:text-2xl font-bold text-navy-700 dark:text-white mb-4">No predictions available</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">Create a new prediction to get started!</p>
          {isAdminRole && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsModalOpen(true)}
              className="bg-green-500 text-white rounded-lg py-2 px-4 text-base sm:text-lg font-semibold flex items-center justify-center mx-auto"
            >
              <IoAdd className="mr-2" /> Create Prediction
            </motion.button>
          )}
        </div>
      )}
    </div>

    <AnimatePresence>
      {isModalOpen && (
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
            className="bg-white dark:bg-navy-800 rounded-lg p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-navy-700 dark:text-white">Create New Prediction</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <IoClose size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                value={newPrediction.description}
                onChange={(e) => setNewPrediction({...newPrediction, description: e.target.value})}
                placeholder="Prediction description"
                className="w-full p-2 border rounded dark:bg-navy-700 dark:text-white dark:border-navy-600"
              />
              <input
                type="number"
                value={newPrediction.duration}
                onChange={(e) => setNewPrediction({...newPrediction, duration: e.target.value})}
                placeholder="Duration in seconds"
                className="w-full p-2 border rounded dark:bg-navy-700 dark:text-white dark:border-navy-600"
              />
              <input
                type="text"
                value={newPrediction.tags}
                onChange={(e) => setNewPrediction({...newPrediction, tags: e.target.value})}
                placeholder="Tags (comma separated)"
                className="w-full p-2 border rounded dark:bg-navy-700 dark:text-white dark:border-navy-600"
              />
              <button
                onClick={handleCreatePrediction}
                className="w-full bg-brand-500 text-white rounded-lg py-2 px-4 hover:bg-brand-600 transition-colors"
              >
                Create Prediction
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {isGeneratePopupOpen && (
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
            className="bg-white dark:bg-navy-800 rounded-lg p-4 sm:p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-navy-700 dark:text-white">Generate AI Predictions</h2>
              <button onClick={() => setIsGeneratePopupOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <IoClose size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter a topic for predictions"
                className="w-full p-2 border rounded dark:bg-navy-700 dark:text-white dark:border-navy-600"
              />
              <button
                onClick={handleGeneratePredictions}
                disabled={isGenerating}
                className="w-full bg-purple-500 text-white rounded-lg py-2 px-4 hover:bg-purple-600 transition-colors disabled:bg-purple-300 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating...' : 'Generate Predictions'}
              </button>
              {generatedPredictions.map((prediction, index) => (
                <motion.div
                  key={index}
                  whileHover={{ scale: 1.02 }}
                  className="bg-gray-100 dark:bg-navy-700 p-4 rounded-lg cursor-pointer"
                  onClick={() => handleSelectPrediction(prediction)}
                >
                  <h3 className="font-bold text-navy-700 dark:text-white mb-2">{prediction.description}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Duration: {prediction.duration} seconds</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Tags: {prediction.tags.join(', ')}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
  );
};

export default Dashboard;