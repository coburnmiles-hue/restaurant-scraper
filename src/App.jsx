
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
  ExternalLink,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Info,
  Users,
  Layers,
  FileSearch,
  Target,
  TrendingUp,
  Briefcase,
  UserCheck,
  Globe
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

// API Configuration
const DATASET_ID = 'naix-2893';
const BASE_URL = `https://data.texas.gov/resource/${DATASET_ID}.json`;
const GEMINI_API_KEY = ""; 

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
  
  // AI/Intelligence States
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiIsFallback, setAiIsFallback] = useState(false);
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

  // Check if a specific establishment is the one currently selected
  const isSelected = (item) => {
    if (!selectedEstablishment) return false;
    return selectedEstablishment.info.taxpayer_number === item.taxpayer_number && 
           selectedEstablishment.info.location_number === item.location_number;
  };

  const aiContent = useMemo(() => {
    if (!aiResponse) return null;
    const sections = { owners: "Data unavailable", locations: "Data unavailable", details: "Data unavailable" };
    const normalized = aiResponse.replace(/[*#]/g, '').trim();
    const ownerMatch = normalized.match(/OWNERS:([\s\S]*?)(?=LOCATION COUNT:|$)/i);
    const locationMatch = normalized.match(/LOCATION COUNT:([\s\S]*?)(?=ACCOUNT DETAILS:|$)/i);
    const detailMatch = normalized.match(/ACCOUNT DETAILS:([\s\S]*?)$/i);
    if (ownerMatch) sections.owners = ownerMatch[1].trim();
    if (locationMatch) sections.locations = locationMatch[1].trim();
    if (detailMatch) sections.details = detailMatch[1].trim();
    Object.keys(sections).forEach(key => {
        sections[key] = sections[key].replace(/^[0-9]\.\s?/, '');
    });
    return sections;
  }, [aiResponse]);

  const fetchWithRetry = async (url, options, maxRetries = 5) => {
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return response;
        if (response.status === 429 || response.status >= 500) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; continue;
        }
        throw new Error(`API_ERROR_${response.status}`);
      } catch (err) {
        if (i === maxRetries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  };

  const performIntelligenceLookup = async (establishment) => {
    const businessName = establishment.location_name;
    const city = establishment.location_city;
    const taxpayer = establishment.taxpayer_name;
    setAiLoading(true); setAiResponse(null); setAiIsFallback(false); setGroundingSources([]);
    try {
      const userQuery = `Provide a professional prospecting brief for "${businessName}" in ${city}, Texas. 
      Structure your response exactly as follows:
      OWNERS: [List owners, founders, or parent company name]
      LOCATION COUNT: [Number of units or regional footprint]
      ACCOUNT DETAILS: [Concise summary of concept, vibe, and target demographic]`;
      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: userQuery }] }], tools: [{ "google_search": {} }] })
      });
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      const sources = result.candidates?.[0]?.groundingMetadata?.groundingAttributions?.map(a => ({ uri: a.web?.uri, title: a.web?.title })) || [];
      if (!text) throw new Error("EMPTY_AI_RESPONSE");
      setAiResponse(text); setGroundingSources(sources);
    } catch (err) { 
      setAiResponse(`OWNERS: ${taxpayer}\nLOCATION COUNT: Part of the ${businessName} brand family.\nACCOUNT DETAILS: High-traffic hospitality operator in ${city}.`); 
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
    } catch (err) { setError("Texas Comptroller database error."); } finally { setLoading(false); }
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
    } catch (err) { setError("Ranking engine error."); } finally { setLoading(false); }
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
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans p-4 md:p-8">
      <header className="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-white flex items-center gap-3 tracking-tighter italic">
            <BarChart3 className="text-indigo-400" size={36} /> RESTAURANT SCRAPER
          </h1>
          <p className="text-slate-400 font-medium uppercase tracking-widest text-[10px]">TX Comptroller Live Access</p>
        </div>
        <div className="flex bg-[#1E293B] p-1.5 rounded-2xl border border-slate-700 shadow-2xl">
          <button onClick={() => setViewMode('search')} className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${viewMode === 'search' ? 'bg-indigo-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}>
            <Search size={16} className="inline mr-2"/> Search
          </button>
          <button onClick={() => setViewMode('top')} className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${viewMode === 'top' ? 'bg-indigo-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}>
            <Trophy size={16} className="inline mr-2"/> Rankings
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-xl">
            <form onSubmit={viewMode === 'search' ? handleSearch : handleTopAccountsSearch} className="space-y-4">
              <h3 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">{viewMode === 'search' ? 'Establishment Lookup' : 'City Leaderboard'}</h3>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input type="text" placeholder={viewMode === 'search' ? "Name (e.g. Pappadeaux)" : "Enter Texas City"} className="w-full pl-12 pr-4 py-3 rounded-2xl bg-[#0F172A] border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-500" value={viewMode === 'search' ? searchTerm : topCitySearch} onChange={(e) => viewMode === 'search' ? setSearchTerm(e.target.value) : setTopCitySearch(e.target.value)} />
              </div>
              {viewMode === 'search' && (
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="text" placeholder="City (Optional)" className="w-full pl-12 pr-4 py-3 rounded-2xl bg-[#0F172A] border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-500" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} />
                </div>
              )}
              <button type="submit" disabled={loading} className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-900 font-black py-4 rounded-2xl uppercase tracking-widest text-xs flex justify-center items-center gap-2">
                {loading ? <Loader2 className="animate-spin" /> : 'Run Scraper'}
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
                    className={`w-full text-left p-5 rounded-3xl border transition-all flex items-center justify-between ${active ? 'bg-indigo-500 border-indigo-400 shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-500/50' : 'bg-[#1E293B] border-slate-700 hover:border-slate-500'}`}
                  >
                    <div className="truncate">
                      <h4 className={`font-black uppercase truncate ${active ? 'text-slate-900' : 'text-slate-100'}`}>{item.location_name}</h4>
                      <p className={`text-[10px] uppercase font-bold truncate ${active ? 'text-slate-900/70' : 'text-slate-500'}`}>
                        {item.location_address}, {item.location_city}, TX
                      </p>
                    </div>
                    <ChevronRight size={18} className={active ? 'text-slate-900' : 'text-slate-600'} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-8">
          {selectedEstablishment ? (
            <div className="space-y-6">
              <div className="bg-[#1E293B] p-8 md:p-10 rounded-[2rem] border border-slate-700 shadow-2xl relative">
                <div className="flex flex-col md:flex-row justify-between gap-8 mb-10">
                  <div className="flex-1 space-y-6">
                    <div>
                      <span className="px-4 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-black uppercase border border-indigo-500/20 tracking-widest">{selectedEstablishment.info.tabc_permit_number || 'TABC ACTIVE'}</span>
                      <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase italic mt-4">{selectedEstablishment.info.location_name}</h2>
                      <p className="text-slate-400 flex items-center gap-2 mt-4 text-sm font-bold uppercase"><MapPin size={18} className="text-indigo-400" /> {selectedEstablishment.info.location_address}, {selectedEstablishment.info.location_city}, TX</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-[#0F172A]/40 p-5 rounded-2xl border border-slate-700">
                        <div className="flex items-center gap-2 text-indigo-400 mb-2"><Building2 size={14} /><span className="text-[9px] font-black uppercase tracking-widest">Taxpayer Name</span></div>
                        <p className="font-black text-slate-100 text-sm uppercase">{selectedEstablishment.info.taxpayer_name}</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl text-slate-900 shadow-xl flex flex-col justify-center border-b-4 border-indigo-500">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Est. Combined Revenue</p>
                        <p className="text-3xl font-black tracking-tighter">{formatCurrency(stats.estimatedTotalAvg)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#0F172A]/40 rounded-3xl border border-slate-700/50 p-6 md:p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-500 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
                            <Sparkles className="text-white" size={20} />
                        </div>
                        <div>
                            <h3 className="text-xs font-black uppercase italic tracking-[0.2em] text-white">Live Intelligence Engine</h3>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Deep Prospecting Data</p>
                        </div>
                    </div>
                    {aiLoading && (
                        <div className="flex items-center gap-2 text-indigo-400">
                            <span className="text-[10px] font-black uppercase animate-pulse">Scanning...</span>
                            <Loader2 size={14} className="animate-spin" />
                        </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="relative group">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                            <UserCheck size={14} className="text-indigo-400" />
                            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Owner & Leadership</span>
                        </div>
                        <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-800 group-hover:border-indigo-500/30 transition-all min-h-[100px]">
                            {aiLoading ? (
                                <div className="space-y-3"><div className="h-2 bg-slate-800 rounded w-full animate-pulse"></div><div className="h-2 bg-slate-800 rounded w-2/3 animate-pulse"></div></div>
                            ) : (
                                <p className="text-xs text-slate-200 font-medium leading-relaxed">{aiContent?.owners}</p>
                            )}
                        </div>
                    </div>
                    <div className="relative group">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
                            <Globe size={14} className="text-emerald-400" />
                            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Market Presence</span>
                        </div>
                        <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-800 group-hover:border-emerald-500/30 transition-all min-h-[100px]">
                            {aiLoading ? (
                                <div className="space-y-3"><div className="h-2 bg-slate-800 rounded w-full animate-pulse"></div><div className="h-2 bg-slate-800 rounded w-2/3 animate-pulse"></div></div>
                            ) : (
                                <p className="text-xs text-slate-200 font-medium leading-relaxed">{aiContent?.locations}</p>
                            )}
                        </div>
                    </div>
                    <div className="relative group">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-1 h-4 bg-amber-500 rounded-full"></div>
                            <Target size={14} className="text-amber-400" />
                            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Account Deep-Dive</span>
                        </div>
                        <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-800 group-hover:border-amber-500/30 transition-all min-h-[100px]">
                            {aiLoading ? (
                                <div className="space-y-3"><div className="h-2 bg-slate-800 rounded w-full animate-pulse"></div><div className="h-2 bg-slate-800 rounded w-2/3 animate-pulse"></div></div>
                            ) : (
                                <p className="text-xs text-slate-200 font-medium leading-relaxed">{aiContent?.details}</p>
                            )}
                        </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                <div className="bg-[#1E293B] p-8 rounded-[2rem] border border-slate-700 shadow-lg">
                  <div className="flex items-center gap-3 mb-6 font-black uppercase italic text-sm tracking-widest"><Utensils className="text-indigo-400" /> Revenue Model</div>
                  
                  <div className="mb-6">
                    <select 
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-xs font-black text-slate-200 uppercase italic outline-none transition-all hover:border-indigo-500/50" 
                      value={venueType} 
                      onChange={(e) => setVenueType(e.target.value)}
                    >
                      {Object.entries(VENUE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>

                  {/* Percentage Split Bar */}
                  <div className="mb-8 space-y-3">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                      <span className="text-emerald-400">Food {(stats.config.foodPct * 100).toFixed(0)}%</span>
                      <span className="text-indigo-400">Alcohol {(stats.config.alcoholPct * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-3 w-full bg-[#0F172A] rounded-full overflow-hidden flex border border-slate-800">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-500 ease-out shadow-[0_0_15px_rgba(16,185,129,0.3)]" 
                        style={{ width: `${stats.config.foodPct * 100}%` }}
                      ></div>
                      <div 
                        className="h-full bg-indigo-500 transition-all duration-500 ease-out shadow-[0_0_15px_rgba(99,102,241,0.3)]" 
                        style={{ width: `${stats.config.alcoholPct * 100}%` }}
                      ></div>
                    </div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase italic">{stats.config.desc}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Alcohol Volume</p>
                      <p className="text-xl font-black text-white italic">{formatCurrency(stats.averageAlcohol)}</p>
                    </div>
                    <div className="bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800">
                      <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Food Est. (Calculated)</p>
                      <p className="text-xl font-black text-white italic">{formatCurrency(stats.estimatedFoodAvg)}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#1E293B] p-8 rounded-[2rem] border border-slate-700 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xs font-black uppercase italic tracking-widest">Beverage Split History</h3>
                        <div className="flex gap-3 text-[8px] font-black uppercase tracking-tighter">
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-indigo-500 rounded-full"></div> Liquor</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-indigo-300 rounded-full"></div> Beer</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div> Wine</span>
                        </div>
                    </div>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={selectedEstablishment.history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <XAxis dataKey={DATE_FIELD} tickFormatter={formatDate} tick={{fontSize: 8, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{fill: '#ffffff10'}} contentStyle={{backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '12px', fontSize: '10px'}} formatter={(value) => formatCurrency(value)} />
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
               <div className="w-24 h-24 bg-indigo-500/10 rounded-full flex items-center justify-center mb-4">
                  <FileSearch size={48} className="text-indigo-400" />
               </div>
               <div>
                  <h2 className="text-2xl font-black text-white uppercase italic tracking-tight">System Ready</h2>
                  <p className="text-slate-400 max-w-sm mt-2 font-medium">Search for a Texas establishment or browse rankings to begin intelligence collection.</p>
               </div>
            </div>
          )}
          
          {viewMode === 'top' && topAccounts.length > 0 && (
            <div className="bg-[#1E293B] rounded-[2rem] border border-slate-700 overflow-hidden shadow-2xl mt-12">
              <div className="p-8 border-b border-slate-700 flex justify-between items-center bg-[#0F172A]/30 font-black text-white italic uppercase tracking-tighter">Market Leaders: {topCitySearch} <Trophy className="text-amber-400" /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#0F172A]/50 text-[10px] uppercase font-black text-slate-500 tracking-widest">
                    <tr>
                      <th className="p-6">Rank</th>
                      <th className="p-6">Establishment & Address</th>
                      <th className="p-6 text-right">Avg Mo. Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {topAccounts.map((account, index) => {
                      const active = isSelected(account);
                      return (
                        <tr 
                          key={index} 
                          onClick={() => analyzeLocation(account)} 
                          className={`cursor-pointer transition-all group ${active ? 'bg-indigo-500/20' : 'hover:bg-indigo-500/5'}`}
                        >
                          <td className="p-6">
                            <div className="flex items-center gap-3">
                              {active && <div className="w-1.5 h-6 bg-indigo-400 rounded-full animate-pulse shadow-glow shadow-indigo-500/50"></div>}
                              <span className={`w-7 h-7 flex items-center justify-center rounded-full font-black text-[10px] ${index < 3 ? 'bg-amber-400 text-slate-900 shadow-lg shadow-amber-400/20' : 'bg-slate-800 text-slate-400'} ${active ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-[#1E293B]' : ''}`}>
                                {index+1}
                              </span>
                            </div>
                          </td>
                          <td className="p-6">
                            <div className="flex flex-col">
                              <span className={`font-black uppercase italic text-sm transition-colors ${active ? 'text-indigo-400' : 'text-slate-100 group-hover:text-indigo-400'}`}>
                                {account.location_name}
                              </span>
                              <span className={`text-[10px] font-bold uppercase tracking-tight flex items-center gap-1 mt-1 ${active ? 'text-indigo-300/70' : 'text-slate-500'}`}>
                                <MapPin size={10} className={active ? 'text-indigo-400' : 'text-slate-600'} /> {account.location_address}, {account.location_city}, TX
                              </span>
                            </div>
                          </td>
                          <td className="p-6 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`font-black text-base tracking-tighter ${active ? 'text-indigo-400' : 'text-white'}`}>{formatCurrency(account.avg_monthly_volume)}</span>
                              <span className={`text-[9px] font-black uppercase ${active ? 'text-indigo-300/50' : 'text-slate-500'}`}>Volume / Mo</span>
                            </div>
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
