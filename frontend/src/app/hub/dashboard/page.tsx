'use client'
import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@project-serum/anchor';
import { motion, AnimatePresence } from 'framer-motion';
import { IoAdd, IoClose, IoChevronDown, IoCopy, IoWarning, IoBulb, IoWater, IoRefresh, IoFilter } from 'react-icons/io5';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';

import idl from '../../../predictionmarketidl.json';
import PredictionCard from 'components/card/PredictionCard';

const PROGRAM_ID = new PublicKey("J4bMC3qvhsjSDJojvVGUt1tzvm6xzk6R2hhUnwDSzH7s");
const MARKET_STATE_PDA = new PublicKey("CySirkQdQbfQzBj3Wgk1Qt7BRU25hV6DiSWxhi7xs9JL");


interface PredictionData {
  publicKey: PublicKey;
  account: {
    id: string;
    state: { active: {} } | { paused: {} } | { resolved: {} };
    description: string;
    startTime: string;
    endTime: string;
    totalVotes: string;
    yesVotes: string;
    noVotes: string;
    yesAmount: string;
    noAmount: string;
    result: { undefined: {} } | { true: {} } | { false: {} };
    totalAmount: string;
    predictionType: number;
    optionsCount: number;
    tags: string[];
    pendingClaims: { user: PublicKey; amount: BN }[];
  };
}

