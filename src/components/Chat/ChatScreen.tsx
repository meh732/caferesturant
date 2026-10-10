import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Send, Mic, Square, Paperclip, Image as ImageIcon, FileText, 
  BarChart3, RefreshCw, Trash2, Download, Play, Pause, 
  Users, MessageSquare, Bot, AlertCircle, Check, Sparkles, 
  TrendingUp, ShoppingBag, ShieldCheck, CornerDownLeft, Volume2
} from 'lucide-react';
import { db, ChatMessage, ChatAttachment, UserRole } from '../../lib/db';
import { sendChatMessage } from '../../lib/chatNotificationService';
import { useAuth } from '../../context/AuthContext';
import { format as formatJalali } from 'date-fns-jalali';
import { formatCurrency } from '../../lib/utils';

const CHANNELS = [
  { id: 'general', name: 'عمومی و پرسنل', icon: Users, color: 'text-[#007AFF] bg-[#007AFF]/10' },
  { id: 'kitchen', name: 'آشپزخانه و بار', icon: Sparkles, color: 'text-[#FF9500] bg-[#FF9500]/10' },
  { id: 'waiters', name: 'گارسون‌ها و سالن', icon: ShoppingBag, color: 'text-[#34C759] bg-[#34C759]/10' },
  { id: 'management', name: 'مدیریت و مالی', icon: ShieldCheck, color: 'text-[#5856D6] bg-[#5856D6]/10' },
];

