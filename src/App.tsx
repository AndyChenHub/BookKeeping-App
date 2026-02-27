import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  CreditCard, 
  Banknote, 
  MapPin, 
  User, 
  FileText, 
  Plus, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Save,
  X,
  Settings,
  FolderOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isToday
} from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Config {
  locations: string[];
  agents: string[];
  descriptions: Record<string, string>;
  booksPath: string;
}

interface QueuedTransaction {
  id: string;
  date: string;
  paymentMethod: string;
  location: string;
  agent: string;
  descriptionZh: string;
  descriptionEn: string;
  parts: string;
  gst: string;
  total: string;
}

export default function App() {
  const [config, setConfig] = useState<Config>({ locations: [], agents: [], descriptions: {}, booksPath: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showAddModal, setShowAddModal] = useState<'location' | 'agent' | 'description' | 'settings' | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [newItem, setNewItem] = useState({ value: '', translation: '' });
  const [queue, setQueue] = useState<QueuedTransaction[]>([]);

  const [isQueueExpanded, setIsQueueExpanded] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [showLocationOptions, setShowLocationOptions] = useState(false);
  const [showAgentOptions, setShowAgentOptions] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    paymentMethod: 'Cash',
    location: '',
    agent: '',
    parts: '',
    gst: '',
    total: '',
  });

  const [selectedDescriptions, setSelectedDescriptions] = useState<Set<string>>(new Set());

  const descriptionZh = useMemo(() => Array.from(selectedDescriptions).join(', '), [selectedDescriptions]);
  const descriptionEn = useMemo(() => {
    return Array.from(selectedDescriptions)
      .map(zh => config.descriptions[zh] || zh)
      .join(', ');
  }, [selectedDescriptions, config.descriptions]);

  useEffect(() => {
    fetchConfig();
  }, []);

  const filteredLocations = useMemo(() => {
    return config.locations.filter(loc => 
      loc.toLowerCase().includes(locationSearch.toLowerCase())
    );
  }, [config.locations, locationSearch]);

  const filteredAgents = useMemo(() => {
    return config.agents.filter(agent => 
      agent.toLowerCase().includes(agentSearch.toLowerCase())
    );
  }, [config.agents, agentSearch]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewDate));
    const end = endOfWeek(endOfMonth(viewDate));
    return eachDayOfInterval({ start, end });
  }, [viewDate]);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error('Failed to fetch config', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleDescription = (zh: string) => {
    setSelectedDescriptions(prev => {
      const next = new Set(prev);
      if (next.has(zh)) {
        next.delete(zh);
      } else {
        next.add(zh);
      }
      return next;
    });
  };

  const addToQueue = () => {
    if (!formData.total || selectedDescriptions.size === 0) return;

    const newEntry: QueuedTransaction = {
      id: Math.random().toString(36).substr(2, 9),
      ...formData,
      descriptionZh,
      descriptionEn,
    };

    setQueue(prev => [...prev, newEntry]);
    
    // Reset partial form
    setSelectedDescriptions(new Set());
    setFormData(prev => ({ ...prev, parts: '', gst: '', total: '' }));
    
    // Auto expand queue if it was closed
    setIsQueueExpanded(true);
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const handleSaveAll = async () => {
    if (queue.length === 0) return;

    setSubmitting(true);
    try {
      for (const item of queue) {
        await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...item,
            amount: item.parts,
            description: item.descriptionEn,
          }),
        });
      }
      
      setShowSuccess(true);
      setQueue([]);
      setIsQueueExpanded(false);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (err) {
      console.error('Submit failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNew = async () => {
    if (!newItem.value && showAddModal !== 'settings') return;
    try {
      await fetch('/api/config/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: showAddModal,
          value: newItem.value,
          translation: newItem.translation
        }),
      });
      await fetchConfig();
      setShowAddModal(null);
      setNewItem({ value: '', translation: '' });
    } catch (err) {
      console.error('Add failed', err);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center">
          <div className="w-32 h-32 border-[12px] border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-10"></div>
          <p className="text-6xl font-black text-zinc-800 leading-tight">系统加载中...<br/><span className="text-2xl text-zinc-400 uppercase tracking-widest">Loading System...</span></p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-50 font-sans pt-24 px-8 pb-8 relative overflow-hidden">
      {/* Settings Button */}
      <button 
        onClick={() => {
          setNewItem({ value: config.booksPath, translation: '' });
          setShowAddModal('settings');
        }}
        className="absolute top-6 right-6 z-50 p-4 bg-white rounded-[24px] shadow-xl border-2 border-zinc-100 text-zinc-400 hover:text-emerald-600 transition-all hover:scale-110 active:scale-95"
      >
        <Settings size={40} />
      </button>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex gap-8">
        {/* Left Panel: Form */}
        <div className="w-1/2 bg-white rounded-[40px] shadow-2xl border border-zinc-200 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col p-10 gap-8 overflow-y-auto">
            
            {/* Date & Payment */}
            <div className="grid grid-cols-2 gap-8">
              <div>
                <label className="label-zh">日期</label>
                <label className="label-en">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-8 top-1/2 -translate-y-1/2 text-zinc-400 z-10" size={48} />
                  <button 
                    type="button"
                    onClick={() => setShowCalendar(true)}
                    className="kiosk-input h-28 text-left flex items-center bg-white"
                  >
                    {format(new Date(formData.date), 'yyyy-MM-dd')}
                  </button>
                  
                  <AnimatePresence>
                    {showCalendar && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="absolute left-0 top-full mt-4 w-[600px] bg-white border-4 border-zinc-200 rounded-[40px] shadow-2xl z-[100] p-8"
                      >
                        <div className="flex justify-between items-center mb-8">
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setViewDate(subMonths(viewDate, 1)); }}
                            className="p-4 hover:bg-zinc-100 rounded-2xl text-zinc-600"
                          >
                            <ChevronRight className="rotate-180" size={40} />
                          </button>
                          <h3 className="text-4xl font-black text-zinc-900">
                            {format(viewDate, 'MMMM yyyy')}
                          </h3>
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setViewDate(addMonths(viewDate, 1)); }}
                            className="p-4 hover:bg-zinc-100 rounded-2xl text-zinc-600"
                          >
                            <ChevronRight size={40} />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-7 gap-2 mb-4">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="text-center text-xl font-black text-zinc-400 uppercase">
                              {day}
                            </div>
                          ))}
                        </div>
                        
                        <div className="grid grid-cols-7 gap-2">
                          {calendarDays.map((day, idx) => {
                            const isSelected = isSameDay(day, new Date(formData.date));
                            const isCurrentMonth = isSameMonth(day, viewDate);
                            
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFormData(prev => ({ ...prev, date: format(day, 'yyyy-MM-dd') }));
                                  setShowCalendar(false);
                                }}
                                className={cn(
                                  "h-16 rounded-2xl text-2xl font-black flex items-center justify-center transition-all",
                                  isSelected 
                                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" 
                                    : isCurrentMonth 
                                      ? "text-zinc-800 hover:bg-zinc-100" 
                                      : "text-zinc-200 hover:bg-zinc-50",
                                  isToday(day) && !isSelected && "border-2 border-emerald-500 text-emerald-600"
                                )}
                              >
                                {format(day, 'd')}
                              </button>
                            );
                          })}
                        </div>
                        
                        <button 
                          type="button"
                          onClick={() => setShowCalendar(false)}
                          className="w-full mt-8 py-4 bg-zinc-100 text-zinc-600 rounded-2xl text-2xl font-black hover:bg-zinc-200"
                        >
                          关闭 CLOSE
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <div>
                <label className="label-zh">支付方式</label>
                <label className="label-en">Payment Method</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'Cash' }))}
                    className={cn(
                      "flex-1 kiosk-button",
                      formData.paymentMethod === 'Cash' 
                        ? "bg-emerald-500 border-emerald-600 text-white shadow-xl shadow-emerald-200" 
                        : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    )}
                  >
                    <Banknote size={32} className="mb-2" />
                    <span className="text-2xl font-black">现金 Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'Card' }))}
                    className={cn(
                      "flex-1 kiosk-button",
                      formData.paymentMethod === 'Card' 
                        ? "bg-emerald-500 border-emerald-600 text-white shadow-xl shadow-emerald-200" 
                        : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    )}
                  >
                    <CreditCard size={32} className="mb-2" />
                    <span className="text-2xl font-black">刷卡 Card</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Location & Agent */}
            <div className="grid grid-cols-2 gap-8">
              <div className="relative">
                <div className="flex justify-between items-end mb-1">
                  <div>
                    <label className="label-zh">地点</label>
                    <label className="label-en">Location</label>
                  </div>
                  <button type="button" onClick={() => setShowAddModal('location')} className="text-emerald-600 text-lg font-black hover:underline mb-3">+ 新增 Add</button>
                </div>
                <div className="relative">
                  <MapPin className="absolute left-8 top-1/2 -translate-y-1/2 text-zinc-400 z-10" size={48} />
                  <input 
                    type="text"
                    className="kiosk-input h-28"
                    placeholder="Search location..."
                    value={locationSearch}
                    onFocus={() => setShowLocationOptions(true)}
                    onBlur={() => setTimeout(() => setShowLocationOptions(false), 200)}
                    onChange={e => {
                      const val = e.target.value;
                      setLocationSearch(val);
                      setShowLocationOptions(true);
                      if (config.locations.includes(val)) {
                        setFormData(prev => ({ ...prev, location: val }));
                      }
                    }}
                  />
                  <AnimatePresence>
                    {showLocationOptions && filteredLocations.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute left-0 right-0 top-full mt-2 bg-white border border-zinc-200 rounded-3xl shadow-2xl z-50 max-h-60 overflow-y-auto"
                      >
                        {filteredLocations.map(loc => (
                          <button
                            key={loc}
                            type="button"
                            className="w-full p-6 text-left text-2xl font-black hover:bg-zinc-50 border-b border-zinc-100 last:border-0"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, location: loc }));
                              setLocationSearch(loc);
                              setShowLocationOptions(false);
                            }}
                          >
                            {loc}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <div className="relative">
                <div className="flex justify-between items-end mb-1">
                  <div>
                    <label className="label-zh">经办人</label>
                    <label className="label-en">Agent</label>
                  </div>
                  <button type="button" onClick={() => setShowAddModal('agent')} className="text-emerald-600 text-lg font-black hover:underline mb-3">+ 新增 Add</button>
                </div>
                <div className="relative">
                  <User className="absolute left-8 top-1/2 -translate-y-1/2 text-zinc-400 z-10" size={48} />
                  <input 
                    type="text"
                    className="kiosk-input h-28"
                    placeholder="Search agent..."
                    value={agentSearch}
                    onFocus={() => setShowAgentOptions(true)}
                    onBlur={() => setTimeout(() => setShowAgentOptions(false), 200)}
                    onChange={e => {
                      const val = e.target.value;
                      setAgentSearch(val);
                      setShowAgentOptions(true);
                      if (config.agents.includes(val)) {
                        setFormData(prev => ({ ...prev, agent: val }));
                      }
                    }}
                  />
                  <AnimatePresence>
                    {showAgentOptions && filteredAgents.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute left-0 right-0 top-full mt-2 bg-white border border-zinc-200 rounded-3xl shadow-2xl z-50 max-h-60 overflow-y-auto"
                      >
                        {filteredAgents.map(agent => (
                          <button
                            key={agent}
                            type="button"
                            className="w-full p-6 text-left text-2xl font-black hover:bg-zinc-50 border-b border-zinc-100 last:border-0"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, agent: agent }));
                              setAgentSearch(agent);
                              setShowAgentOptions(false);
                            }}
                          >
                            {agent}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Description Display */}
            <div className="p-8 bg-zinc-50 rounded-[32px] border-4 border-dashed border-zinc-200">
              <label className="label-zh">描述预览</label>
              <label className="label-en">Description Preview</label>
              <div className="flex flex-col gap-6">
                <div className="flex items-start gap-6">
                  <span className="px-4 py-2 bg-zinc-200 text-zinc-600 text-lg font-black rounded uppercase mt-2">ZH</span>
                  <span className="text-5xl font-black text-zinc-800 break-words flex-1">{descriptionZh || '---'}</span>
                </div>
                <div className="flex items-start gap-6">
                  <span className="px-4 py-2 bg-emerald-100 text-emerald-700 text-lg font-black rounded uppercase mt-2">EN</span>
                  <span className="text-4xl font-black text-emerald-600 italic break-words flex-1">{descriptionEn || '---'}</span>
                </div>
              </div>
            </div>

            {/* Amount Sections */}
            <div className="grid grid-cols-2 gap-8">
              <div>
                <label className="label-zh">零件金额</label>
                <label className="label-en">Parts Costs</label>
                <div className="relative">
                  <span className="absolute left-8 top-1/2 -translate-y-1/2 text-5xl font-black text-zinc-400 z-10">$</span>
                  <input 
                    type="number" 
                    step="0.01"
                    placeholder="0.00"
                    className="kiosk-input text-5xl font-black h-28"
                    value={formData.parts}
                    onChange={e => setFormData(prev => ({ ...prev, parts: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label-zh">消费税</label>
                <label className="label-en">GST</label>
                <div className="relative">
                  <span className="absolute left-8 top-1/2 -translate-y-1/2 text-5xl font-black text-zinc-400 z-10">$</span>
                  <input 
                    type="number" 
                    step="0.01"
                    placeholder="0.00"
                    className="kiosk-input text-5xl font-black h-28"
                    value={formData.gst}
                    onChange={e => setFormData(prev => ({ ...prev, gst: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Total Amount */}
            <div>
              <label className="label-zh">总计金额</label>
              <label className="label-en">Total Amount</label>
              <div className="relative">
                <span className="absolute left-8 top-1/2 -translate-y-1/2 text-6xl font-black text-zinc-400 z-10">$</span>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="0.00"
                  className="kiosk-input text-7xl font-black h-32"
                  value={formData.total}
                  onChange={e => setFormData(prev => ({ ...prev, total: e.target.value }))}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={addToQueue}
              disabled={!formData.total || selectedDescriptions.size === 0}
              className={cn(
                "w-full py-8 rounded-3xl text-3xl font-black flex items-center justify-center gap-4 transition-all",
                !formData.total || selectedDescriptions.size === 0
                  ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                  : "bg-zinc-800 text-white hover:bg-zinc-900 shadow-2xl active:scale-95"
              )}
            >
              <Plus size={40} />
              加入列表 ADD TO LIST
            </button>
          </div>
        </div>

        {/* Right Panel: Select Description */}
        <div className="w-1/2 flex flex-col">
          <div className="flex-1 bg-white rounded-[40px] shadow-2xl border border-zinc-200 flex flex-col overflow-hidden">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <div>
                <h2 className="text-4xl font-black text-zinc-900">选择描述内容</h2>
                <p className="text-xl text-zinc-500 font-bold uppercase tracking-wider">Select Description</p>
              </div>
              <button 
                onClick={() => setShowAddModal('description')}
                className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 transition-colors"
              >
                <Plus size={32} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-2 gap-6">
                {(Object.entries(config.descriptions) as [string, string][]).map(([zh, en]) => (
                  <button
                    key={zh}
                    onClick={() => toggleDescription(zh)}
                    className={cn(
                      "kiosk-button group min-h-[160px]",
                      selectedDescriptions.has(zh) 
                        ? "bg-emerald-500 border-emerald-600 text-white shadow-xl shadow-emerald-200" 
                        : "bg-white border-zinc-100 text-zinc-700 hover:border-zinc-300"
                    )}
                  >
                    <span className="text-5xl font-black mb-2">{zh}</span>
                    <span className={cn(
                      "text-xl font-bold opacity-60",
                      selectedDescriptions.has(zh) ? "opacity-100" : "group-hover:opacity-100"
                    )}>{en}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Pending List Tab */}
      <div className={cn(
        "fixed bottom-0 right-8 z-40 transition-all duration-500 ease-in-out",
        isQueueExpanded ? "w-[600px] h-[80vh]" : "w-80 h-20"
      )}>
        <div className="bg-white rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.15)] border-x border-t border-zinc-200 h-full flex flex-col overflow-hidden">
          {/* Tab Header */}
          <button 
            onClick={() => setIsQueueExpanded(!isQueueExpanded)}
            className={cn(
              "w-full p-6 flex justify-between items-center transition-colors",
              isQueueExpanded ? "bg-zinc-800 text-white" : "bg-emerald-600 text-white"
            )}
          >
            <div className="flex items-center gap-4">
              <FileText size={32} />
              <span className="text-2xl font-black">
                {isQueueExpanded ? "待办列表 Pending List" : `待办 Pending (${queue.length})`}
              </span>
            </div>
            <motion.div
              animate={{ rotate: isQueueExpanded ? 180 : 0 }}
            >
              <Plus size={32} className={cn(isQueueExpanded ? "rotate-45" : "")} />
            </motion.div>
          </button>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden flex flex-col bg-zinc-50">
            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4">
              {queue.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-300 gap-4 py-20">
                  <FileText size={80} />
                  <p className="text-2xl font-black text-center">列表为空<br/>Empty List</p>
                </div>
              ) : (
                queue.map((item) => (
                  <div key={item.id} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex justify-between items-start group">
                    <div className="flex-1">
                      <div className="flex flex-col gap-1 mb-3">
                        <span className="text-2xl font-black text-zinc-800">{item.descriptionZh}</span>
                        <div className="flex items-center gap-2">
                          <ChevronRight size={16} className="text-zinc-300" />
                          <span className="text-xl font-bold text-emerald-600 italic">{item.descriptionEn}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-zinc-400 uppercase">
                        <span className="bg-zinc-100 px-2 py-0.5 rounded text-zinc-600">{item.paymentMethod}</span>
                        <span>{item.location}</span>
                        <span>{item.agent}</span>
                      </div>
                      <div className="mt-3 flex gap-6 text-sm font-bold">
                        <div className="text-zinc-500 uppercase">Parts Costs: <span className="text-zinc-900">${item.parts || '0.00'}</span></div>
                        <div className="text-zinc-500 uppercase">GST: <span className="text-zinc-900">${item.gst || '0.00'}</span></div>
                      </div>
                    </div>
                    <div className="flex items-start gap-6 ml-4">
                      <div className="text-right">
                        <p className="text-xs font-black text-zinc-400 uppercase mb-1">{item.date}</p>
                        <p className="text-3xl font-black text-zinc-800">${item.total}</p>
                      </div>
                      <button 
                        onClick={() => removeFromQueue(item.id)}
                        className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                      >
                        <X size={32} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {queue.length > 0 && (
              <div className="p-8 bg-white border-t border-zinc-100 flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-sm font-black text-zinc-400 uppercase">GST</p>
                    <p className="text-3xl font-black text-zinc-600">
                      ${queue.reduce((acc, curr) => acc + parseFloat(curr.gst), 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-emerald-600 uppercase">Grand Total 总计</p>
                    <p className="text-5xl font-black text-emerald-700">
                      ${queue.reduce((acc, curr) => acc + parseFloat(curr.total), 0).toFixed(2)}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleSaveAll}
                  disabled={submitting}
                  className="w-full py-6 bg-emerald-500 text-white rounded-3xl text-3xl font-black hover:bg-emerald-400 transition-all active:scale-95 flex items-center justify-center gap-4 shadow-xl shadow-emerald-200"
                >
                  <Save size={32} />
                  保存全部 SAVE ALL
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Success Overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-emerald-600/95 backdrop-blur-md flex items-center justify-center z-50"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center text-white"
            >
              <CheckCircle2 size={200} className="mx-auto mb-10" />
              <h2 className="text-9xl font-black mb-6">SUCCESS!</h2>
              <p className="text-5xl font-black opacity-90 leading-tight">所有交易已保存到 Excel<br/><span className="text-2xl opacity-70">All transactions saved successfully</span></p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Item Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
                <h3 className="text-5xl font-black text-zinc-900 leading-tight">
                  {showAddModal === 'settings' ? '设置保存路径' : `新增 ${showAddModal === 'description' ? '描述' : showAddModal === 'location' ? '地点' : '经办人'}`}
                  <br/>
                  <span className="text-xl text-zinc-400 uppercase tracking-wider">
                    {showAddModal === 'settings' ? 'Set Storage Path' : `Add New ${showAddModal && showAddModal.charAt(0).toUpperCase() + showAddModal.slice(1)}`}
                  </span>
                </h3>
                <button onClick={() => setShowAddModal(null)} className="p-4 text-zinc-400 hover:text-zinc-600">
                  <X size={40} />
                </button>
              </div>
              <div className="p-10 flex flex-col gap-8">
                {showAddModal === 'settings' ? (
                  <div>
                    <label className="label-zh">Excel 保存路径</label>
                    <label className="label-en">Excel Storage Path</label>
                    <div className="relative">
                      <FolderOpen className="absolute left-8 top-1/2 -translate-y-1/2 text-zinc-400 z-10" size={48} />
                      <input 
                        type="text" 
                        className="kiosk-input"
                        value={newItem.value}
                        onChange={e => setNewItem(prev => ({ ...prev, value: e.target.value }))}
                        placeholder="e.g. C:\Users\Documents\BusinessBooks"
                      />
                    </div>
                    <p className="mt-4 text-xl font-bold text-zinc-400 italic">
                      * 账本将按年份自动分类存储 (例如: 路径\2026\202602Book.xlsx)
                      <br/>
                      * Books will be stored in yearly folders automatically.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="label-zh">名称</label>
                      <label className="label-en">Name / Mandarin</label>
                      <input 
                        type="text" 
                        className="kiosk-input"
                        value={newItem.value}
                        onChange={e => setNewItem(prev => ({ ...prev, value: e.target.value }))}
                        placeholder={showAddModal === 'description' ? "例如: 洗衣机" : "例如: 新地点名称"}
                      />
                    </div>
                    {showAddModal === 'description' && (
                      <div>
                        <label className="label-zh">翻译</label>
                        <label className="label-en">Translation / English</label>
                        <input 
                          type="text" 
                          className="kiosk-input"
                          value={newItem.translation}
                          onChange={e => setNewItem(prev => ({ ...prev, translation: e.target.value }))}
                          placeholder="e.g. Washing Machine"
                        />
                      </div>
                    )}
                  </>
                )}
                <button 
                  onClick={handleAddNew}
                  className="w-full py-6 bg-emerald-600 text-white rounded-3xl text-3xl font-black hover:bg-emerald-700 transition-all active:scale-95 shadow-xl shadow-emerald-200"
                >
                  {showAddModal === 'settings' ? '保存路径 SAVE PATH' : '确认添加 CONFIRM'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
