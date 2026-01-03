
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  BarChart3, 
  MapPin, 
  TrendingUp, 
  Info, 
  ChevronRight,
  Loader2,
  Calendar,
  DollarSign,
  AlertCircle,
  Utensils,
  User,
  Users,
  Briefcase,
  Quote,
  Trophy,
  List,
  ShieldCheck,
  Building2,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Send,
  MessageSquare,
  Zap,
  CheckCircle2
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// API Configuration
const DATASET_ID = 'naix-2893';
const BASE_URL = `https://data.texas.gov/resource/${DATASET_ID}.json`;

/**
 * API KEY HANDLING
 * Updated with provided key and safe environment checks.
 */
const getApiKey = () => {
  // 1. Priority: Use the key provided in the chat
  const providedKey = "AIzaSyBHeVeq7_fzYaDtn4OvgiZ1VOohcKToHLE";
  if (providedKey && !providedKey.startsWith("YOUR_")) return providedKey;

  // 2. Fallback: Check environment variables safely
  try {
    if (typeof process !== 'undefined' && process.env?.REACT_APP_GEMINI_API_KEY) {
      return process.env.REACT_APP_GEMINI_API_KEY;
    }
    // Accessing import.meta via a string check to prevent 'es2015' target build errors
    const globalObj = typeof window !== 'undefined' ? window : globalThis;
    if (globalObj.import?.meta?.env?.VITE_GEMINI_API_KEY) {
      return globalObj.import.meta.env.VITE_GEMINI_API_KEY;
    }
  } catch (e) {
    // Silent fail for restricted environments
  }
  return ""; 
};

const apiKey = getApiKey();

const DATE_FIELD = 'obligation_end_date_yyyymmdd';
const TOTAL_FIELD = 'total_receipts';

// Revenue split presets for food estimation
const VENUE_TYPES = {
  fine_dining: { label: 'Fine Dining', foodPct: 0.75, alcoholPct: 0.25, desc: 'Premium food focus (75/25 split)' },
  upscale_casual: { label: 'Upscale Casual', foodPct: 0.65, alcoholPct: 0.35, desc: 'Polished dining (65/35 split)' },
  casual_dining: { label: 'Casual Dining', foodPct: 0.60, alcoholPct: 0.40, desc: 'Balanced menu (60/40 split)' },
  pub_grill: { label: 'Pub & Grill', foodPct: 0.50, alcoholPct: 0.50, desc: 'Even revenue split (50/50 split)' },
  sports_bar: { label: 'Sports Bar', foodPct: 0.35, alcoholPct: 0.65, desc: 'Alcohol primary (35/65 split)' },
  dive_bar: { label: 'Dive Bar / Tavern', foodPct: 0.15, alcoholPct: 0.85, desc: 'Minimal food service (15/85 split)' },
  nightclub: { label: 'Nightclub / Lounge', foodPct: 0.05, alcoholPct: 0.95, desc: 'High beverage volume (5/95 split)' },
  no_food: { label: 'No Food (Alcohol Only)', foodPct: 0.00, alcoholPct: 1.00, desc: '100% Alcohol receipts' },
};