const SolanaPredictionDashboard: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [predictions, setPredictions] = useState<PredictionData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGeneratePopupOpen, setIsGeneratePopupOpen] = useState(false);
  const [isAdminRole, setIsAdminRole] = useState(false);
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
  const [topic, setTopic] = useState('');
  const [generatedPredictions, setGeneratedPredictions] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const provider = new AnchorProvider(connection, wallet as any, {});
  const program = new Program(idl as any, PROGRAM_ID, provider);

  useEffect(() => {
    fetchPredictions();
  }, [connection]);

  useEffect(() => {
    if (wallet.publicKey) {
      checkAdminRole();
    }
  }, [wallet.publicKey, connection]);

  useEffect(() => {
    if (predictions.length > 0) {
      const tags = Array.from(new Set(predictions.flatMap(p => p.account.tags)));
      setAllTags(tags);
    }
  }, [predictions]);

  const checkAdminRole = async () => {
    if (wallet.publicKey) {
      try {
        const marketState = await program.account.marketState.fetch(MARKET_STATE_PDA);
        setIsAdminRole(marketState.admin.equals(wallet.publicKey));
      } catch (error) {
        console.error('Error checking admin role:', error);
      }
    }
  };

  const fetchPredictions = async () => {
    setIsLoading(true);
    try {
      const fetchedPredictions = await program.account.prediction.all();
      const formattedPredictions = fetchedPredictions.map(p => ({
        ...p,
        account: {
          ...p.account,
          id: p.account.id.toString(),
          totalVotes: p.account.totalVotes.toString(),
          yesVotes: p.account.yesVotes.toString(),
          noVotes: p.account.noVotes.toString(),
          yesAmount: p.account.yesAmount.toString(),
          noAmount: p.account.noAmount.toString(),
          totalAmount: p.account.totalAmount.toString(),
          pendingClaims: (p.account.pendingClaims || []).map(claim => ({
            ...claim,
            amount: claim.amount.toString(),
            shares: claim.shares.toString()
          }))
        }
      }));
      setPredictions(formattedPredictions);
    } catch (error) {
      console.error('Error fetching predictions:', error);
      setPredictions([]);
    } finally {
      setIsLoading(false);
    }
  };
  const handleCreatePrediction = async () => {
    if (!wallet.publicKey) {
      toast.error('Wallet not connected');
      return;
    }
        
    try {
      const tags = newPrediction.tags.split(',').map(tag => tag.trim());
      const newPredictionAccount = web3.Keypair.generate();
  
      const tx = await program.methods.createPrediction(
        newPrediction.description,
        new BN(newPrediction.duration),
        tags,
        newPrediction.prediction_type,
        newPrediction.options_count
      )
      .accounts({
        marketState: MARKET_STATE_PDA,
        prediction: newPredictionAccount.publicKey,
        admin: wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([newPredictionAccount])
      .rpc();
  
      await connection.confirmTransaction(tx);
      console.log("Prediction created:", newPredictionAccount.publicKey.toString());
      setIsModalOpen(false);
      fetchPredictions();
      toast.success('Prediction created successfully');
    } catch (error) {
      console.error('Error creating prediction:', error);
      toast.error('Failed to create prediction');
    }
  };

  const handleGeneratePredictions = async () => {
    setIsGenerating(true);
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_SERVER_URL}/test/generate-predictions`, { topic });
      setGeneratedPredictions(response.data.predictions);
      setIsGeneratePopupOpen(true);
    } catch (error) {
      console.error('Error generating predictions:', error);
      toast.error('Failed to generate predictions');
    }
    setIsGenerating(false);
  };

  const handleSelectPrediction = (prediction: any) => {
    setNewPrediction({
      description: prediction.description,
      duration: prediction.duration.toString(),
      tags: prediction.tags.join(', '),
      prediction_type: 0,
      options_count: 2,
    });
    setIsGeneratePopupOpen(false);
    setIsModalOpen(true);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prevTags =>
      prevTags.includes(tag)
        ? prevTags.filter(t => t !== tag)
        : [...prevTags, tag]
    );
  };

  const filteredPredictions = predictions.filter(prediction => 
    selectedTags.length === 0 || prediction.account.tags.some(tag => selectedTags.includes(tag))
  );


  const filterPredictions = (predictions: PredictionData[]) => {
    return predictions.filter(prediction => 
      selectedTags.length === 0 || prediction.account.tags.some(tag => selectedTags.includes(tag))
    );
  };

  const categorizeAndFilterPredictions = () => {
    const now = Date.now() / 1000;
    const filtered = filterPredictions(predictions);
    return {
      active: filtered.filter(p => 'active' in p.account.state && Number(p.account.endTime) > now),
      expired: filtered.filter(p => 'active' in p.account.state && Number(p.account.endTime) <= now),
      resolved: filtered.filter(p => 'resolved' in p.account.state),
    };
  };

  const { active, expired, resolved } = categorizeAndFilterPredictions();
  const [activeTab, setActiveTab] = useState<'active' | 'expired' | 'resolved'>('active');

  const renderTabButton = (tabName: 'active' | 'expired' | 'resolved', label: string) => (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => setActiveTab(tabName)}
      className={`py-2 px-4 text-sm font-medium rounded-lg ${
        activeTab === tabName
          ? 'bg-brand-500 text-white'
          : 'bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300'
      }`}
    >
      {label}
    </motion.button>
  );
  
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-navy-900">
    <Toaster />
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8">
        <div className="flex flex-wrap gap-2 mb-4 md:mb-0">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {console.log("requested funds")}}
            className="bg-blue-500 text-white rounded-lg py-2 px-4 text-sm flex items-center justify-center"
          >
            <IoWater className="mr-2" /> Request Funds
          </motion.button>
          {isAdminRole && (
            <>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsModalOpen(true)}
                className="bg-green-500 text-white rounded-lg py-2 px-4 text-sm flex items-center justify-center"
              >
                <IoAdd className="mr-2" /> Create
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsGeneratePopupOpen(true)}
                className="bg-purple-500 text-white rounded-lg py-2 px-4 text-sm flex items-center justify-center"
              >
                <IoBulb className="mr-2" /> Generate
              </motion.button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <div className="flex space-x-2 mb-4 sm:mb-0">
          {renderTabButton('active', 'Active')}
          {renderTabButton('expired', 'Expired')}
          {renderTabButton('resolved', 'Resolved')}
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300 rounded-lg py-2 px-4 text-sm flex items-center justify-center w-full sm:w-auto"
        >
          <IoFilter className="mr-2" /> Filter by Tags
          <IoChevronDown className={`ml-2 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
        </motion.button>
      </div>

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 flex flex-wrap gap-2"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="bg-white dark:bg-navy-800 rounded-xl shadow-lg p-6 animate-pulse">
              <div className="h-6 bg-gray-200 dark:bg-navy-700 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-1/2 mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-1/3 mb-4"></div>
              <div className="h-20 bg-gray-200 dark:bg-navy-700 rounded mb-4"></div>
              <div className="h-10 bg-gray-200 dark:bg-navy-700 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          {(activeTab === 'active' ? active : activeTab === 'expired' ? expired : resolved).map((prediction) => (
            <PredictionCard
              key={prediction.publicKey.toString()}
              prediction={prediction}
              onPredict={(publicKey, verdict, amount) => {
                // Update the local state when a prediction is made
                setPredictions(prevPredictions => 
                  prevPredictions.map(p => 
                    p.publicKey.equals(publicKey) 
                      ? { ...p, account: { ...p.account, /* update relevant fields */ } }
                      : p
                  )
                );
              }}
              isAdmin={isAdminRole}
              program={program}
              wallet={wallet}
            />
          ))}
        </div>
      )}

      {!isLoading && (activeTab === 'active' ? active : activeTab === 'expired' ? expired : resolved).length === 0 && (
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-navy-700 dark:text-white mb-4">No {activeTab} predictions available</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            {activeTab === 'active'
              ? 'Create a new prediction to get started!'
              : `There are currently no ${activeTab} predictions.`}
          </p>
          {isAdminRole && activeTab === 'active' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsModalOpen(true)}
              className="bg-green-500 text-white rounded-lg py-2 px-4 text-lg font-semibold flex items-center justify-center mx-auto"
            >
              <IoAdd className="mr-2" /> Create Prediction
            </motion.button>
          )}
        </div>
      )}
    </div>
    
      {/* Create Prediction Modal */}
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
              className="bg-white dark:bg-navy-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-navy-700 dark:text-white">Create New Prediction</h2>
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
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCreatePrediction}
                  className="w-full bg-brand-500 text-white rounded-lg py-2 px-4 hover:bg-brand-600 transition-colors"
                >
                  Create Prediction
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generate Predictions Modal */}
      <AnimatePresence>
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
              className="bg-white dark:bg-navy-800 rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-navy-700 dark:text-white">Generate AI Predictions</h2>
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
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleGeneratePredictions}
                  disabled={isGenerating}
                  className="w-full bg-purple-500 text-white rounded-lg py-2 px-4 hover:bg-purple-600 transition-colors disabled:bg-purple-300 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Generating...
                    </div>
                  ) : (
                    'Generate Predictions'
                  )}
                </motion.button>
                <div className="space-y-3 mt-4">
                  {generatedPredictions.map((prediction: any, index: number) => (
                    <motion.div
                      key={index}
                      whileHover={{ scale: 1.02 }}
                      className="bg-gray-100 dark:bg-navy-700 p-4 rounded-lg cursor-pointer transition-colors hover:bg-gray-200 dark:hover:bg-navy-600"
                      onClick={() => handleSelectPrediction(prediction)}
                    >
                      <h3 className="font-bold text-navy-700 dark:text-white mb-2">{prediction.description}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Duration: {prediction.duration} seconds</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Tags: {prediction.tags.join(', ')}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SolanaPredictionDashboard;