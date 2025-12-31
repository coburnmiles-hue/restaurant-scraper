
import React, { useState, useEffect, useMemo } from 'react';
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
  Quote
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

const KNOWN_OWNERS = {
  "32082902571": ["Travis Tober", "Zane Hunt", "Brandon Hunt", "Craig Primozich"],
  "32061511302": ["Travis Tober", "Zane Hunt", "Brandon Hunt", "Craig Primozich"],
  "32069462136": ["Travis Tober", "Zane Hunt", "Brandon Hunt", "Craig Primozich"],
};

const App = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [results, setResults] = useState([]);
  const [selectedEstablishment, setSelectedEstablishment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [venueType, setVenueType] = useState('casual_dining');

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

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);
    setSelectedEstablishment(null);
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
      setError("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const analyzeLocation = async (establishment) => {
    setLoading(true);
    setError(null);
    try {
      const whereClause = `taxpayer_number = '${establishment.taxpayer_number}' AND location_number = '${establishment.location_number}'`;
      const query = `?$where=${encodeURIComponent(whereClause)}&$order=${DATE_FIELD} DESC&$limit=12`;
     
      const response = await fetch(BASE_URL + query);
      const history = await response.json();
      if (!response.ok) throw new Error("Failed to load historical data.");

      setSelectedEstablishment({
        info: establishment,
        history: history.reverse()
      });
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
   
    const estimatedTotalAvg = averageAlcohol + estimatedFoodAvg;
    const individualOwners = KNOWN_OWNERS[selectedEstablishment.info.taxpayer_number] || [];

    return {
      averageAlcohol,
      estimatedFoodAvg,
      estimatedTotalAvg,
      nonZeroCount: nonZeroMonths.length,
      config,
      individualOwners
    };
  }, [selectedEstablishment, venueType]);

  const pieData = useMemo(() => {
    if (!stats) return [];
    const data = [{ name: 'Alcohol', value: stats.averageAlcohol, color: '#A5B4FC' }];
    if (stats.estimatedFoodAvg > 0) {
      data.push({ name: 'Food', value: stats.estimatedFoodAvg, color: '#6EE7B7' });
    }
    return data;
  }, [stats]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans p-4 md:p-8">
      {/* Bible Verse Header */}
      <div className="max-w-6xl mx-auto mb-8 bg-[#1E293B] p-6 rounded-2xl border border-slate-700/50 shadow-xl">
        <div className="flex gap-4 items-start">
          <Quote className="text-indigo-400 shrink-0" size={24} />
          <div>
            <h4 className="text-indigo-300 font-bold text-sm mb-1 uppercase tracking-widest">2 Corinthians 8:9</h4>
            <p className="text-slate-300 text-lg italic leading-relaxed font-serif">
              "For you know the grace of our Lord Jesus Christ, that though he was rich, yet for your sake he became poor, so that you through his poverty might become rich."
            </p>
            <p className="mt-2 text-slate-400 text-sm font-medium">Jesus' sacrifice is the ultimate expression of grace.</p>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white flex items-center gap-3 tracking-tighter italic">
            <BarChart3 className="text-indigo-400" size={36} /> RESTAURANT SCRAPER
          </h1>
          <p className="text-slate-400 font-medium text-sm md:text-base">Industry Intelligence & TABC Ownership Analytics</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
       
        {/* Left Column: Search */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-[#1E293B] p-6 rounded-3xl border border-slate-700 shadow-xl">
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 block mb-2 px-1">Establishment Name</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="text"
                    placeholder="e.g. Nickel City"
                    className="w-full pl-12 pr-4 py-3 rounded-2xl bg-[#0F172A] border border-slate-700 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 block mb-2 px-1">City</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="text"
                    placeholder="e.g. Fort Worth"
                    className="w-full pl-12 pr-4 py-3 rounded-2xl bg-[#0F172A] border border-slate-700 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !searchTerm.trim()}
                className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-900 font-black py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-widest text-sm"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Run Scraper'}
              </button>
            </form>
          </section>

          {results.length > 0 && (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              <h3 className="text-[10px] font-black text-slate-500 uppercase px-4 tracking-[0.2em]">Verified Matches</h3>
              {results.map((item) => (
                <button
                  key={`${item.taxpayer_number}-${item.location_number}`}
                  onClick={() => analyzeLocation(item)}
                  className={`w-full text-left p-5 rounded-3xl border transition-all flex items-center justify-between group ${
                    selectedEstablishment?.info.location_number === item.location_number
                    ? 'bg-indigo-500/10 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.1)]'
                    : 'bg-[#1E293B] border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="overflow-hidden">
                    <h4 className="font-black text-slate-100 group-hover:text-indigo-300 transition-colors uppercase tracking-tight truncate">{item.location_name}</h4>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium leading-tight">
                      {item.location_address}, {item.location_city}, {item.location_zip}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-slate-600 group-hover:text-indigo-400 shrink-0 ml-2" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Dashboard */}
        <div className="lg:col-span-8">
          {!selectedEstablishment && !loading && (
            <div className="h-[400px] md:h-[600px] flex flex-col items-center justify-center bg-[#1E293B]/50 rounded-[2rem] border-2 border-dashed border-slate-700 text-slate-500 p-8 text-center shadow-inner">
              <Briefcase size={48} className="mb-6 opacity-20" />
              <h3 className="text-2xl font-black text-slate-400 italic">SYSTEM READY</h3>
              <p className="max-w-xs mt-3 text-sm font-medium leading-relaxed opacity-60 uppercase tracking-widest">Execute search to populate revenue projections</p>
            </div>
          )}

          {loading && (
             <div className="h-[400px] md:h-[600px] flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-indigo-400 mb-6" size={64} />
                <p className="text-indigo-300 font-black tracking-[0.3em] uppercase text-sm">Scraping Comptroller Data...</p>
             </div>
          )}

          {selectedEstablishment && !loading && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20">
             
              {/* Profile Card */}
              <div className="bg-[#1E293B] p-6 md:p-10 rounded-[2rem] shadow-2xl border border-slate-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none hidden md:block">
                  <BarChart3 size={200} />
                </div>
               
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 relative z-10">
                  <div className="space-y-6 flex-1">
                    <div>
                      <span className="inline-block px-4 py-1.5 bg-indigo-500/10 text-indigo-300 rounded-full text-[10px] font-black mb-4 uppercase tracking-[0.2em] border border-indigo-500/20">
                        Permit {selectedEstablishment.info.tabc_permit_number}
                      </span>
                      <h2 className="text-3xl md:text-5xl font-black text-white leading-[0.9] tracking-tighter uppercase italic">{selectedEstablishment.info.location_name}</h2>
                      <p className="text-slate-400 flex items-center gap-2 mt-4 text-sm font-bold tracking-wide">
                        <MapPin size={18} className="text-indigo-400 shrink-0" /> {selectedEstablishment.info.location_address}, {selectedEstablishment.info.location_city}, TX
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8 border-t border-slate-700/50">
                      <div>
                        <div className="flex items-center gap-2 text-indigo-300/60 mb-3">
                          <Briefcase size={16} />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Parent Entity</span>
                        </div>
                        <p className="font-black text-slate-100 text-lg md:text-xl leading-tight uppercase tracking-tight">{selectedEstablishment.info.taxpayer_name}</p>
                        <p className="text-[11px] text-slate-500 font-mono mt-2 uppercase tracking-widest">FEIN: {selectedEstablishment.info.taxpayer_number}</p>
                      </div>
                     
                      <div className="bg-[#0F172A] p-5 rounded-3xl border border-slate-700/50 shadow-inner">
                        <div className="flex items-center gap-2 text-emerald-400/80 mb-3">
                          <Users size={16} />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Key Officers</span>
                        </div>
                        {stats.individualOwners.length > 0 ? (
                          <div className="space-y-2">
                            {stats.individualOwners.map(owner => (
                              <p key={owner} className="text-base md:text-lg font-black text-slate-100 italic tracking-tighter uppercase">{owner}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs font-bold text-slate-600 uppercase italic">Ownership indexing unavailable</p>
                        )}
                      </div>
                    </div>
                  </div>
                 
                  <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] text-center md:text-right text-slate-900 shadow-[0_20px_50px_rgba(99,102,241,0.3)] min-w-full md:min-w-[280px] flex flex-col justify-center border-b-8 border-indigo-400">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Avg Monthly Volume</p>
                    <p className="text-4xl md:text-5xl font-black tracking-tighter leading-none">{formatCurrency(stats.estimatedTotalAvg)}</p>
                    <p className="text-[10px] mt-4 font-black text-indigo-500 uppercase tracking-widest">Based on {stats.nonZeroCount} Active Months</p>
                  </div>
                </div>
              </div>

              {/* Estimation Engine - High Contrast Pastel Theme */}
              <div className="bg-[#1E293B] p-6 md:p-8 rounded-[2rem] shadow-xl border border-slate-700">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-indigo-500 text-white rounded-2xl shadow-lg"><Utensils size={24} /></div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tight leading-none">Projection Engine</h3>
                    <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-widest">Alcohol vs. Food Projection</p>
                  </div>
                </div>
               
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                  <div className="space-y-8">
                    <div>
                      <label className="text-[10px] font-black uppercase text-indigo-300 block mb-3 tracking-[0.2em] px-1">Revenue Model</label>
                      <select
                        className="w-full bg-[#0F172A] border border-slate-600 rounded-2xl px-5 py-4 text-sm font-black text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-inner uppercase italic tracking-wide appearance-none"
                        value={venueType}
                        onChange={(e) => setVenueType(e.target.value)}
                      >
                        {Object.entries(VENUE_TYPES).map(([key, val]) => (
                          <option key={key} value={key}>
                            {val.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-sm text-indigo-200 mt-4 font-bold italic border-l-4 border-indigo-400/50 pl-4">{stats.config.desc}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-[#0F172A] p-6 rounded-3xl border border-slate-700">
                        <p className="text-[10px] font-black text-indigo-300/70 uppercase tracking-widest mb-2">Avg Alcohol (Actual)</p>
                        <p className="text-2xl font-black text-indigo-300 italic tracking-tighter">{formatCurrency(stats.averageAlcohol)}</p>
                      </div>
                      <div className="bg-[#0F172A] p-6 rounded-3xl border border-slate-700">
                        <p className="text-[10px] font-black text-emerald-300/70 uppercase tracking-widest mb-2">Avg Food (Projected)</p>
                        <p className="text-2xl font-black text-emerald-300 italic tracking-tighter">{formatCurrency(stats.estimatedFoodAvg)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="h-[250px] md:h-[300px] w-full flex items-center justify-center relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={window.innerWidth < 768 ? 60 : 75}
                          outerRadius={window.innerWidth < 768 ? 85 : 105}
                          paddingAngle={8}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{backgroundColor: '#1E293B', borderRadius: '16px', border: '1px solid #334155', fontWeight: 'bold'}}
                          itemStyle={{color: '#F1F5F9'}}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                       <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Avg Total</span>
                       <span className="text-2xl font-black text-white italic tracking-tighter">{formatCurrency(stats.estimatedTotalAvg)}</span>
                    </div>
                  </div>
                </div>
               
                {/* Visual Legend for Mobile */}
                <div className="mt-8 flex flex-wrap justify-center gap-6 border-t border-slate-700/50 pt-6">
                   <div className="flex items-center gap-2">
                     <div className="w-3 h-3 rounded-full bg-[#A5B4FC]"></div>
                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Alcohol (Actual)</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <div className="w-3 h-3 rounded-full bg-[#6EE7B7]"></div>
                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Food (Projected)</span>
                   </div>
                </div>
              </div>

              {/* Performance Chart */}
              <div className="bg-[#1E293B] p-6 md:p-8 rounded-[2rem] shadow-xl border border-slate-700">
                <div className="flex items-center justify-between mb-10">
                   <h3 className="text-lg md:text-xl font-black text-white uppercase italic tracking-tighter leading-none">Historical Alcohol Trajectory</h3>
                </div>
                <div className="h-[300px] md:h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedEstablishment.history} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
                      <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#334155" />
                      <XAxis
                        dataKey={DATE_FIELD}
                        tickFormatter={formatDate}
                        tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`}
                        tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{fill: 'rgba(255,255,255,0.03)'}}
                        contentStyle={{backgroundColor: '#0F172A', borderRadius: '16px', border: '1px solid #334155', padding: '15px'}}
                      />
                      <Legend verticalAlign="top" align="right" iconType="circle" height={50} wrapperStyle={{paddingBottom: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase'}}/>
                      <Bar name="Liquor" dataKey="liquor_receipts" stackId="a" fill="#A5B4FC" />
                      <Bar name="Wine" dataKey="wine_receipts" stackId="a" fill="#F9A8D4" />
                      <Bar name="Beer" dataKey="beer_receipts" stackId="a" fill="#FDE047" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-[#1E293B] rounded-[2rem] shadow-xl border border-slate-700 overflow-hidden">
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-left text-sm min-w-[700px]">
                    <thead className="bg-[#0F172A] border-b border-slate-700">
                      <tr>
                        <th className="px-10 py-6 font-black text-slate-500 uppercase tracking-widest text-[10px]">Tax Period</th>
                        <th className="px-6 py-6 font-black text-slate-500 uppercase tracking-widest text-[10px]">Liquor</th>
                        <th className="px-6 py-6 font-black text-slate-500 uppercase tracking-widest text-[10px]">Wine</th>
                        <th className="px-6 py-6 font-black text-slate-500 uppercase tracking-widest text-[10px]">Beer</th>
                        <th className="px-10 py-6 font-black text-slate-500 uppercase tracking-widest text-[10px] text-right">Net Sales</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {[...selectedEstablishment.history].reverse().map((row, idx) => (
                        <tr key={idx} className="hover:bg-indigo-500/5 transition-colors group">
                          <td className="px-10 py-5 font-black text-slate-300 uppercase italic tracking-wider whitespace-nowrap">{formatDate(row[DATE_FIELD])}</td>
                          <td className="px-6 py-5 text-slate-400 font-bold font-mono text-xs tracking-widest">{formatCurrency(row.liquor_receipts)}</td>
                          <td className="px-6 py-5 text-slate-400 font-bold font-mono text-xs tracking-widest">{formatCurrency(row.wine_receipts)}</td>
                          <td className="px-6 py-5 text-slate-400 font-bold font-mono text-xs tracking-widest">{formatCurrency(row.beer_receipts)}</td>
                          <td className="px-10 py-5 font-black text-white text-right text-base font-mono group-hover:text-indigo-300 transition-colors">{formatCurrency(row[TOTAL_FIELD])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
