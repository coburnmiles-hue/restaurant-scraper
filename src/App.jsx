
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  BarChart3, 
  MapPin, 
  ChevronRight,
  Loader2,
  Utensils,
  Trophy,
  Building2,
  Sparkles,
  Target,
  UserCheck,
  Globe,
  Link2,
  Settings,
  X,
  AlertCircle
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

// API Configuration
const DATASET_ID = 'naix-2893';
const BASE_URL = `https://data.texas.gov/resource/${DATASET_ID}.json`;

const DATE_FIELD = 'obligation_end_date_yyyymmdd';
const TOTAL_FIELD = 'total_receipts';

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
  
  // Intelligence Engine State
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [groundingSources, setGroundingSources] = useState([]);
  const [customApiKey, setCustomApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Robust API Key Detection Logic - Optimized for Vercel/Vite/CRA
  const getActiveApiKey = () => {
    // 1. Check manual override from user settings (Priority)
    if (customApiKey) return customApiKey;
    
    // 2. Check system-injected variable (Canvas environment)
    if (typeof apiKey !== 'undefined' && apiKey) return apiKey;
    
    // 3. Robust check for Vite (using a safe check for import.meta)
    try {
      const metaEnv = (import.meta && import.meta.env) ? import.meta.env : {};
      if (metaEnv.VITE_GEMINI_API_KEY) return metaEnv.VITE_GEMINI_API_KEY;
    } catch (e) {
      // Fall through if import.meta is not supported
    }
    
    // 4. Check process.env (Standard Vercel/CRA behavior)
    try {
      const env = typeof process !== 'undefined' ? process.env : {};
      return env.REACT_APP_GEMINI_API_KEY || env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || "";
    } catch (e) {
      return "";
    }
  };

  const formatCurrency = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '$0';
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const isSelected = (item) => {
    if (!selectedEstablishment) return false;
    return selectedEstablishment.info.taxpayer_number === item.taxpayer_number && 
           selectedEstablishment.info.location_number === item.location_number;
  };

  const aiContent = useMemo(() => {
    if (!aiResponse) return null;
    const sections = { owners: "Searching...", locations: "Searching...", details: "Searching..." };
    const normalized = aiResponse.replace(/[*#]/g, '').trim();
    const ownerMatch = normalized.match(/OWNERS:([\s\S]*?)(?=LOCATION COUNT:|$)/i);
    const locationMatch = normalized.match(/LOCATION COUNT:([\s\S]*?)(?=ACCOUNT DETAILS:|$)/i);
    const detailMatch = normalized.match(/ACCOUNT DETAILS:([\s\S]*?)$/i);
    
    if (ownerMatch) sections.owners = ownerMatch[1].trim();
    if (locationMatch) sections.locations = locationMatch[1].trim();
    if (detailMatch) sections.details = detailMatch[1].trim();
    
    return sections;
  }, [aiResponse]);

  const performIntelligenceLookup = async (establishment) => {
    const key = getActiveApiKey();
    if (!key) {
      setAiResponse("OWNERS: Configuration Required\nLOCATION COUNT: Missing API Key\nACCOUNT DETAILS: Ensure your Vercel key is named VITE_GEMINI_API_KEY and you have redeployed. Use the gear icon to set it manually for now.");
      return;
    }

    const businessName = establishment.location_name;
    const city = establishment.location_city;
    const taxpayer = establishment.taxpayer_name;
    
    setAiLoading(true); setAiResponse(null); setGroundingSources([]);
    
    try {
      const userQuery = `Find the individual owners or executive management for "${businessName}" in ${city}, TX. Look specifically for the people behind the LLC "${taxpayer}". 
      Format exactly:
      OWNERS: [Names]
      LOCATION COUNT: [Units]
      ACCOUNT DETAILS: [Quick summary of their market position]`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: userQuery }] }], 
          tools: [{ "google_search": {} }] 
        })
      });
      
      if (!response.ok) throw new Error(`API Error ${response.status}`);
      const resultData = await response.json();

      const text = resultData.candidates?.[0]?.content?.parts?.[0]?.text;
      const sources = resultData.candidates?.[0]?.groundingMetadata?.groundingAttributions?.map(a => ({ uri: a.web?.uri, title: a.web?.title })) || [];
      
      setAiResponse(text || "No data returned."); 
      setGroundingSources(sources);
    } catch (err) { 
      setAiResponse(`OWNERS: Error fetching data\nLOCATION COUNT: Check API Key validity.\nACCOUNT DETAILS: Request failed: ${err.message}`); 
    } finally { setAiLoading(false); }
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;
    setLoading(true); setError(null); setSelectedEstablishment(null); setAiResponse(null);
    try {
      const cleanSearch = searchTerm.trim().toUpperCase();
      const cleanCity = cityFilter.trim().toUpperCase();
      let whereClause = `upper(location_name) like '%${cleanSearch}%'`;
      if (cleanCity) whereClause += ` AND upper(location_city) = '${cleanCity}'`;
      const query = `?$where=${encodeURIComponent(whereClause)}&$order=${DATE_FIELD} DESC&$limit=100`;
      const response = await fetch(BASE_URL + query);
      const data = await response.json();
      const uniqueSpots = [];
      const seen = new Set();
      data.forEach(item => {
        const id = `${item.taxpayer_number}-${item.location_number}`;
        if (!seen.has(id)) { seen.add(id); uniqueSpots.push(item); }
      });
      setResults(uniqueSpots);
    } catch (err) { setError("Comptroller DB connection error."); } finally { setLoading(false); }
  };

  const handleTopAccountsSearch = async (e) => {
    if (e) e.preventDefault();
    if (!topCitySearch.trim()) return;
    setLoading(true); setTopAccounts([]);
    try {
      const city = topCitySearch.trim().toUpperCase();
      const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const dateString = oneYearAgo.toISOString().split('T')[0] + "T00:00:00.000";
      const query = `?$select=location_name, location_address, location_city, taxpayer_name, taxpayer_number, location_number, sum(${TOTAL_FIELD}) as annual_sales, count(${TOTAL_FIELD}) as months_count` +
                    `&$where=upper(location_city) = '${city}' AND ${DATE_FIELD} > '${dateString}'` +
                    `&$group=location_name, location_address, location_city, taxpayer_name, taxpayer_number, location_number` +
                    `&$order=annual_sales DESC&$limit=100`;
      const response = await fetch(BASE_URL + query);
      const data = await response.json();
      setTopAccounts(data.map(account => ({
        ...account,
        annual_sales: parseFloat(account.annual_sales),
        avg_monthly_volume: parseFloat(account.annual_sales) / (parseInt(account.months_count) || 12)
      })));
    } catch (err) { setError("Ranking engine timeout."); } finally { setLoading(false); }
  };

  const analyzeLocation = async (establishment) => {
    setLoading(true); setAiResponse(null);
    try {
      const whereClause = `taxpayer_number = '${establishment.taxpayer_number}' AND location_number = '${establishment.location_number}'`;
      const query = `?$where=${encodeURIComponent(whereClause)}&$order=${DATE_FIELD} DESC&$limit=12`;
      const response = await fetch(BASE_URL + query);
      const history = await response.json();
      setSelectedEstablishment({ 
        info: establishment, 
        history: history.reverse().map(h => ({
          ...h,
          liquor: parseFloat(h.liquor_receipts || 0),
          beer: parseFloat(h.beer_receipts || 0),
          wine: parseFloat(h.wine_receipts || 0)
        }))
      });
      performIntelligenceLookup(establishment);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const stats = useMemo(() => {
    if (!selectedEstablishment || !selectedEstablishment.history.length) return null;
    const history = selectedEstablishment.history;
    const nonZeroMonths = history.filter(m => parseFloat(m[TOTAL_FIELD]) > 0);
    const averageAlcohol = nonZeroMonths.length > 0 ? (nonZeroMonths.reduce((sum, m) => sum + parseFloat(m[TOTAL_FIELD] || 0), 0) / nonZeroMonths.length) : 0;
    const config = VENUE_TYPES[venueType];
    const estimatedFoodAvg = config.alcoholPct > 0 ? (averageAlcohol / config.alcoholPct) * config.foodPct : 0;
    return { averageAlcohol, estimatedFoodAvg, estimatedTotalAvg: averageAlcohol + estimatedFoodAvg, config };
  }, [selectedEstablishment, venueType]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans p-4 md:p-8 relative selection:bg-indigo-500/30">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#1E293B] w-full max-w-md p-8 rounded-[2.5rem] border border-slate-700 shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">API Configuration</h2>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-700 rounded-full transition-colors"><X size={20}/></button>
            </div>
            
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-6 flex gap-3">
              <AlertCircle className="text-amber-500 shrink-0" size={18} />
              <p className="text-[10px] text-amber-200/80 font-bold uppercase leading-relaxed tracking-tight">
                To fix Vercel permanently, name your variable <span className="text-white underline">VITE_GEMINI_API_KEY</span> or <span className="text-white underline">REACT_APP_GEMINI_API_KEY</span> and redeploy.
              </p>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest block mb-2">Manual API Key</span>
                <input 
                  type="password" 
                  placeholder="Paste Gemini Key (starts with AIza...)" 
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                />
              </label>
              <button onClick={() => setShowSettings(false)} className="w-full bg-indigo-500 hover:bg-indigo-400 py-4 rounded-2xl font-black text-xs uppercase text-slate-900 tracking-widest mt-4 transition-all shadow-lg shadow-indigo-500/20">Apply Key & Close</button>
            </div>
          </div>
        </div>
      )}

      <header className="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="relative">
             <div className="absolute -inset-1 bg-indigo-500 blur opacity-20 rounded-full"></div>
             <div className="relative bg-[#1E293B] p-3 rounded-2xl border border-slate-700">
                <BarChart3 className="text-indigo-400" size={32} />
             </div>
          </div>
          <div>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic leading-none">Scraper</h1>
            <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[9px] mt-1">TX Comptroller Intelligence</p>
          </div>
          <button onClick={() => setShowSettings(true)} className="ml-2 p-3 bg-[#1E293B] rounded-xl border border-slate-700 text-slate-500 hover:text-indigo-400 hover:border-indigo-500/50 transition-all">
            <Settings size={18} />
          </button>
        </div>
        
        <div className="flex bg-[#1E293B] p-1.5 rounded-2xl border border-slate-700 shadow-2xl">
          <button onClick={() => setViewMode('search')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all uppercase tracking-widest ${viewMode === 'search' ? 'bg-indigo-500 text-slate-900 shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}>
            <Search size={14} className="inline mr-2 -mt-0.5"/> Search
          </button>
          <button onClick={() => setViewMode('top')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all uppercase tracking-widest ${viewMode === 'top' ? 'bg-indigo-500 text-slate-900 shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}>
            <Trophy size={14} className="inline mr-2 -mt-0.5"/> Rankings
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 pb-12">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-xl">
            <form onSubmit={viewMode === 'search' ? handleSearch : handleTopAccountsSearch} className="space-y-4">
              <h3 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse"></div>
                {viewMode === 'search' ? 'Establishment Search' : 'City Analysis'}
              </h3>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input type="text" placeholder={viewMode === 'search' ? "Restaurant Name..." : "Enter Texas City..."} className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-[#0F172A] border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600 transition-all" value={viewMode === 'search' ? searchTerm : topCitySearch} onChange={(e) => viewMode === 'search' ? setSearchTerm(e.target.value) : setTopCitySearch(e.target.value)} />
              </div>
              {viewMode === 'search' && (
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="text" placeholder="City (Optional)" className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-[#0F172A] border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600 transition-all" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} />
                </div>
              )}
              <button type="submit" disabled={loading} className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-slate-900 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] flex justify-center items-center gap-2 transition-all shadow-lg shadow-indigo-500/10">
                {loading ? <Loader2 className="animate-spin" size={18} /> : 'Execute Scrape'}
              </button>
            </form>
          </section>

          {viewMode === 'search' && results.length > 0 && (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {results.map((item) => {
                const active = isSelected(item);
                return (
                  <button 
                    key={`${item.taxpayer_number}-${item.location_number}`} 
                    onClick={() => analyzeLocation(item)} 
                    className={`w-full text-left p-5 rounded-3xl border transition-all flex items-center justify-between group ${active ? 'bg-indigo-500 border-indigo-400 shadow-xl shadow-indigo-500/10' : 'bg-[#1E293B] border-slate-700 hover:border-slate-500'}`}
                  >
                    <div className="truncate">
                      <h4 className={`font-black uppercase truncate text-sm italic tracking-tight ${active ? 'text-slate-900' : 'text-slate-100 group-hover:text-indigo-400'}`}>{item.location_name}</h4>
                      <p className={`text-[9px] uppercase font-bold truncate mt-0.5 ${active ? 'text-slate-900/70' : 'text-slate-500'}`}>
                        {item.location_address}, {item.location_city}
                      </p>
                    </div>
                    <ChevronRight size={18} className={`${active ? 'text-slate-900' : 'text-slate-600 group-hover:text-indigo-400'} transition-colors`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-8">
          {selectedEstablishment ? (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="bg-[#1E293B] p-8 md:p-10 rounded-[2.5rem] border border-slate-700 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                
                <div className="flex flex-col md:flex-row justify-between gap-8 mb-10 relative z-10">
                  <div className="flex-1 space-y-6">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg text-[9px] font-black uppercase border border-indigo-500/20 tracking-[0.2em]">{selectedEstablishment.info.tabc_permit_number || 'TABC ACTIVE'}</span>
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[9px] font-black uppercase border border-emerald-500/20 tracking-[0.2em]">Verified Data</span>
                      </div>
                      <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase italic mt-4 leading-none">{selectedEstablishment.info.location_name}</h2>
                      <p className="text-slate-400 flex items-center gap-2 mt-5 text-[11px] font-bold uppercase tracking-widest"><MapPin size={16} className="text-indigo-400" /> {selectedEstablishment.info.location_address}, {selectedEstablishment.info.location_city}, TX</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-[#0F172A]/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
                        <div className="flex items-center gap-2 text-indigo-400 mb-2"><Building2 size={12} /><span className="text-[9px] font-black uppercase tracking-widest opacity-70">Taxpayer Entity</span></div>
                        <p className="font-black text-slate-100 text-[11px] uppercase tracking-tight">{selectedEstablishment.info.taxpayer_name}</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl text-slate-900 shadow-xl flex flex-col justify-center border-b-4 border-indigo-500">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Est. Combined Monthly Revenue</p>
                        <p className="text-3xl font-black tracking-tighter italic">{formatCurrency(stats.estimatedTotalAvg)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Intelligence Engine */}
                <div className="bg-[#0F172A]/60 rounded-[2rem] border border-slate-700/50 p-6 md:p-8 relative z-10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-500 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
                            <Sparkles className="text-white" size={20} />
                        </div>
                        <div>
                            <h3 className="text-[11px] font-black uppercase italic tracking-[0.2em] text-white">Owner Intelligence Engine</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Cross-Referencing Records</span>
                              {groundingSources.length > 0 && (
                                <span className="flex items-center gap-1 text-[7px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/20 uppercase font-black">
                                  <Globe size={8} /> Web Grounded
                                </span>
                              )}
                            </div>
                        </div>
                    </div>
                    {aiLoading && (
                        <div className="flex items-center gap-2 text-indigo-400 bg-indigo-500/5 px-3 py-1.5 rounded-full border border-indigo-500/10">
                            <span className="text-[9px] font-black uppercase animate-pulse tracking-widest">Searching Records...</span>
                            <Loader2 size={12} className="animate-spin" />
                        </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 transition-all min-h-[110px] flex flex-col">
                        <div className="flex items-center gap-2 mb-3">
                            <UserCheck size={14} className="text-indigo-400" />
                            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Ownership</span>
                        </div>
                        {aiLoading ? (
                            <div className="space-y-3 w-full mt-1"><div className="h-1.5 bg-slate-800 rounded w-full animate-pulse"></div><div className="h-1.5 bg-slate-800 rounded w-2/3 animate-pulse"></div></div>
                        ) : (
                            <p className="text-[11px] text-slate-200 font-bold leading-relaxed uppercase tracking-tight">{aiContent?.owners}</p>
                        )}
                    </div>
                    <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 transition-all min-h-[110px] flex flex-col">
                        <div className="flex items-center gap-2 mb-3">
                            <Globe size={14} className="text-emerald-400" />
                            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Footprint</span>
                        </div>
                        {aiLoading ? (
                            <div className="space-y-3 w-full mt-1"><div className="h-1.5 bg-slate-800 rounded w-full animate-pulse"></div><div className="h-1.5 bg-slate-800 rounded w-2/3 animate-pulse"></div></div>
                        ) : (
                            <p className="text-[11px] text-slate-200 font-bold leading-relaxed uppercase tracking-tight">{aiContent?.locations}</p>
                        )}
                    </div>
                    <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 transition-all min-h-[110px] flex flex-col">
                        <div className="flex items-center gap-2 mb-3">
                            <Target size={14} className="text-amber-400" />
                            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Bio / Vibe</span>
                        </div>
                        {aiLoading ? (
                            <div className="space-y-3 w-full mt-1"><div className="h-1.5 bg-slate-800 rounded w-full animate-pulse"></div><div className="h-1.5 bg-slate-800 rounded w-2/3 animate-pulse"></div></div>
                        ) : (
                            <p className="text-[11px] text-slate-200 font-bold leading-relaxed uppercase tracking-tight line-clamp-3">{aiContent?.details}</p>
                        )}
                    </div>
                  </div>

                  {groundingSources.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-slate-800/50">
                      <div className="flex items-center gap-2 mb-3">
                        <Link2 size={12} className="text-slate-600" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">Verification Sources</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {groundingSources.slice(0, 4).map((source, i) => (
                          <a key={i} href={source.uri} target="_blank" rel="noopener noreferrer" className="text-[8px] bg-slate-800/50 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-slate-400 border border-slate-700/50 transition-colors truncate max-w-[140px] font-bold uppercase tracking-tighter">
                            {source.title || 'Source'}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700 shadow-lg">
                  <div className="flex items-center gap-3 mb-6 font-black uppercase italic text-xs tracking-widest text-indigo-400"><Utensils size={16} /> Market Category Estimator</div>
                  
                  <div className="mb-6">
                    <select 
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-[10px] font-black text-slate-200 uppercase italic outline-none transition-all hover:border-indigo-500/50 appearance-none cursor-pointer" 
                      value={venueType} 
                      onChange={(e) => setVenueType(e.target.value)}
                    >
                      {Object.entries(VENUE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>

                  <div className="mb-8 space-y-3 bg-[#0F172A]/30 p-5 rounded-2xl border border-slate-800/50">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                      <span className="text-emerald-400">Food {(stats.config.foodPct * 100).toFixed(0)}%</span>
                      <span className="text-indigo-400">Alcohol {(stats.config.alcoholPct * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full bg-[#0F172A] rounded-full overflow-hidden flex border border-slate-800">
                      <div className="h-full bg-emerald-500 transition-all duration-500 ease-out" style={{ width: `${stats.config.foodPct * 100}%` }}></div>
                      <div className="h-full bg-indigo-500 transition-all duration-500 ease-out" style={{ width: `${stats.config.alcoholPct * 100}%` }}></div>
                    </div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase italic tracking-tight">{stats.config.desc}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Alcohol Avg</p>
                      <p className="text-xl font-black text-white italic tracking-tighter">{formatCurrency(stats.averageAlcohol)}</p>
                    </div>
                    <div className="bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800">
                      <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Food Est.</p>
                      <p className="text-xl font-black text-white italic tracking-tighter">{formatCurrency(stats.estimatedFoodAvg)}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700 shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-[10px] font-black uppercase italic tracking-widest text-white">Monthly Trend</h3>
                        <div className="flex gap-3 text-[7px] font-black uppercase tracking-widest">
                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div> Liq</span>
                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-indigo-300 rounded-full"></div> Beer</span>
                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> Wine</span>
                        </div>
                    </div>
                    <div className="h-[230px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={selectedEstablishment.history} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke="#ffffff05" />
                                <XAxis dataKey={DATE_FIELD} tickFormatter={formatDate} tick={{fontSize: 7, fill: '#475569', fontWeight: 900}} axisLine={false} tickLine={false} />
                                <YAxis tickFormatter={formatCurrency} tick={{fontSize: 7, fill: '#475569', fontWeight: 900}} axisLine={false} tickLine={false} />
                                <Tooltip 
                                  cursor={{fill: '#ffffff05'}} 
                                  contentStyle={{backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '12px', fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase'}} 
                                  formatter={(value) => [`$${parseFloat(value).toLocaleString()}`, '']} 
                                />
                                <Bar dataKey="liquor" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="beer" stackId="a" fill="#818cf8" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="wine" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[600px] flex flex-col items-center justify-center text-center space-y-6 bg-[#1E293B]/20 rounded-[3rem] border border-dashed border-slate-700">
               <div className="relative">
                  <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full"></div>
                  <div className="relative w-24 h-24 bg-[#1E293B] rounded-3xl border border-slate-700 flex items-center justify-center shadow-2xl">
                    <Search size={40} className="text-indigo-400 opacity-40" />
                  </div>
               </div>
               <div>
                  <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">System Idle</h2>
                  <p className="text-slate-500 max-w-xs mt-3 font-bold uppercase text-[10px] tracking-widest leading-loose">Enter an establishment name to trigger the intelligence scraper.</p>
               </div>
            </div>
          )}
          
          {viewMode === 'top' && topAccounts.length > 0 && (
            <div className="bg-[#1E293B] rounded-[2.5rem] border border-slate-700 overflow-hidden shadow-2xl mt-8">
              <div className="p-8 border-b border-slate-700 flex justify-between items-center bg-[#0F172A]/30 font-black text-white italic uppercase tracking-tighter text-lg">Market Leaders: {topCitySearch}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#0F172A]/50 text-[9px] uppercase font-black text-slate-500 tracking-[0.2em]">
                    <tr>
                      <th className="p-8">Rank</th>
                      <th className="p-8">Establishment</th>
                      <th className="p-8 text-right">Avg Mo Volume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {topAccounts.map((account, index) => {
                      const active = isSelected(account);
                      return (
                        <tr key={index} onClick={() => analyzeLocation(account)} className={`cursor-pointer transition-all group ${active ? 'bg-indigo-500/10' : 'hover:bg-slate-800/50'}`}>
                          <td className="p-8">
                            <span className={`w-8 h-8 flex items-center justify-center rounded-xl font-black text-[11px] italic ${index < 3 ? 'bg-amber-400 text-slate-900 shadow-lg shadow-amber-400/20' : 'bg-slate-800 text-slate-500'}`}>
                              {index+1}
                            </span>
                          </td>
                          <td className="p-8">
                            <div className="flex flex-col">
                              <span className={`font-black uppercase italic text-sm tracking-tight ${active ? 'text-indigo-400' : 'text-slate-100 group-hover:text-indigo-400 transition-colors'}`}>{account.location_name}</span>
                              <span className="text-[9px] font-bold text-slate-600 uppercase mt-1 tracking-widest">{account.location_address}</span>
                            </div>
                          </td>
                          <td className="p-8 text-right">
                            <span className="font-black text-xl tracking-tighter text-white italic">{formatCurrency(account.avg_monthly_volume)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
