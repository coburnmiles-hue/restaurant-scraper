
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  BarChart3, 
  MapPin, 
  ChevronRight,
  Loader2,
  Utensils,
  Trophy,
  Sparkles,
  Target,
  UserCheck,
  Globe,
  TrendingUp,
  PieChart as PieIcon
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

/**
 * API CONFIGURATION
 * Integrated provided key for immediate deployment functionality.
 */
const API_KEY = "AIzaSyBmwwb-a_Ud2SCWut9Of2BG0980XXfZFzY";

// Dataset Configuration
const DATASET_ID = 'naix-2893';
const BASE_URL = `https://data.texas.gov/resource/${DATASET_ID}.json`;
const DATE_FIELD = 'obligation_end_date_yyyymmdd';
const TOTAL_FIELD = 'total_receipts';

const VENUE_TYPES = {
  fine_dining: { label: 'Fine Dining', foodPct: 0.75, alcoholPct: 0.25, desc: '75% Food / 25% Alcohol' },
  upscale_casual: { label: 'Upscale Casual', foodPct: 0.65, alcoholPct: 0.35, desc: '65% Food / 35% Alcohol' },
  casual_dining: { label: 'Casual Dining', foodPct: 0.60, alcoholPct: 0.40, desc: '60% Food / 40% Alcohol' },
  pub_grill: { label: 'Pub & Grill', foodPct: 0.50, alcoholPct: 0.50, desc: '50% Food / 50% Alcohol' },
  sports_bar: { label: 'Sports Bar', foodPct: 0.35, alcoholPct: 0.65, desc: '35% Food / 65% Alcohol' },
  dive_bar: { label: 'Dive Bar / Tavern', foodPct: 0.15, alcoholPct: 0.85, desc: '15% Food / 85% Alcohol' },
  nightclub: { label: 'Nightclub / Lounge', foodPct: 0.05, alcoholPct: 0.95, desc: '5% Food / 95% Alcohol' },
  no_food: { label: 'No Food (Alcohol Only)', foodPct: 0.00, alcoholPct: 1.00, desc: '0% Food / 100% Alcohol' },
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

  const callGeminiWithRetry = async (prompt, retries = 5, delay = 1000) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: "You are a business intelligence assistant specialized in the Texas hospitality market. Search for real-world ownership data." }] },
          tools: [{ "google_search": {} }]
        })
      });

      if (!response.ok) {
        if (retries > 0 && (response.status === 429 || response.status >= 500)) {
          await new Promise(resolve => setTimeout(resolve, delay));
          return callGeminiWithRetry(prompt, retries - 1, delay * 2);
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API Error: ${response.status}`);
      }
      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (err) {
      if (retries > 0 && err.message.includes('fetch')) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return callGeminiWithRetry(prompt, retries - 1, delay * 2);
      }
      throw err;
    }
  };

  const performIntelligenceLookup = async (establishment) => {
    const businessName = establishment.location_name;
    const city = establishment.location_city;
    const taxpayer = establishment.taxpayer_name;
    setAiLoading(true); 
    setAiResponse(null);
    try {
      const userQuery = `Find the individual owners or executive management for "${businessName}" in ${city}, TX. Look specifically for the people behind the LLC "${taxpayer}". Format as OWNERS: ..., LOCATION COUNT: ..., ACCOUNT DETAILS: ...`;
      const text = await callGeminiWithRetry(userQuery);
      setAiResponse(text || "No data returned.");
    } catch (err) { 
      setAiResponse(`OWNERS: Data unavailable\nLOCATION COUNT: Connection Error\nACCOUNT DETAILS: ${err.message}`); 
    } finally { 
      setAiLoading(false); 
    }
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;
    setLoading(true); setError(null); setSelectedEstablishment(null); setAiResponse(null);
    try {
      const cleanSearch = searchTerm.trim().toUpperCase();
      const cleanCity = cityFilter.trim().toUpperCase();
      
      const isLikelyAddress = /\d/.test(cleanSearch);
      
      let whereClause = isLikelyAddress 
        ? `(upper(location_name) like '%${cleanSearch}%' OR upper(location_address) like '%${cleanSearch}%')`
        : `upper(location_name) like '%${cleanSearch}%'`;
        
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
    } catch (err) { 
      setError("Comptroller DB connection error."); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleTopAccountsSearch = async (e) => {
    if (e) e.preventDefault();
    if (!topCitySearch.trim()) return;
    setLoading(true); setTopAccounts([]); setError(null);
    try {
      const input = topCitySearch.trim().toUpperCase();
      const isZip = /^\d{5}$/.test(input);
      const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const dateString = oneYearAgo.toISOString().split('T')[0] + "T00:00:00.000";
      const locationCondition = isZip ? `location_zip = '${input}'` : `upper(location_city) = '${input}'`;
      
      const query = `?$select=location_name, location_address, location_city, taxpayer_name, taxpayer_number, location_number, sum(${TOTAL_FIELD}) as annual_sales, count(${TOTAL_FIELD}) as months_count` +
                    `&$where=${locationCondition} AND ${DATE_FIELD} > '${dateString}'` +
                    `&$group=location_name, location_address, location_city, taxpayer_name, taxpayer_number, location_number` +
                    `&$order=annual_sales DESC&$limit=50`;
      
      const response = await fetch(BASE_URL + query);
      const data = await response.json();
      setTopAccounts(data.map(account => ({
        ...account,
        annual_sales: parseFloat(account.annual_sales),
        avg_monthly_volume: parseFloat(account.annual_sales) / (parseInt(account.months_count) || 12)
      })));
    } catch (err) { 
      setError("Ranking engine error."); 
    } finally { 
      setLoading(false); 
    }
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
          wine: parseFloat(h.wine_receipts || 0),
          alcohol_total: parseFloat(h[TOTAL_FIELD] || 0)
        }))
      });
      performIntelligenceLookup(establishment);
    } catch (err) { 
      setError(err.message); 
    } finally { 
      setLoading(false); 
    }
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

  const stats = useMemo(() => {
    if (!selectedEstablishment || !selectedEstablishment.history.length) return null;
    const history = selectedEstablishment.history;
    const nonZeroMonths = history.filter(m => m.alcohol_total > 0);
    const averageAlcohol = nonZeroMonths.length > 0 ? (nonZeroMonths.reduce((sum, m) => sum + m.alcohol_total, 0) / nonZeroMonths.length) : 0;
    const config = VENUE_TYPES[venueType];
    const estimatedFoodAvg = config.alcoholPct > 0 ? (averageAlcohol / config.alcoholPct) * config.foodPct : 0;
    return { averageAlcohol, estimatedFoodAvg, estimatedTotalAvg: averageAlcohol + estimatedFoodAvg, config };
  }, [selectedEstablishment, venueType]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans p-4 md:p-8 relative selection:bg-indigo-500/30">
      <header className="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="relative">
             <div className="absolute -inset-1 bg-indigo-500 blur opacity-20 rounded-full"></div>
             <div className="relative bg-[#1E293B] p-3 rounded-2xl border border-slate-700">
                <BarChart3 className="text-indigo-400" size={32} />
             </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic leading-none">Market Intelligence</h1>
              <span className="bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase">v1.0.1</span>
            </div>
            <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[9px] mt-1">TX Hospitality Analytics Engine</p>
          </div>
        </div>
        
        <div className="flex bg-[#1E293B] p-1.5 rounded-2xl border border-slate-700 shadow-2xl">
          <button onClick={() => setViewMode('search')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all uppercase tracking-widest ${viewMode === 'search' ? 'bg-indigo-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}>
            <Search size={14} className="inline mr-2 -mt-0.5"/> Search
          </button>
          <button onClick={() => setViewMode('top')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all uppercase tracking-widest ${viewMode === 'top' ? 'bg-indigo-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}>
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
                {viewMode === 'search' ? 'Name or Address Search' : 'City/Zip Ranking Scrape'}
              </h3>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input 
                    type="text" 
                    placeholder={viewMode === 'search' ? "Name or Street Address..." : "TX City or Zip Code..."} 
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-[#0F172A] border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all uppercase" 
                    value={viewMode === 'search' ? searchTerm : topCitySearch} 
                    onChange={(e) => viewMode === 'search' ? setSearchTerm(e.target.value.toUpperCase()) : setTopCitySearch(e.target.value.toUpperCase())} 
                  />
                </div>
                {viewMode === 'search' && (
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="text" 
                      placeholder="City Filter (Optional)..." 
                      className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-[#0F172A] border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all uppercase" 
                      value={cityFilter} 
                      onChange={(e) => setCityFilter(e.target.value.toUpperCase())} 
                    />
                  </div>
                )}
              </div>
              <button type="submit" disabled={loading} className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-900 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] flex justify-center items-center gap-2 transition-all">
                {loading ? <Loader2 className="animate-spin" size={18} /> : (viewMode === 'search' ? 'Execute Scrape' : 'Analyze Market')}
              </button>
            </form>
          </section>

          {((viewMode === 'search' && results.length > 0) || (viewMode === 'top' && topAccounts.length > 0)) && (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {(viewMode === 'search' ? results : topAccounts).map((item, idx) => (
                <button 
                  key={`${item.taxpayer_number}-${item.location_number}`} 
                  onClick={() => analyzeLocation(item)} 
                  className={`w-full text-left p-5 rounded-3xl border transition-all flex items-center justify-between group ${isSelected(item) ? 'bg-indigo-500 border-indigo-400 shadow-lg shadow-indigo-500/20' : 'bg-[#1E293B] border-slate-700 hover:border-slate-500'}`}
                >
                  <div className="flex items-center gap-4 truncate">
                    {viewMode === 'top' && <span className={`text-[10px] font-black w-6 ${isSelected(item) ? 'text-slate-900' : 'text-slate-500'}`}>{idx + 1}</span>}
                    <div className="truncate">
                      <h4 className={`font-black uppercase truncate text-sm italic tracking-tight ${isSelected(item) ? 'text-slate-900' : 'text-slate-100 group-hover:text-indigo-400'}`}>{item.location_name}</h4>
                      <p className={`text-[9px] uppercase font-bold truncate mt-0.5 ${isSelected(item) ? 'text-slate-900/70' : 'text-slate-500'}`}>{item.location_address}, {item.location_city}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {viewMode === 'top' && (
                      <div className="text-right">
                        <p className={`text-sm font-black italic tracking-tighter ${isSelected(item) ? 'text-slate-900' : 'text-indigo-400'}`}>{formatCurrency(item.avg_monthly_volume)}</p>
                        <p className={`text-[7px] font-black uppercase tracking-tighter opacity-60 ${isSelected(item) ? 'text-slate-900' : 'text-slate-500'}`}>Alc. Vol/Mo</p>
                      </div>
                    )}
                    <ChevronRight size={16} className={isSelected(item) ? 'text-slate-900' : 'text-slate-600'} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-8">
          {selectedEstablishment ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-[#1E293B] p-8 md:p-10 rounded-[2.5rem] border border-slate-700 shadow-2xl relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                  <div>
                    <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase italic leading-none">{selectedEstablishment.info.location_name}</h2>
                    <p className="text-slate-400 flex items-center gap-2 mt-5 text-[11px] font-bold uppercase tracking-widest"><MapPin size={16} className="text-indigo-400" /> {selectedEstablishment.info.location_address}, {selectedEstablishment.info.location_city}</p>
                  </div>
                  <div className="bg-indigo-500 p-6 rounded-[2rem] shadow-xl shadow-indigo-500/20 border border-white/10 shrink-0 min-w-[220px]">
                    <p className="text-[9px] font-black text-indigo-950 uppercase tracking-widest mb-1 flex items-center gap-2"><TrendingUp size={12} /> Est. Total GPV</p>
                    <p className="text-4xl font-black text-white italic tracking-tighter leading-none">{formatCurrency(stats.estimatedTotalAvg)}</p>
                  </div>
                </div>
                <div className="bg-[#0F172A]/60 rounded-[2rem] border border-slate-700/50 p-6 md:p-8 mt-10 relative z-10">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="bg-indigo-500 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
                      {aiLoading ? <Loader2 className="text-white animate-spin" size={20} /> : <Sparkles className="text-white" size={20} />}
                    </div>
                    <h3 className="text-[11px] font-black uppercase italic tracking-[0.2em] text-white">Owner Intelligence Engine</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 h-full min-h-[140px]">
                      <div className="flex items-center gap-2 mb-3"><UserCheck size={14} className="text-indigo-400" /><span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Ownership</span></div>
                      <p className="text-[11px] text-slate-200 font-bold leading-relaxed uppercase tracking-tight">{aiLoading ? "Decrypting ownership..." : aiContent?.owners}</p>
                    </div>
                    <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 h-full min-h-[140px]">
                      <div className="flex items-center gap-2 mb-3"><Globe size={14} className="text-emerald-400" /><span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Location Count</span></div>
                      <p className="text-[11px] text-slate-200 font-bold leading-relaxed uppercase tracking-tight">{aiLoading ? "Scanning network..." : aiContent?.locations}</p>
                    </div>
                    <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 h-full min-h-[140px]">
                      <div className="flex items-center gap-2 mb-3"><Target size={14} className="text-amber-400" /><span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Bio / Vibe</span></div>
                      <p className="text-[11px] text-slate-200 font-bold leading-relaxed uppercase tracking-tight">{aiLoading ? "Analyzing brand..." : aiContent?.details}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700 shadow-xl">
                  <div className="flex items-center gap-3 mb-6 font-black uppercase italic text-xs tracking-widest text-indigo-400"><Utensils size={16} /> Market Category</div>
                  <select className="w-full bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-[10px] font-black text-slate-200 uppercase italic outline-none mb-6 appearance-none cursor-pointer" value={venueType} onChange={(e) => setVenueType(e.target.value)}>
                    {Object.entries(VENUE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <div className="bg-[#0F172A]/40 rounded-2xl p-4 mb-6 border border-slate-800 flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Split Ratio</span>
                      <span className="text-[10px] font-bold text-white uppercase italic">{VENUE_TYPES[venueType].desc}</span>
                    </div>
                    <PieIcon size={18} className="text-indigo-400 opacity-50" />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex gap-3">
                        <div className="flex-1 bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800">
                            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Alcohol Avg</p>
                            <p className="text-xl font-black text-white italic tracking-tighter">{formatCurrency(stats.averageAlcohol)}</p>
                        </div>
                        <div className="flex-1 bg-[#0F172A]/50 p-5 rounded-2xl border border-slate-800">
                            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Est. Food Sales</p>
                            <p className="text-xl font-black text-white italic tracking-tighter">{formatCurrency(stats.estimatedFoodAvg)}</p>
                        </div>
                    </div>
                  </div>
                </div>
                <div className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-slate-700 shadow-xl overflow-hidden">
                    <h3 className="text-[10px] font-black uppercase italic tracking-widest text-white mb-8">Monthly Alcohol Sales</h3>
                    <div className="h-[220px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={selectedEstablishment.history} margin={{ left: -20, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke="#ffffff05" />
                                <XAxis dataKey={DATE_FIELD} tickFormatter={formatDate} tick={{fontSize: 7, fill: '#475569'}} axisLine={false} tickLine={false} />
                                <YAxis tickFormatter={formatCurrency} tick={{fontSize: 7, fill: '#475569'}} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{backgroundColor: '#0F172A', border: 'none', borderRadius: '12px', fontSize: '10px'}} cursor={{fill: '#6366f110'}} formatter={(value) => [formatCurrency(value), ""]} />
                                <Bar dataKey="liquor" stackId="a" fill="#6366f1" radius={[2, 2, 0, 0]} />
                                <Bar dataKey="beer" stackId="a" fill="#fbbf24" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="wine" stackId="a" fill="#ec4899" radius={[0, 0, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[600px] flex flex-col items-center justify-center text-center bg-[#1E293B]/20 rounded-[3rem] border border-dashed border-slate-700">
               <div className="bg-indigo-500/10 p-6 rounded-full mb-6">
                 <Search size={40} className="text-indigo-400 opacity-40" />
               </div>
               <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">System Idle</h2>
               <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-2 max-w-[250px]">
                 Enter a business name or street address to start scraping the Texas Comptroller Database
               </p>
            </div>
          )}
        </div>
      </main>
      
      {error && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl backdrop-blur-sm z-50">
          {error}
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6366f1; }
      `}</style>
    </div>
  );
};

export default App;
