import React, { useState, useEffect } from 'react';
import { Home, BarChart2, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import WalletSelector from "components/card/WalletButton";
import { RiMoonFill, RiSunFill, RiCoinLine, RiCoinsLine } from 'react-icons/ri';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

const MODULE_ADDRESS = '0xe5daef3712e9be57eee01a28e4b16997e89e0b446546d304d5ec71afc9d1bacd';
const config = new AptosConfig({ network: Network.DEVNET });
const aptos = new Aptos(config);

const NavBar = ({ isMobile }) => {
  const [activeTab, setActiveTab] = useState('predict');
  const [showTutorial, setShowTutorial] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showFaucetModal, setShowFaucetModal] = useState(false);
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState(null);
  const [aptBalance, setAptBalance] = useState('0');
  const [chipBalance, setChipBalance] = useState('0');
  const router = useRouter();
  const { signAndSubmitTransaction } = useWallet();

  useEffect(() => {
    const storedMode = localStorage.getItem('isDarkMode');
    const initialDarkMode = storedMode === null ? true : storedMode === 'true';
    setIsDarkMode(initialDarkMode);
    updateDarkMode(initialDarkMode);
  }, []);

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
    if (!hasSeenTutorial) {
      setShowTutorial(true);
    }
  }, []);

  useEffect(() => {
    if (connected && account) {
      fetchBalances();
    }
  }, [connected, account]);

  const updateDarkMode = (isDark) => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    updateDarkMode(newMode);
    localStorage.setItem('isDarkMode', newMode.toString());
  };

  const handleCloseTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem('hasSeenTutorial', 'true');
  };

  const handleNavigation = (route) => {
    setActiveTab(route);
    if (route === 'profile') {
      router.push('/hub/profile');
    } else if (route === 'predict') {
      router.push('/hub/dashboard');
    } else if (route === 'leaders') {
      router.push('/hub/leaders');
    } else {
      router.push(`/${route}`);
    }
  };

  const fetchBalances = async () => {
    if (!account) return;

    try {
      // Fetch APT balance
      const resources = await aptos.getAccountResources({ accountAddress: account.address });
      const aptResource = resources.find(r => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
      if (aptResource) {
        const balance = BigInt(aptResource.data.coin.value);
        setAptBalance((balance / BigInt(1e8)).toString());
      }

      // Fetch CHIP balance
      const result = await aptos.view({
        payload: {
          function: `${MODULE_ADDRESS}::chip_token::balance`,
          typeArguments: [],
          functionArguments: [account.address]
        },
      });
      setChipBalance((BigInt(result[0]) / BigInt(1e8)).toString());
    } catch (error) {
      console.error('Error fetching balances:', error);
      toast.error('Failed to fetch balances');
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
      setShowFaucetModal(false);
      fetchBalances();
    } catch (error) {
      toast.error('Error requesting funds. Please try again.');
      console.error('Error requesting funds:', error);
    }
  };

  const navItems = [
    { icon: <Home size={20} />, label: 'Leaders', route: 'leaders' },
    { icon: <BarChart2 size={20} />, label: 'Predict', route: 'predict' },
    { icon: <User size={20} />, label: 'Profile', route: 'profile' },
  ];

  const NavContent = () => (
    <div className={`flex items-center ${isMobile ? 'justify-between w-full' : 'space-x-4'}`}>
    {navItems.map((item) => (
      <NavItem
        key={item.route}
        icon={item.icon}
        label={item.label}
        isActive={activeTab === item.route}
        onClick={() => handleNavigation(item.route)}
        isMobile={isMobile}
      />
    ))}
  </div>
  );

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 right-0 bg-white/10 backdrop-blur-xl p-4 shadow-lg dark:bg-[#0b14374d] z-50"
      >
        <div className="flex flex-col space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-800 dark:text-white font-bold text-xl">#Predict.AI</span>
            <div className="flex items-center space-x-4">
              
            {connected && !isMobile && (
              <>
                <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1">
                  <RiCoinLine className="text-yellow-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{aptBalance}</span>
                  <span className="text-xs font-bold text-yellow-500">APT</span>
                </div>
                <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1">
                  <RiCoinsLine className="text-green-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{chipBalance}</span>
                  <span className="text-xs font-bold text-green-500">CHIP</span>
                </div>
              </>
            )}
              {!isMobile && <NavContent />}
              <button
                className="cursor-pointer text-gray-800 dark:text-white"
                onClick={toggleDarkMode}
                aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDarkMode ? (
                  <RiSunFill className="h-5 w-5" />
                ) : (
                  <RiMoonFill className="h-5 w-5" />
                )}
              </button>
              <WalletSelector onConnect={(isConnected, accountData) => {
                setConnected(isConnected);
                setAccount(accountData);
              }} />
            </div>
          </div>

        </div>
      </motion.nav>

      {isMobile && (
        <motion.nav
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-4 left-4 right-4 bg-white/10 backdrop-blur-xl p-2 shadow-lg rounded-xl dark:bg-[#0b14374d] z-40"
        >
          <NavContent />
        </motion.nav>
      )}

      <AnimatePresence>
        {showTutorial && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-70"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 max-w-sm w-full shadow-lg dark:bg-[#0b14374d]"
            >
              <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">Welcome to #Predict.AI!</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">Let's quickly go through the main features of our prediction marketplace:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-600 dark:text-gray-300 mb-6">
                <li>Leaders: See top performers</li>
                <li>Predict: Make your predictions</li>
                <li>Profile: View your activity and settings</li>
              </ul>
              <button 
                onClick={handleCloseTutorial}
                className="w-full bg-blue-500 text-white rounded-lg py-2 font-semibold hover:bg-blue-600 transition-colors"
              >
                Got it, let's start!
              </button>
            </motion.div>
          </motion.div>
        )}

        {showFaucetModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-70"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 max-w-sm w-full shadow-lg dark:bg-[#0b14374d]"
            >
              <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">Low Balance Detected</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">Your APT balance is below 0.01. Would you like to request free funds to continue using our prediction marketplace?</p>
              <button 
                onClick={handleRequestFunds}
                className="w-full bg-blue-500 text-white rounded-lg py-2 font-semibold hover:bg-blue-600 transition-colors mb-2"
              >
                Request Free Funds
              </button>
              <button 
                onClick={() => setShowFaucetModal(false)}
                className="w-full bg-gray-300 text-gray-800 rounded-lg py-2 font-semibold hover:bg-gray-400 transition-colors"
              >
                Maybe Later
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const NavItem = ({ icon, label, isActive, onClick, isMobile }) => (
  <motion.button
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    className={`
      flex items-center justify-center 
      py-2 px-4 rounded-xl transition-colors
      ${isActive ? 'text-purple-300 bg-white/20' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}
      ${isMobile ? 'flex-col flex-1' : 'flex-row'}
    `}
    onClick={onClick}
  >
    {icon}
    <span className={`font-medium ${isMobile ? 'text-xs mt-1' : 'ml-2 text-sm'}`}>{label}</span>
  </motion.button>
);

export default NavBar;