const App = () => {
  const [viewMode, setViewMode] = useState('search'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [topCitySearch, setTopCitySearch] = useState('');
  const [results, setResults] = useState([]);
  const [topAccounts, setTopAccounts] = useState([]);
  const [selectedEstablishment, setSelectedEstablishment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [venueType, setVenueType] = useState('casual_dining');
  
  // AI State
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [groundingSources, setGroundingSources] = useState([]);

  const formatCurrency = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const performIntelligenceLookup = async (establishment) => {
    const businessName = establishment.location_name;
    const city = establishment.location_city;
    
    setAiLoading(true);
    setAiResponse(null);
    setGroundingSources([]);

    const userQuery = `Search for the Texas business "${businessName}" in ${city}. Who owns this business (founders or parent company) and how many locations do they currently have in total?`;
    
    const systemPrompt = "You are a professional business intelligence researcher. Your goal is to provide specific ownership details and location counts. Synthesize sources and prioritize listing names of individual owners/founders. Always state the total location count if found.";

    const fetchWithRetry = async (url, options, retries = 5, backoff = 1000) => {
      try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      } catch (err) {
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, backoff));
          return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw err;
      }
    };

    try {
      if (!apiKey) {
        setAiResponse("AI Lookup is disabled because no Gemini API key was found.");
        setAiLoading(false);
        return;
      }

      const result = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userQuery }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: [{ "google_search": {} }]
        })
      });

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      const sources = result.candidates?.[0]?.groundingMetadata?.groundingAttributions?.map(a => ({ 
        uri: a.web?.uri, 
        title: a.web?.title 
      })) || [];

      setAiResponse(text || "No ownership data found for this specific location.");
      setGroundingSources(sources);
    } catch (err) {
      setAiResponse("Intelligence lookup failed. Please check your network connection and API key permissions.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError(null);
    setSelectedEstablishment(null);
    setAiResponse(null);
    setResults([]);

    try {
      const cleanSearch = searchTerm.trim().toUpperCase();
      const cleanCity = cityFilter.trim().toUpperCase();
      
      let whereClause = `upper(location_name) like '%${cleanSearch}%'`;
      if (cleanCity) {
        whereClause += ` AND upper(location_city) = '${cleanCity}'`;
      }

      const query = `?$where=${encodeURIComponent(whereClause)}&$order=${DATE_FIELD} DESC&$limit=100`;
      const response = await fetch(BASE_URL + query);
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.message || 'Failed to fetch data');
      
      const uniqueSpots = [];
      const seen = new Set();
      data.forEach(item => {
        const id = `${item.taxpayer_number}-${item.location_number}`;
        if (!seen.has(id)) {
          seen.add(id);
          uniqueSpots.push(item);
        }
      });
      setResults(uniqueSpots);
    } catch (err) {
      setError("Search failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleTopAccountsSearch = async (e) => {
    if (e) e.preventDefault();
    if (!topCitySearch.trim()) return;

    setLoading(true);
    setError(null);
    setTopAccounts([]);

    try {
      const city = topCitySearch.trim().toUpperCase();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const dateString = oneYearAgo.toISOString().split('T')[0] + "T00:00:00.000";

      const query = `?$select=location_name, location_address, location_city, taxpayer_number, location_number, sum(${TOTAL_FIELD}) as annual_sales, count(${TOTAL_FIELD}) as months_count` +
                    `&$where=upper(location_city) = '${city}' AND ${DATE_FIELD} > '${dateString}'` +
                    `&$group=location_name, location_address, location_city, taxpayer_number, location_number` +
                    `&$order=annual_sales DESC` +
                    `&$limit=100`;

      const response = await fetch(BASE_URL + query);
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.message || 'Failed to fetch ranking');
      
      const processedData = data.map(account => ({
        ...account,
        annual_sales: parseFloat(account.annual_sales),
        avg_monthly_volume: parseFloat(account.annual_sales) / (parseInt(account.months_count) || 12)
      }));

      setTopAccounts(processedData);
    } catch (err) {
      setError("Failed to fetch top accounts.");
    } finally {
      setLoading(false);
    }
  };

  const analyzeLocation = async (establishment) => {
    setLoading(true);
    setError(null);
    setViewMode('search'); 
    setAiResponse(null);
    
    try {
      const whereClause = `taxpayer_number = '${establishment.taxpayer_number}' AND location_number = '${establishment.location_number}'`;
      const query = `?$where=${encodeURIComponent(whereClause)}&$order=${DATE_FIELD} DESC&$limit=12`;
      
      const response = await fetch(BASE_URL + query);
      const history = await response.json();
      if (!response.ok) throw new Error("Failed to load historical data.");

      const newSelection = {
        info: establishment,
        history: history.reverse()
      };
      
      setSelectedEstablishment(newSelection);
      performIntelligenceLookup(establishment);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (!selectedEstablishment || !selectedEstablishment.history.length) return null;
    const history = selectedEstablishment.history;
    const nonZeroMonths = history.filter(m => parseFloat(m[TOTAL_FIELD]) > 0);
    const totalAlcoholVolume = nonZeroMonths.reduce((sum, m) => sum + parseFloat(m[TOTAL_FIELD] || 0), 0);
    const averageAlcohol = nonZeroMonths.length > 0 ? totalAlcoholVolume / nonZeroMonths.length : 0;
    const config = VENUE_TYPES[venueType];
    
    let estimatedFoodAvg = 0;
    if (config.alcoholPct > 0) {
        estimatedFoodAvg = (averageAlcohol / config.alcoholPct) * config.foodPct;
    }
    
    return { 
      averageAlcohol,
      estimatedFoodAvg,
      estimatedTotalAvg: averageAlcohol + estimatedFoodAvg,
      nonZeroCount: nonZeroMonths.length,
      config
    };
  }, [selectedEstablishment, venueType]);

  const pieData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Alcohol', value: stats.averageAlcohol, color: '#A5B4FC' },
      { name: 'Food', value: stats.estimatedFoodAvg, color: '#6EE7B7' }
    ];
  }, [stats]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans p-4 md:p-8">
      <header className="max-w-6xl mx-auto mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black text-white flex items-center gap-3 tracking-tighter italic">
              <BarChart3 className="text-indigo-400" size={36} /> RESTAURANT SCRAPER
            </h1>
            <p className="text-slate-400 font-medium uppercase tracking-widest text-[10px]">TX Comptroller Data Access 2.0</p>
          </div>
          <div className="flex bg-[#1E293B] p-1.5 rounded-2xl border border-slate-700 w-fit">
            <button 
              onClick={() => setViewMode('search')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${viewMode === 'search' ? 'bg-indigo-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
            >
              <Search size={16} /> Search
            </button>
            <button 
              onClick={() => setViewMode('top')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${viewMode === 'top' ? 'bg-indigo-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}
            >
              <Trophy size={16} /> Rankings
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-xl">
            {viewMode === 'search' ? (
              <form onSubmit={handleSearch} className="space-y-4">
                <h3 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">Establishment Lookup</h3>
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="text"
                      placeholder="Name (e.g. Dos Salsas)"
                      className="w-full pl-12 pr-4 py-3 rounded-2xl bg-[#0F172A] border border-slate-700 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="text"
                      placeholder="City (Optional)"
                      className="w-full pl-12 pr-4 py-3 rounded-2xl bg-[#0F172A] border border-slate-700 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                      value={cityFilter}
                      onChange={(e) => setCityFilter(e.target.value)}
                    />
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={loading || !searchTerm.trim()}
                  className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-900 font-black py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                >
                  {loading ? <Loader2 className="animate-spin" /> : 'Run Scraper'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleTopAccountsSearch} className="space-y-4">
                <h3 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">City Leaderboard</h3>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input 
                    type="text"
                    placeholder="Enter Texas City"
                    className="w-full pl-12 pr-4 py-3 rounded-2xl bg-[#0F172A] border border-slate-700 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                    value={topCitySearch}
                    onChange={(e) => setTopCitySearch(e.target.value)}
                  />
                </div>
                <button 
                  type="submit"
                  disabled={loading || !topCitySearch.trim()}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                >
                  {loading ? <Loader2 className="animate-spin" /> : 'Fetch Top 100'}
                </button>
              </form>
            )}
          </section>

          {viewMode === 'search' && results.length > 0 && (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              <h3 className="text-[10px] font-black text-slate-500 uppercase px-4 tracking-[0.2em]">Matches</h3>
              {results.map((item) => (
                <button
                  key={`${item.taxpayer_number}-${item.location_number}`}
                  onClick={() => analyzeLocation(item)}
                  className={`w-full text-left p-5 rounded-3xl border transition-all flex items-center justify-between group ${
                    selectedEstablishment?.info.location_number === item.location_number
                    ? 'bg-indigo-500/10 border-indigo-500'
                    : 'bg-[#1E293B] border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="overflow-hidden">
                    <h4 className="font-black text-slate-100 group-hover:text-indigo-300 transition-colors uppercase truncate">{item.location_name}</h4>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-tight truncate">
                      {item.location_address}, {item.location_city}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-slate-600 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-8">
          {viewMode === 'top' && topAccounts.length > 0 && (
            <div className="bg-[#1E293B] rounded-[2rem] border border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="p-8 border-b border-slate-700 flex justify-between items-center bg-[#0F172A]/30">
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">Market Leaders: {topCitySearch}</h2>
                <Trophy className="text-amber-400" size={32} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#0F172A]/50 text-[10px] uppercase font-black text-slate-500 tracking-widest">
                    <tr>
                      <th className="px-8 py-4">Rank</th>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Address</th>
                      <th className="px-8 py-4 text-right">Avg Mo. Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {topAccounts.map((account, index) => (
                      <tr key={index} onClick={() => analyzeLocation(account)} className="hover:bg-indigo-500/5 transition-all cursor-pointer group">
                        <td className="px-8 py-5">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-black text-[10px] ${index < 3 ? 'bg-amber-400 text-slate-900' : 'bg-slate-800 text-slate-400'}`}>
                            {index + 1}
                          </span>
                        </td>
                        <td className="px-6 py-5 font-black text-slate-200 uppercase italic group-hover:text-indigo-400">{account.location_name}</td>
                        <td className="px-6 py-5 text-slate-500 text-[10px] font-bold uppercase">{account.location_address}</td>
                        <td className="px-8 py-5 font-black text-white text-right">{formatCurrency(account.avg_monthly_volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewMode === 'search' && selectedEstablishment && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-20">
              {/* Header Card */}
              <div className="bg-[#1E293B] p-8 md:p-10 rounded-[2rem] border border-slate-700 shadow-2xl relative overflow-hidden">
                <div className="flex flex-col md:flex-row justify-between gap-8 relative z-10">
                  <div className="space-y-6 flex-1">
                    <div>
                      <span className="inline-block px-4 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-black mb-4 uppercase tracking-[0.2em] border border-indigo-500/20">
                        {selectedEstablishment.info.tabc_permit_number || 'TABC ACTIVE'}
                      </span>
                      <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase italic">{selectedEstablishment.info.location_name}</h2>
                      <p className="text-slate-400 flex items-center gap-2 mt-4 text-sm font-bold uppercase tracking-wide">
                        <MapPin size={18} className="text-indigo-400" /> {selectedEstablishment.info.location_address}, {selectedEstablishment.info.location_city}, TX
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8 border-t border-slate-700/50">
                      {/* Entity Card */}
                      <div className="bg-[#0F172A]/40 p-6 rounded-[1.5rem] border border-slate-700">
                        <div className="flex items-center gap-2 text-indigo-400 mb-3">
                          <Building2 size={16} />
                          <span className="text-[9px] font-black uppercase tracking-widest">Parent Entity</span>
                        </div>
                        <p className="font-black text-slate-100 text-lg uppercase leading-tight">{selectedEstablishment.info.taxpayer_name}</p>
                        <div className="mt-4 flex items-center justify-between opacity-60">
                          <p className="text-[9px] font-mono tracking-widest">ID: {selectedEstablishment.info.taxpayer_number}</p>
                        </div>
                      </div>

                      {/* Intelligence Card - Automated Report */}
                      <div className="bg-gradient-to-br from-indigo-500/10 to-transparent p-6 rounded-[1.5rem] border border-indigo-500/30 shadow-xl relative group min-h-[140px]">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2 text-indigo-300">
                            <Sparkles size={16} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Ownership Intelligence</span>
                          </div>
                          {aiLoading ? (
                            <Loader2 size={14} className="animate-spin text-indigo-400" />
                          ) : (
                            <CheckCircle2 size={14} className="text-emerald-400" />
                          )}
                        </div>
                        
                        <div className="space-y-4">
                          {aiResponse ? (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                              <div className="text-xs font-medium text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {aiResponse}
                              </div>
                              {groundingSources.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-slate-700/50 flex flex-wrap gap-2">
                                  {groundingSources.slice(0, 2).map((source, i) => (
                                    <a key={i} href={source.uri} target="_blank" rel="noreferrer" className="text-[8px] bg-slate-800 px-2 py-1 rounded text-indigo-300 truncate max-w-[120px] hover:bg-slate-700 flex items-center gap-1">
                                      <ExternalLink size={8} /> {source.title || 'Source'}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-4 text-center">
                              <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Scanning Market Data</p>
                              <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-2">
                                <div className="bg-indigo-500 h-full animate-pulse w-2/3"></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[2rem] text-center md:text-right text-slate-900 shadow-2xl min-w-full md:min-w-[260px] flex flex-col justify-center border-b-8 border-indigo-400">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Estimated Avg. Revenue</p>
                    <p className="text-4xl md:text-5xl font-black tracking-tighter leading-none">{formatCurrency(stats.estimatedTotalAvg)}</p>
                    <p className="text-[9px] mt-4 font-black text-indigo-500 uppercase tracking-widest">Monthly Projection</p>
                  </div>
                </div>
              </div>

              {/* Projections & Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#1E293B] p-8 rounded-[2rem] border border-slate-700 flex flex-col">
                  <div className="flex items-center gap-3 mb-8">
                    <Utensils className="text-indigo-400" />
                    <h3 className="text-sm font-black uppercase italic tracking-widest">Projection Model</h3>
                  </div>
                  
                  <div className="space-y-6 flex-1">
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500 block mb-3 tracking-widest">Establishment Type</label>
                      <select 
                        className="w-full bg-[#0F172A] border border-slate-700 rounded-2xl px-5 py-4 text-xs font-black text-slate-200 outline-none uppercase italic"
                        value={venueType}
                        onChange={(e) => setVenueType(e.target.value)}
                      >
                        {Object.entries(VENUE_TYPES).map(([key, val]) => (
                          <option key={key} value={key}>{val.label}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-indigo-300 mt-4 font-bold italic opacity-80">{stats.config.desc}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800">
                        <p className="text-[9px] font-black text-indigo-400 uppercase mb-1">Alcohol</p>
                        <p className="text-xl font-black text-white italic">{formatCurrency(stats.averageAlcohol)}</p>
                      </div>
                      <div className="bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800">
                        <p className="text-[9px] font-black text-emerald-400 uppercase mb-1">Food (Est)</p>
                        <p className="text-xl font-black text-white italic">{formatCurrency(stats.estimatedFoodAvg)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#1E293B] p-8 rounded-[2rem] border border-slate-700 h-[350px] flex flex-col items-center justify-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={95}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => <Cell key={index} fill={entry.color} strokeWidth={0} />)}
                      </Pie>
                      <Tooltip 
                        contentStyle={{backgroundColor: '#0F172A', borderRadius: '12px', border: '1px solid #334155', fontSize: '12px'}}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute flex flex-col items-center pointer-events-none">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Revenue Mix</span>
                    <span className="text-xl font-black text-white italic tracking-tighter">{formatCurrency(stats.estimatedTotalAvg)}</span>
                  </div>
                </div>
              </div>

              {/* History Bar Chart */}
              <div className="bg-[#1E293B] p-8 rounded-[2rem] border border-slate-700 shadow-xl">
                <h3 className="text-sm font-black text-white uppercase italic tracking-widest mb-10">Alcohol Sales Volume (Last 12 Months)</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedEstablishment.history} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#334155" />
                      <XAxis dataKey={DATE_FIELD} tickFormatter={formatDate} tick={{fontSize: 9, fill: '#64748b', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`} tick={{fontSize: 9, fill: '#64748b', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{backgroundColor: '#0F172A', borderRadius: '12px', border: '1px solid #334155'}} />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{paddingBottom: '20px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold'}} />
                      <Bar name="Liquor" dataKey="liquor_receipts" stackId="a" fill="#A5B4FC" />
                      <Bar name="Wine" dataKey="wine_receipts" stackId="a" fill="#F9A8D4" />
                      <Bar name="Beer" dataKey="beer_receipts" stackId="a" fill="#FDE047" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
          
          {!selectedEstablishment && !loading && (
            <div className="h-[500px] flex flex-col items-center justify-center bg-[#1E293B]/30 rounded-[2.5rem] border-2 border-dashed border-slate-800 text-slate-600 text-center p-10">
              <Zap size={48} className="mb-6 opacity-20" />
              <h3 className="text-xl font-black italic uppercase tracking-tighter">System Idle</h3>
              <p className="max-w-xs mt-2 text-xs font-bold uppercase tracking-widest opacity-40">Search and select an establishment to initialize intelligence modules</p>
            </div>
          )}
          
          {loading && (
            <div className="h-[500px] flex flex-col items-center justify-center">
              <Loader2 className="animate-spin text-indigo-400 mb-4" size={48} />
              <p className="text-indigo-300 font-black tracking-[0.3em] uppercase text-[10px]">Accessing TABC Cloud Records...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