export default function ChatScreen() {
  const { currentUser } = useAuth();
  const [selectedChannel, setSelectedChannel] = useState<string>('general');
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [showReportPicker, setShowReportPicker] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Audio playback state
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const audioElementsRef = useRef<{ [key: number]: HTMLAudioElement }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Live queries
  const messages = useLiveQuery(async () => {
    return db.chatMessages
      .where('channelId')
      .equals(selectedChannel)
      .sortBy('createdAt');
  }, [selectedChannel]);

  // Scroll message container to bottom without scrolling window/parent
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle Voice Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          // Send voice message
          await sendChatMessage({
            channelId: selectedChannel,
            senderName: currentUser?.name || currentUser?.username || 'پرسنل',
            senderId: currentUser?.id,
            senderRole: currentUser?.role,
            content: 'پیام صوتی (ویس)',
            voiceNote: {
              dataUrl: base64Audio,
              durationSeconds: recordingSeconds
            }
          });
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('دسترسی به میکروفون امکان‌پذیر نیست یا رد شد.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  // Audio Playback
  const togglePlayAudio = (msgId: number, dataUrl: string) => {
    if (playingAudioId === msgId) {
      // Pause
      if (audioElementsRef.current[msgId]) {
        audioElementsRef.current[msgId].pause();
      }
      setPlayingAudioId(null);
    } else {
      // Stop previously playing
      if (playingAudioId && audioElementsRef.current[playingAudioId]) {
        audioElementsRef.current[playingAudioId].pause();
      }

      if (!audioElementsRef.current[msgId]) {
        audioElementsRef.current[msgId] = new Audio(dataUrl);
        audioElementsRef.current[msgId].onended = () => {
          setPlayingAudioId(null);
        };
      }

      audioElementsRef.current[msgId].play();
      setPlayingAudioId(msgId);
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const isImg = file.type.startsWith('image/');
      const reader = new FileReader();

      reader.onloadend = () => {
        const newAttachment: ChatAttachment = {
          id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          name: file.name,
          type: isImg ? 'image' : 'file',
          dataUrl: reader.result as string,
          size: file.size
        };
        setPendingAttachments(prev => [...prev, newAttachment]);
      };

      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  // Generate and Send Live Reports directly to Channel
  const handleSendReport = async (reportType: 'sales_summary' | 'daily_z' | 'low_stock' | 'cash_drawer') => {
    setShowReportPicker(false);
    setIsSending(true);

    try {
      let title = '';
      let metrics: { label: string; value: string; color?: string }[] = [];
      let summaryText = '';

      if (reportType === 'sales_summary') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOrders = await db.orders.where('createdAt').aboveOrEqual(today).toArray();
        const paidOrders = todayOrders.filter(o => o.status === 'paid');
        const totalSales = paidOrders.reduce((sum, o) => sum + o.total, 0);
        const totalItemsCount = paidOrders.reduce((sum, o) => sum + o.items.reduce((acc, i) => acc + i.quantity, 0), 0);

        title = 'خلاصه فروش امروز (زنده)';
        metrics = [
          { label: 'مجموع فروش نقدی و کارت', value: formatCurrency(totalSales), color: 'text-[#34C759]' },
          { label: 'تعداد فاکتورهای تسویه', value: `${paidOrders.length} فاکتور` },
          { label: 'تعداد اقلام ثبت‌شده', value: `${totalItemsCount} پرس` },
        ];
        summaryText = `گزارش لحظه‌ای صندوق تا ساعت ${formatJalali(new Date(), 'HH:mm')}، مجموع فروش: ${formatCurrency(totalSales)}`;
      } else if (reportType === 'daily_z') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const ordersToday = await db.orders.where('createdAt').aboveOrEqual(today).toArray();
        const paidOrders = ordersToday.filter(o => o.status === 'paid');
        const totalSales = paidOrders.reduce((sum, o) => sum + o.total, 0);
        const totalDiscounts = paidOrders.reduce((sum, o) => {
          const discountAmt = o.discountType === 'percent' 
            ? (o.subtotal * (o.discountValue || 0)) / 100 
            : o.discountType === 'amount' 
              ? (o.discountValue || 0) 
              : 0;
          return sum + discountAmt;
        }, 0);
        const totalTax = paidOrders.reduce((sum, o) => sum + (o.taxAmount || 0), 0);

        title = 'گزارش بستن روزانه صندوق (Z Report)';
        metrics = [
          { label: 'فروش ناخالص', value: formatCurrency(totalSales + totalDiscounts) },
          { label: 'مجموع تخفیف‌ها', value: formatCurrency(totalDiscounts), color: 'text-[#FF9500]' },
          { label: 'مالیات بر ارزش افزوده', value: formatCurrency(totalTax) },
          { label: 'فروش خالص قابل واریز', value: formatCurrency(totalSales), color: 'text-[#34C759]' },
        ];
        summaryText = `استخراج شده توسط ${currentUser?.name || 'مدیر سیستم'} در تاریخ ${formatJalali(new Date(), 'yyyy/MM/dd HH:mm')}`;
      } else if (reportType === 'low_stock') {
        const materials = await db.rawMaterials.toArray();
        const stocks = await db.warehouseStocks.toArray();
        const lowItems = materials.filter(m => {
          const qty = stocks.filter(s => s.materialId === m.id).reduce((acc, s) => acc + s.quantity, 0);
          return qty <= (m.minStockAlert || 10);
        }).map(m => {
          const qty = stocks.filter(s => s.materialId === m.id).reduce((acc, s) => acc + s.quantity, 0);
          return { ...m, currentStock: qty };
        });
        
        title = 'هشدار مواد اولیه رو به اتمام (کسری موجودی انبار)';
        metrics = [
          { label: 'اقلام نیازمند سفارش', value: `${lowItems.length} قلم کالا`, color: 'text-[#FF3B30]' },
        ];
        summaryText = lowItems.slice(0, 5).map(m => `• ${m.name}: موجودی ${m.currentStock} ${m.unit} (حداقل: ${m.minStockAlert})`).join('\n') || 'تمامی اقلام موجودی کافی دارند.';
      } else {
        title = 'وضعیت موجودی صندوق فروشگاه';
        metrics = [
          { label: 'زمان استخراج', value: formatJalali(new Date(), 'HH:mm') }
        ];
        summaryText = 'اطلاعات زنده گردش وجوه نقد پایانه فروشگاهی آرکا';
      }

      const reportAttachment: ChatAttachment = {
        id: 'rep-' + Date.now(),
        name: title,
        type: 'report',
        reportData: {
          reportType,
          title,
          metrics,
          summaryText
        }
      };

      await sendChatMessage({
        channelId: selectedChannel,
        senderName: currentUser?.name || currentUser?.username || 'پرسنل',
        senderId: currentUser?.id,
        senderRole: currentUser?.role,
        content: `گزارش سیستمی: ${title}`,
        attachments: [reportAttachment]
      });
    } catch (e) {
      console.error('Error generating report:', e);
    } finally {
      setIsSending(false);
    }
  };

  // Send Text Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && pendingAttachments.length === 0) || isSending) return;

    setIsSending(true);
    try {
      await sendChatMessage({
        channelId: selectedChannel,
        senderName: currentUser?.name || currentUser?.username || 'پرسنل',
        senderId: currentUser?.id,
        senderRole: currentUser?.role,
        content: inputText.trim(),
        attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined
      });

      setInputText('');
      setPendingAttachments([]);
    } catch (err) {
      console.error('Failed to send chat message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const currentChannelInfo = CHANNELS.find(c => c.id === selectedChannel) || CHANNELS[0];

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col md:flex-row h-full bg-[#F5F5F7] overflow-hidden font-sans" dir="rtl">
      
      {/* Channels Sidebar (Desktop macOS Style) */}
      <aside className="hidden md:flex md:w-64 bg-white/80 backdrop-blur-xl border-l border-black/[0.06] flex-col shrink-0 h-full">
        <div className="p-4 px-5 border-b border-black/[0.04]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white flex items-center justify-center shadow-xs">
              <MessageSquare size={18} />
            </div>
            <div>
              <h2 className="font-bold text-sm text-neutral-900 tracking-tight">گفتگوی پرسنل</h2>
              <span className="text-[11px] text-neutral-400 font-normal">شبکه ارتباطی زنده آرکا</span>
            </div>
          </div>
        </div>

        {/* Channel List */}
        <div className="p-2.5 space-y-1 overflow-y-auto flex-1 scrollbar-none">
          {CHANNELS.map(ch => {
            const Icon = ch.icon;
            const isSelected = ch.id === selectedChannel;
            return (
              <button
                key={ch.id}
                onClick={() => setSelectedChannel(ch.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl text-right transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                  isSelected 
                    ? 'bg-[#007AFF] text-white font-semibold shadow-[0_2px_8px_rgba(0,122,255,0.25)]' 
                    : 'text-neutral-700 hover:bg-black/[0.04] font-medium'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-white/20 text-white' : ch.color}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs truncate block">{ch.name}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick User Info in Chat */}
        <div className="p-3.5 bg-neutral-50/70 border-t border-black/[0.04] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white font-semibold text-xs flex items-center justify-center shadow-2xs">
            {(currentUser?.name || currentUser?.username || 'ک').charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-neutral-900 truncate block">
              {currentUser?.name || currentUser?.username}
            </span>
            <span className="text-[10px] text-[#34C759] font-medium">آنلاین در شبکه</span>
          </div>
        </div>
      </aside>

      {/* Main Chat Conversation View */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full bg-[#F5F5F7] overflow-hidden">
        
        {/* Mobile Channels Strip */}
        <div className="flex md:hidden items-center gap-1 px-2.5 py-2 bg-white/80 backdrop-blur-xl border-b border-black/[0.06] overflow-x-auto scrollbar-none shrink-0">
          {CHANNELS.map(ch => {
            const Icon = ch.icon;
            const isSelected = ch.id === selectedChannel;
            return (
              <button
                key={ch.id}
                onClick={() => setSelectedChannel(ch.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 active:scale-95 ${
                  isSelected 
                    ? 'bg-[#007AFF] text-white shadow-xs' 
                    : 'bg-black/[0.04] text-neutral-700 hover:bg-black/[0.07]'
                }`}
              >
                <Icon size={13} />
                <span>{ch.name}</span>
              </button>
            );
          })}
        </div>
        
        {/* Chat Header (Apple Translucent Header) */}
        <header className="bg-white/80 backdrop-blur-xl border-b border-black/[0.06] px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${currentChannelInfo.color}`}>
              <currentChannelInfo.icon size={17} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-900 tracking-tight">{currentChannelInfo.name}</h2>
              <span className="text-[11px] text-neutral-500 font-normal">پیام‌ها، ویس‌ها و گزارشات به‌صورت لحظه‌ای همگام می‌شوند</span>
            </div>
          </div>

          {/* Quick Action: Send Live Report Button */}
          <div className="relative">
            <button
              onClick={() => setShowReportPicker(!showReportPicker)}
              className="px-3.5 py-1.5 rounded-xl bg-[#5856D6]/10 hover:bg-[#5856D6]/20 text-[#5856D6] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <BarChart3 size={14} />
              <span>ارسال گزارش زنده</span>
            </button>

            {/* Report Picker Dropdown */}
            {showReportPicker && (
              <div className="absolute left-0 top-full mt-2 w-72 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-black/[0.08] p-1.5 z-30 space-y-0.5 animate-in fade-in">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-neutral-400">
                  انتخاب نوع گزارش سیستمی:
                </div>
                <button
                  onClick={() => handleSendReport('sales_summary')}
                  className="w-full text-right p-2.5 rounded-xl hover:bg-black/[0.04] text-xs font-semibold text-neutral-800 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <TrendingUp size={15} className="text-[#34C759]" />
                  <span>خلاصه فروش امروز</span>
                </button>
                <button
                  onClick={() => handleSendReport('daily_z')}
                  className="w-full text-right p-2.5 rounded-xl hover:bg-black/[0.04] text-xs font-semibold text-neutral-800 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <BarChart3 size={15} className="text-[#007AFF]" />
                  <span>گزارش بستن صندوق روزانه (Z)</span>
                </button>
                <button
                  onClick={() => handleSendReport('low_stock')}
                  className="w-full text-right p-2.5 rounded-xl hover:bg-black/[0.04] text-xs font-semibold text-neutral-800 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <AlertCircle size={15} className="text-[#FF3B30]" />
                  <span>کسری مواد اولیه و انبار</span>
                </button>
                <button
                  onClick={() => handleSendReport('cash_drawer')}
                  className="w-full text-right p-2.5 rounded-xl hover:bg-black/[0.04] text-xs font-semibold text-neutral-800 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <ShoppingBag size={15} className="text-[#5856D6]" />
                  <span>وضعیت موجودی دخل صندوق</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Message Stream */}
        <div ref={messageListRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 scrollbar-none">
          {messages && messages.length > 0 ? (
            messages.map(msg => {
              const isMine = msg.senderName === (currentUser?.name || currentUser?.username);
              const timeStr = msg.createdAt ? formatJalali(new Date(msg.createdAt), 'HH:mm') : '';

              return (
                <div 
                  key={msg.id} 
                  className={`flex flex-col ${isMine ? 'items-start' : 'items-end'} max-w-full`}
                >
                  {/* Sender Header */}
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[11px] font-semibold text-neutral-700">{msg.senderName}</span>
                    {msg.senderRole && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-black/[0.05] text-neutral-600 font-medium">
                        {msg.senderRole === 'admin' ? 'مدیر' : msg.senderRole === 'waiter' ? 'گارسون' : 'پرسنل'}
                      </span>
                    )}
                    <span className="text-[10px] text-neutral-400 font-mono mr-1">{timeStr}</span>
                  </div>

                  {/* Message Bubble (iMessage Style) */}
                  <div className={`p-3.5 px-4 rounded-2xl max-w-lg shadow-[0_1px_4px_rgba(0,0,0,0.02)] space-y-2 ${
                    isMine 
                      ? 'bg-[#007AFF] text-white rounded-tr-xs shadow-[0_2px_8px_rgba(0,122,255,0.2)]' 
                      : msg.isSystemEvent
                        ? 'bg-neutral-900 text-white rounded-tl-xs'
                        : 'bg-white border border-black/[0.06] text-neutral-900 rounded-tl-xs'
                  }`}>
                    
                    {/* Text content */}
                    {msg.content && (
                      <p className="text-xs leading-relaxed whitespace-pre-wrap select-text font-medium">
                        {msg.content}
                      </p>
                    )}

                    {/* Voice Note Player (Apple Audio Capsule) */}
                    {msg.voiceNote && (
                      <div className={`flex items-center gap-3 p-2 rounded-xl ${isMine ? 'bg-white/15' : 'bg-black/[0.04]'}`}>
                        <button
                          onClick={() => msg.id && msg.voiceNote && togglePlayAudio(msg.id, msg.voiceNote.dataUrl)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-90 ${
                            isMine ? 'bg-white text-[#007AFF]' : 'bg-[#007AFF] text-white'
                          }`}
                        >
                          {playingAudioId === msg.id ? <Pause size={14} /> : <Play size={14} className="mr-0.5" />}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                            <span className="flex items-center gap-1 font-sans">
                              <Volume2 size={12} />
                              <span>پیام صوتی</span>
                            </span>
                            <span>{msg.voiceNote.durationSeconds}s</span>
                          </div>
                          <div className={`h-1.5 rounded-full overflow-hidden ${isMine ? 'bg-white/30' : 'bg-black/[0.08]'}`}>
                            <div className={`h-full ${isMine ? 'bg-white' : 'bg-[#007AFF]'} ${playingAudioId === msg.id ? 'animate-pulse w-full' : 'w-1/2'}`}></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Attachments (Images, Files, Reports) */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="space-y-2 pt-1">
                        {msg.attachments.map(att => {
                          if (att.type === 'image' && att.dataUrl) {
                            return (
                              <div key={att.id} className="rounded-xl overflow-hidden border border-black/10">
                                <img src={att.dataUrl} alt={att.name} className="max-h-60 w-auto rounded-lg object-contain" />
                                <span className="text-[10px] block mt-1 opacity-80">{att.name}</span>
                              </div>
                            );
                          }

                          if (att.type === 'report' && att.reportData) {
                            return (
                              <div key={att.id} className="bg-white text-neutral-900 rounded-2xl p-3.5 border border-black/[0.08] shadow-sm space-y-2" dir="rtl">
                                <div className="flex items-center justify-between border-b border-black/[0.04] pb-1.5">
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-900">
                                    <BarChart3 size={14} className="text-[#007AFF]" />
                                    <span>{att.reportData.title}</span>
                                  </div>
                                  <span className="text-[9px] bg-[#007AFF]/10 text-[#007AFF] px-2 py-0.5 rounded-full font-bold">
                                    سیستمی
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  {att.reportData.metrics.map((m, idx) => (
                                    <div key={idx} className="bg-black/[0.02] p-2 rounded-xl border border-black/[0.04]">
                                      <span className="text-[10px] text-neutral-500 block">{m.label}</span>
                                      <span className={`font-bold mt-0.5 block font-mono ${m.color || 'text-neutral-900'}`}>{m.value}</span>
                                    </div>
                                  ))}
                                </div>

                                {att.reportData.summaryText && (
                                  <p className="text-[11px] text-neutral-600 leading-normal bg-black/[0.02] p-2 rounded-xl whitespace-pre-line border border-black/[0.04] font-normal">
                                    {att.reportData.summaryText}
                                  </p>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div key={att.id} className={`flex items-center justify-between p-2.5 rounded-xl ${isMine ? 'bg-white/15' : 'bg-black/[0.04]'}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText size={16} />
                                <span className="text-xs truncate">{att.name}</span>
                              </div>
                              {att.dataUrl && (
                                <a
                                  href={att.dataUrl}
                                  download={att.name}
                                  className={`p-1.5 rounded-lg cursor-pointer ${isMine ? 'hover:bg-white/20' : 'hover:bg-black/[0.06]'}`}
                                  title="دانلود فایل"
                                >
                                  <Download size={13} />
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex-1 min-h-[260px] h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
              <div className="w-14 h-14 rounded-3xl bg-black/[0.03] flex items-center justify-center text-[#007AFF] mb-3">
                <MessageSquare size={24} className="opacity-70" />
              </div>
              <p className="text-xs sm:text-sm font-semibold text-neutral-700">هیچ پیامی در کانال «{currentChannelInfo.name}» وجود ندارد</p>
              <span className="text-[11px] text-neutral-400 mt-1 max-w-xs font-normal">
                شروع به ارسال پیام، فایل ضمیمه یا ویس صوتی برای همکاران این بخش کنید.
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Pending Attachments Strip */}
        {pendingAttachments.length > 0 && (
          <div className="bg-white/90 backdrop-blur-md border-t border-black/[0.06] px-3 py-2 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
            <span className="text-[11px] font-semibold text-neutral-500 shrink-0">پیوست‌ها:</span>
            {pendingAttachments.map(att => (
              <div key={att.id} className="flex items-center gap-1.5 bg-[#007AFF]/10 border border-[#007AFF]/20 text-[#007AFF] px-2.5 py-1 rounded-xl text-xs shrink-0">
                <Paperclip size={12} />
                <span className="truncate max-w-[120px] font-mono text-[11px]">{att.name}</span>
                <button
                  onClick={() => setPendingAttachments(prev => prev.filter(p => p.id !== att.id))}
                  className="text-[#FF3B30] hover:text-[#d32f2f] ml-1 cursor-pointer font-bold"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar (Apple iMessage Pill Design) */}
        <footer className="bg-white/80 backdrop-blur-xl border-t border-black/[0.06] p-2.5 sm:p-3 shrink-0 shadow-[0_-2px_8px_rgba(0,0,0,0.02)] z-10">
          {isRecording ? (
            <div className="flex items-center justify-between bg-[#FF3B30]/10 border border-[#FF3B30]/20 p-2.5 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-3.5 h-3.5 rounded-full bg-[#FF3B30] animate-ping"></div>
                <span className="text-xs font-bold text-[#FF3B30] font-mono">در حال ضبط صدا... ({recordingSeconds}s)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="px-3 py-1.5 rounded-xl bg-white text-neutral-700 text-xs font-semibold hover:bg-neutral-100 cursor-pointer active:scale-95 transition-all"
                >
                  لغو
                </button>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-4 py-1.5 rounded-xl bg-[#FF3B30] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer active:scale-95 transition-all shadow-xs"
                >
                  <Send size={12} />
                  <span>ارسال ویس</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              
              {/* Attachment Button */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                multiple 
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-neutral-400 hover:text-[#007AFF] hover:bg-black/[0.04] rounded-xl transition-all cursor-pointer shrink-0 active:scale-90"
                title="پیوست فایل یا تصویر"
              >
                <Paperclip size={18} />
              </button>

              {/* Text Input (Apple Pill) */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="پیام خود را بنویسید..."
                className="flex-1 px-4 py-2 bg-black/[0.04] border border-black/[0.04] rounded-full text-xs text-neutral-900 outline-none focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
              />

              {/* Voice Record Button */}
              <button
                type="button"
                onClick={startRecording}
                className="p-2 text-neutral-400 hover:text-[#FF3B30] hover:bg-black/[0.04] rounded-xl transition-all cursor-pointer shrink-0 active:scale-90"
                title="ضبط و ارسال پیام صوتی (ویس)"
              >
                <Mic size={18} />
              </button>

              {/* Send Button */}
              <button
                type="submit"
                disabled={(!inputText.trim() && pendingAttachments.length === 0) || isSending}
                className="w-9 h-9 rounded-full bg-[#007AFF] hover:bg-[#0062cc] disabled:bg-neutral-200 disabled:text-neutral-400 text-white flex items-center justify-center shadow-[0_2px_8px_rgba(0,122,255,0.25)] disabled:shadow-none transition-all cursor-pointer shrink-0 active:scale-90"
              >
                {isSending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </form>
          )}
        </footer>

      </div>

    </div>
  );
}
